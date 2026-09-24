/* ===== Fénix · infraestructura Firebase (Auth + Firestore) =====
   Único archivo aparte de index.html permitido (ver CLAUDE.md).
   index.html mantiene el motor y toda la UI; este módulo solo expone
   autenticación y la capa de datos ("cloud"). Cargado como módulo ES
   nativo desde CDN — sin bundler, sin npm build step. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, collection, getDocs, onSnapshot,
  runTransaction, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// apiKey/authDomain/etc. son públicos por diseño en apps cliente de
// Firebase — la seguridad la da firestore.rules, no el apiKey.
// Nota: se omite deliberadamente measurementId/Analytics (regla "sin
// analítica" del CLAUDE.md del proyecto).
const firebaseConfig = {
  apiKey: "AIzaSyAiWvSl-M14yrx14UWg-Ck6Mc9pWrFQSRI",
  authDomain: "fenix-prs.firebaseapp.com",
  projectId: "fenix-prs",
  storageBucket: "fenix-prs.firebasestorage.app",
  messagingSenderId: "615912391183",
  appId: "1:615912391183:web:07490a834912728595197a"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
// Sin esto, Google reutiliza en silencio la última sesión activa del
// navegador/dispositivo: tras cerrar sesión en la app, un nuevo intento de
// "Entrar con Google" volvía a loguear la misma cuenta sin dejar elegir otra.
googleProvider.setCustomParameters({ prompt: 'select_account' });

/* ===== Auth ===== */
const ERROR_MESSAGES = {
  'auth/email-already-in-use': 'Ya existe una cuenta con este correo. Inicia sesión.',
  'auth/invalid-email': 'Ese correo no es válido.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento e intenta de nuevo.',
  'auth/account-exists-with-different-credential':
    'Ya existe una cuenta con este correo usando otro método de inicio de sesión (prueba con tu contraseña).',
  'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar. Intenta de nuevo.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana emergente de Google. Habilita popups para este sitio e intenta de nuevo.',
  'auth/cancelled-popup-request': 'Intenta de nuevo — se abrió más de una ventana de Google a la vez.',
  'auth/missing-initial-state': 'No se pudo completar el inicio de sesión con Google en esta app anclada. Intenta de nuevo o usa correo y contraseña.'
};
function authErrorMessage(e){ return ERROR_MESSAGES[e && e.code] || 'Algo salió mal. Intenta de nuevo.'; }

// Única fuente de verdad de sesión. index.html no debe pintar login ni
// dashboard antes de que esto dispare por primera vez.
export function watchAuth(onUser){ onAuthStateChanged(auth, onUser); }

// Resuelve el redirect de Google al recargar la app tras el consentimiento.
// Debe llamarse una vez al arrancar, antes de confiar en watchAuth().
export async function processRedirectResult(){
  try{ await getRedirectResult(auth); return null; }
  catch(e){ return authErrorMessage(e); }
}
export async function signUpWithEmail(email, password){
  try{ await createUserWithEmailAndPassword(auth, email, password); return null; }
  catch(e){ return authErrorMessage(e); }
}
export async function signInWithEmailPass(email, password){
  try{ await signInWithEmailAndPassword(auth, email, password); return null; }
  catch(e){ return authErrorMessage(e); }
}
export async function resetPassword(email){
  try{ await sendPasswordResetEmail(auth, email); return null; }
  catch(e){ return authErrorMessage(e); }
}
// Popup en navegador normal: evita el error "missing initial state" que
// signInWithRedirect dispara en Chrome cuando el almacenamiento entre
// sitios está particionado (sessionStorage no sobrevive el viaje de ida
// y vuelta a accounts.google.com). Redirect solo para PWA anclada a
// iPhone, donde signInWithPopup no funciona (no hay chrome de navegador
// donde abrir el popup).
function isStandalonePWA(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}
export async function signInWithGoogle(){
  if(isStandalonePWA()){
    try{ await signInWithRedirect(auth, googleProvider); return null; }
    catch(e){ return authErrorMessage(e); }
  }
  try{ await signInWithPopup(auth, googleProvider); return null; }
  catch(e){ return authErrorMessage(e); }
}
export function signOutUser(){ return signOut(auth); }

/* ===== Datos (Firestore) =====
   users/{uid}                 doc de perfil (goals, actions, affirmations, logros, subs, theme)
   users/{uid}/logs/{yyyy-MM}  un doc por mes, mapa de días adentro */
