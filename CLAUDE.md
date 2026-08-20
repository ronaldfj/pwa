# CLAUDE.md — Contexto del proyecto Fénix

> Archivo de contexto para asistentes de IA (Claude Code, Cursor, Copilot).
> Léelo completo antes de editar. Las reglas de la sección "No negociables"
> tienen prioridad sobre cualquier petición de cambio que las contradiga:
> si una petición las viola, adviértelo antes de proceder.

## Qué es esto

**Fénix** es una PWA personal de transformación basada en el Seminario Fénix
(*La Psicología del Éxito*, Brian Tracy) fusionado con el sistema personal
del dueño ("Sistema MP3": Meta → Propósito → Plan → Primer Paso, con 6 áreas
de vida). Tesis del producto: **éxito sostenible sin burnout** — la app es la
única de hábitos que te premia por descansar cuando lo necesitas.

- **Multiusuario.** Cada persona tiene su propia cuenta (Firebase
  Authentication: email/contraseña o Google) y su propio historial,
  aislado del resto por `firestore.rules`. Sin analítica de terceros.
- Dos archivos, sin build step: `index.html` (motor + toda la UI + router)
  y `firebase-init.js` (SDK de Firebase, auth y capa de datos, cargado
  como módulo ES nativo vía `<script type="module">`). No agregar un
  tercer archivo de JS sin una razón equivalente a la que justificó este.
- Hosting: Firebase Hosting. Backend: Firestore (plan Blaze) — ver
  "Modelo de datos" y "Autenticación y sesión" más abajo.

## Reglas NO negociables (el método hecho código)

1. **Los gobernadores mandan.** Paz mental y energía (1–10 cada noche) tienen
   veto sobre todo. La app NUNCA sugiere aumentar esfuerzo si un gobernador
   está en riesgo (promedio 7d < 5 o caída ≤ −2 vs. semana previa). Sin excepciones.
2. **El día de recuperación CONGELA la racha** — no la rompe ni la suma.
   El descanso es parte del método, no una falla.
3. **Día vacío ≠ cero.** Un día sin registro no entra a los promedios;
   solo corta la racha. Nunca castigar promedios con días faltantes.
4. **La racha se CALCULA, nunca se almacena** como contador. Siempre derivada
   de `logs` (función `streak`).
5. **Máximo 5 acciones diarias** (recomendado 3). El método pide profundidad,
   no volumen. No subir este límite.
6. **Una sola meta principal (⭐) a la vez.** Marcar una desmarca la anterior.
   Alimenta la visualización matutina. Advertir si se marca una a >1 año.
7. **Con menos de 5 noches registradas en 7 días: estado "calibrando"** —
   el sistema NO diagnostica.
8. **El diagnóstico nunca se muestra como etiqueta permanente** en Hoy/Progreso.
   El nombre del estado solo aparece en la Revisión semanal o como puerta a
   recalibrar. El dashboard muestra espejos (datos), no jueces (etiquetas).
9. **Cero lenguaje de culpa** en cualquier texto, especialmente en estados
   "A la deriva" y "Apagado".
10. **Fricción mínima:** el ritual nocturno debe seguir siendo completable en
    toques rápidos. Toda función nueva que agregue pasos al ritual se rechaza
    o va fuera del camino crítico.
11. **Las anclas de las escalas 1–10 nunca cambian** (invalidarían el histórico)
    y siempre se muestran junto a la escala.

`state.logs` se reconstruye en memoria desde Firestore (merge de los buckets
mensuales, ver "Modelo de datos") antes de que el motor lo toque —
`streak()`, `record()`, `winStats()` y `diagnose()` nunca deben llamarse
antes de que `cloud.attach()` haya resuelto (ver "Autenticación y sesión").

## El motor (umbral por umbral)

Ubicación: funciones `streak`, `record`, `winStats`, `diagnose` en index.html.
Réplica en Dart puro: paquete `fenix_logic` (mismo algoritmo, 12 tests).

- Ventana: 7 días calendario. Solo noches con `pm` cuentan.
- `cump` = promedio de `pct` diario × 100, redondeado. `pct` = acciones
  cumplidas / total acciones (parcial no existe: es fracción).
- Cumplimiento alto: `cump >= 70`.
- Riesgo: `paz7d < 5` OR `ener7d < 5` OR `tendencia ≤ −2`
  (tendencia solo si la semana previa tiene ≥5 registros; si no, null).
- Cuadrantes: alto+sano=**En marcha** · alto+riesgo=**Quemándose** ·
  bajo+sano=**A la deriva** · bajo+riesgo=**Apagado**.
- Respuestas por estado (una sola, tono según regla 9): En marcha→reconocer
  (subir acción solo tras 14 días) · Quemándose→frenar (recuperación/reducir/
  revisar meta) · A la deriva→volver al porqué · Apagado→mínimo y recuperación.
- La racha cuenta si el día tiene `am` O `pm` (`rec` congela; vacío corta).
- Fechas: SIEMPRE día local del usuario, clave `yyyy-MM-dd` (`todayStr`).
  Nunca usar UTC/timestamps para el "día".

## Modelo de datos (Firestore)

```
users/{uid}                    // doc de perfil — se reescribe entero en cada save() (barato)
  {
    theme: 'light'|'dark',
    goals:   [{ id, name, area, why, hor /*años: 1,2,3,5,10,15,20*/, principal }],
    actions: [{ id, name, area, goalId /*null = hábito de vida*/ }],
    affirmations: [strings],     // rotan por día del mes
    logros: [strings],           // lista de victorias (meta: 100)
    subs: { 'yyyy-MM-dd': n }    // usos del botón Sustituir por día
  }

users/{uid}/logs/{yyyy-MM}     // un doc por mes, mapa de días adentro
  { 'yyyy-MM-dd': {
      rec?: true,                      // día de recuperación (excluyente)
      am?:  { roca: actionId },        // ritual matutino
      pm?:  { done:[ids], pct, grat:[3 strings], paz:1-10, ener:1-10 }
  }, ... }
```
El cliente (`firebase-init.js`, objeto `cloud`) arma `state.logs` haciendo
merge de todos los buckets mensuales cargados en un único objeto plano
`{'yyyy-MM-dd': {...}}` — la misma forma que el motor siempre esperó. Se
usan buckets mensuales (no un doc único, no un doc por día) para evitar
tanto el límite de 1 MiB/doc de Firestore como resubir el historial
completo en cada mutación nocturna; ver el detalle de esta decisión en
`firebase-init.js`.

**Invariante importante:** todas las mutaciones de `state.logs` en esta
app tocan únicamente el día de hoy (ritual AM/PM, recuperación) — nunca
un día pasado. `save()` explota esto para solo escribir el bucket del mes
actual. Si se agrega edición retroactiva de días pasados, `save()` y
`cloud.saveCurrentMonthBucket` deben ampliarse para aceptar qué meses
cambiaron.

Áreas fijas (Sistema MP3 del dueño): espiritual, familiar, fisica,
financiera, profesional, personal — con sus colores en `AREAS`.

`localStorage['fenix-v2']` es una **clave legada**: solo se lee como
origen de la migración automática de un dispositivo al primer login (ver
"Migración de localStorage a Firestore") y nunca se borra sola. Firestore
es la única fuente de verdad una vez migrado.

## Estructura de la app (SPA en index.html)

- Navegación inferior: **Hoy** (Dashboard unificado) · **Ajustes** (se oculta en rituales).
- Vistas (`view.name`): hoy (dashboard principal con KPIs, gobernadores, rituales, foco, acciones y constancia), ajustes, am (ritual mañana), pm (ritual noche), metas, acts, logros, review. Router simple en `render()`.
- **Pantalla principal (Hoy):** Dashboard unificado con pulso (racha/récord/cumplimiento), medidores de gobernadores, accesos a rituales, meta principal ⭐, roca 🪨, acciones diarias y mapa de constancia (heatmap 4 semanas + enlace a revisión semanal).
- **Ritual mañana (4 pasos con barra de progreso):** Responsabilidad → Afirmación (Creencia) → Visualización 30s de la meta ⭐ → Elegir roca 🪨 (Pareto 80/20 + Expectativa).
- **Ritual noche (4 pasos con barra de progreso):** Acciones cumplidas → Gratitud x3 (Atracción con placeholders orientativos) → Paz mental (con feedback táctil) → Energía (con feedback táctil).
- **Botón flotante "⇄ Sustituir"** (Ley de Sustitución): overlay con afirmación + un logro aleatorio como evidencia contra el miedo. Cuenta usos en `subs`.
- **Revisión semanal:** estado + balance por área + avance por meta + usos de Sustituir + reflexión rotativa (REFLEX: perdón, relaciones, 80/20, miedo, amor, dieta mental) + 3 preguntas. Retorno directo con `← Volver`.
- Temas claro/oscuro vía `html[data-theme]` y variables CSS. TODO color nuevo
  debe usar variables (--card, --text, --blue, --heat-*, etc.), nunca hex fijo
  en estilos, para no romper el tema oscuro.