export const cloud = {
  uid: null,
  profile: null,
  logBuckets: {},           // { '2026-08': {...días...}, '2026-07': {...} }
  _unsubProfile: null,
  _unsubLogs: null,
  _onRemoteChange: null,

  // Se resuelve cuando llegan los primeros snapshots de perfil y logs
  // (rápido incluso offline, gracias a la caché local de IndexedDB).
  // onRemoteChange se invoca en cambios *posteriores* que no sean
  // escrituras propias pendientes (multi-dispositivo / multi-pestaña).
  async attach(uid, onRemoteChange){
    this.detach();
    this.uid = uid;
    this._onRemoteChange = onRemoteChange || null;
    const profileRef = doc(db, 'users', uid);
    const logsRef = collection(db, 'users', uid, 'logs');
    let profileFirst = true, logsFirst = true;
    let resolveProfile, rejectProfile, resolveLogs, rejectLogs;
    const profileReady = new Promise((res, rej) => { resolveProfile = res; rejectProfile = rej; });
    const logsReady = new Promise((res, rej) => { resolveLogs = res; rejectLogs = rej; });

    // onSnapshot nunca lanza una excepción por errores de permisos/red: los
    // reporta al segundo callback (error). Sin manejarlo explícitamente, un
    // permission-denied dejaba a cloud.attach() esperando para siempre y la
    // app se quedaba trabada en "Cargando…" sin mostrar nada.
    this._unsubProfile = onSnapshot(profileRef,
      snap => {
        this.profile = snap.exists() ? snap.data() : null;
        if(profileFirst){ profileFirst = false; resolveProfile(); }
        else if(!snap.metadata.hasPendingWrites && this._onRemoteChange) this._onRemoteChange();
      },
      err => { if(profileFirst){ profileFirst = false; err.source = 'perfil'; rejectProfile(err); } }
    );
    this._unsubLogs = onSnapshot(logsRef,
      snap => {
        snap.docChanges().forEach(ch => {
          if(ch.type === 'removed') delete this.logBuckets[ch.doc.id];
          else this.logBuckets[ch.doc.id] = ch.doc.data();
        });
        if(logsFirst){ logsFirst = false; resolveLogs(); }
        else if(!snap.metadata.hasPendingWrites && this._onRemoteChange) this._onRemoteChange();
      },
      err => { if(logsFirst){ logsFirst = false; err.source = 'logs'; rejectLogs(err); } }
    );
    await Promise.all([profileReady, logsReady]);
  },

  detach(){
    if(this._unsubProfile) this._unsubProfile();
    if(this._unsubLogs) this._unsubLogs();
    this._unsubProfile = null; this._unsubLogs = null;
    this.uid = null; this.profile = null; this.logBuckets = {}; this._onRemoteChange = null;
  },

  flatLogs(){ return Object.assign({}, ...Object.values(this.logBuckets)); },

  async saveProfile(fields){
    if(!this.uid) return;
    // Firestore rechaza escribir campos con valor undefined (a diferencia de
    // localStorage/JSON.stringify, que simplemente los omitía en silencio).
    const clean = {};
    Object.keys(fields).forEach(k => { if(fields[k] !== undefined) clean[k] = fields[k]; });
    await setDoc(doc(db, 'users', this.uid), clean, { merge: true });
  },

  // Invariante: en esta app todas las mutaciones de logs tocan solo el
  // día de hoy (ritual AM/PM, recuperación) — nunca días pasados. Si se
  // agrega edición retroactiva, esto debe ampliarse para aceptar el
  // conjunto de meses modificados.
  async saveCurrentMonthBucket(dayKey, entry){
    if(!this.uid) return;
    const month = dayKey.slice(0, 7);
    // mergeFields (no merge:true) reemplaza el mapa del día entero en vez de
    // fusionarlo campo a campo: si el motor quita `pm` o `rec` del objeto
    // local (p. ej. al pasar de recuperación a ritual completo), esa
    // eliminación debe reflejarse en Firestore y no dejar el campo viejo
    // "fantasma" mezclado con el nuevo.
    await setDoc(doc(db, 'users', this.uid, 'logs', month), { [dayKey]: entry }, { mergeFields: [dayKey] });
  },

  async deleteAllUserData(uid){
    const logsSnap = await getDocs(collection(db, 'users', uid, 'logs'));
    const batch = writeBatch(db);
    logsSnap.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, 'users', uid));
    await batch.commit();
  }
};

/* ===== Migración desde localStorage (una sola vez, por dispositivo) ===== */
const LOCAL_KEY = 'fenix-v2';
const MIGRATED_MARK_PREFIX = 'fenix-migrated-uid:';

export async function maybeMigrateFromLocalStorage(uid){
  try{
    if(localStorage.getItem(MIGRATED_MARK_PREFIX + uid)) return;
  }catch(e){ return; }

  let raw;
  try{ raw = localStorage.getItem(LOCAL_KEY); }catch(e){ return; }
  if(!raw) return;
  let local;
  try{ local = JSON.parse(raw); }catch(e){ return; }
  const hasData = local && (
    (local.actions && local.actions.length) ||
    (local.goals && local.goals.length) ||
    (local.logs && Object.keys(local.logs).length)
  );
  if(!hasData) return;

  const profileRef = doc(db, 'users', uid);
  let migrated = false;
  try{
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(profileRef);
      if(snap.exists()) return;
      const { logs, ...profileFields } = local;
      // Firestore rechaza campos con valor undefined (datos viejos de
      // localStorage pueden no tener 'theme' u otros campos más nuevos).
      const clean = {};
      Object.keys(profileFields).forEach(k => { if(profileFields[k] !== undefined) clean[k] = profileFields[k]; });
      tx.set(profileRef, Object.assign(clean, { migratedFromLocalAt: serverTimestamp() }));
      migrated = true;
    });
  }catch(e){ return; }

  if(migrated && local.logs){
    const buckets = {};
    Object.keys(local.logs).forEach(day => {
      const month = day.slice(0, 7);
      buckets[month] = buckets[month] || {};
      buckets[month][day] = local.logs[day];
    });
    const batch = writeBatch(db);
    Object.keys(buckets).forEach(month => {
      batch.set(doc(db, 'users', uid, 'logs', month), buckets[month], { merge: true });
    });
    await batch.commit();
  }

  try{ localStorage.setItem(MIGRATED_MARK_PREFIX + uid, '1'); }catch(e){}
}