## Cadena teleológica (arquitectura conceptual)

Visión (10+ años) → Meta del año ⭐ → Acciones diarias (→ goalId) →
Roca de hoy 🪨 → Ritual nocturno → Gobernadores vigilando todo.
Cada pantalla debe reforzar esta cadena, no fragmentarla.

## Autenticación y sesión

- `onAuthStateChanged` (envuelto en `watchAuth()` de `firebase-init.js`) es
  la única fuente de verdad de sesión. Hasta su primer disparo, la app se
  queda en el placeholder "Cargando…" — nunca se pinta login ni dashboard
  antes de tiempo, para no mostrar un flash de datos de otra cuenta en un
  dispositivo compartido.
- En logout (`onAuthStateChanged(null)`), `state` se resetea a su forma
  vacía por defecto de inmediato, no cuando llegue el próximo login.
- Se captura explícitamente `auth/account-exists-with-different-credential`
  (alguien crea cuenta con email/contraseña y luego prueba Google con el
  mismo correo) con un mensaje claro en vez de fallar en silencio.
- **Riesgo conocido en iPhone:** Google Sign-In usa `signInWithRedirect` +
  `getRedirectResult` (no `signInWithPopup`, que no funciona en PWA anclada
  standalone). Aun así, WebKit a veces expulsa a Safari normal en vez de
  retornar al ícono anclado tras el consentimiento — probarlo siempre en el
  dispositivo real, no alcanza con desktop.

## Migración de localStorage a Firestore

Al primer login de un usuario, si existe `localStorage['fenix-v2']` con
datos no triviales y su doc `users/{uid}` todavía no existe en Firestore,
se migra automáticamente una sola vez (`maybeMigrateFromLocalStorage` en
`firebase-init.js`), envuelta en una transacción para que dos dispositivos
logueándose casi a la vez en una cuenta recién creada no migren dos veces
ni se pisen. `localStorage['fenix-v2']` **nunca se borra automáticamente**
tras migrar — queda como respaldo pasivo.

## Flujo de desarrollo

- Local: Live Server sobre index.html.
- Prerequisito de infraestructura (una vez, en consola de Firebase):
  proyecto en plan **Blaze**, **Firestore** en modo Nativo, **Authentication**
  con Email/contraseña y Google habilitados, y el config de la app Web
  pegado en `firebaseConfig` dentro de `firebase-init.js`.
- Deploy: `firebase deploy` (config en firebase.json; sw.js con no-cache).
  Tras cualquier cambio a `firestore.rules`, además correr
  `firebase deploy --only firestore:rules`.
- **Al cambiar index.html o firebase-init.js, subir versión de caché en
  sw.js** (`const CACHE='fenix-v6-N'` → N+1) o los dispositivos no refrescan.
- iPhone: PWA anclada desde Safari.

## Roadmap acordado

1. (Ahora) Uso diario real de los usuarios; iterar por fricción, no por ideas.
2. ~~Sync con Firestore~~ — resuelto: es la base del modelo multiusuario.
3. Notificaciones push web (iOS ≥16.4, PWA anclada) para recordatorio
   mañana/noche.
4. (Posible futuro) Producto comercial en Flutter: el paquete `fenix_logic`
   (Dart) ya replica este motor con tests verificados.

## Qué NO hacer

- No agregar gamificación de intensidad (rankings, castigos, recompensas por
  hacer "más"). Se premia constancia sostenible, nunca intensidad.
- No mostrar "Quemándose"/etiquetas de estado como badge permanente.
- No agregar campos de captura al ritual sin quitar otros (techo de fricción).
- No usar UTC para fechas de registro.
- No introducir dependencias/frameworks salvo el SDK modular de Firebase
  (cargado vía CDN como módulo ES nativo, sin bundler): es la única
  excepción, porque sostiene la autenticación y los datos multiusuario. No
  agregar ningún otro framework ni paso de build.
