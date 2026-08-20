# Fénix PWA — Instalación con Firebase Hosting

## Prerequisito: infraestructura multiusuario (una vez, en la consola de Firebase)
1. Uso y facturación → subir el proyecto al plan **Blaze** (pay-as-you-go).
2. Firestore Database → crear base de datos en modo **Nativo**.
3. Authentication → Sign-in method → habilitar **Email/contraseña** y **Google**.
4. Project settings → General → si no hay app Web registrada, agregarla y
   copiar su config (`apiKey`, `authDomain`, `projectId`, etc.) dentro de
   `firebaseConfig` en `firebase-init.js`.

## Desplegar (una vez, ~5 min)
Requisito: Node.js instalado.

```bash
npm install -g firebase-tools
firebase login
cd (esta carpeta)
```

Tras el primer deploy, o cada vez que cambie `firestore.rules`:
```bash
firebase deploy --only firestore:rules
```

Opción recomendada — sitio nuevo dentro de tu proyecto existente (no toca tu otra app):
```bash
firebase use TU_PROYECTO_ID
firebase hosting:sites:create fenix-app        # elige el nombre que quieras
firebase target:apply hosting fenix fenix-app
firebase deploy --only hosting:fenix
```
(Para esta opción, agrega "target": "fenix" dentro de "hosting" en firebase.json.)

Opción simple — proyecto nuevo solo para Fénix:
```bash
firebase projects:create fenix-personal
firebase use fenix-personal
firebase deploy --only hosting
```

Al final te da la URL: https://TU-SITIO.web.app

## Instalar en tu iPhone
1. Abre la URL en Safari (importante: Safari, no Chrome).
2. Botón Compartir (cuadrado con flecha) → "Agregar a pantalla de inicio".
3. Listo: ícono propio, pantalla completa, funciona offline. Sin firma, sin App Store.

## Notas importantes (iOS)
- Tus datos viven en Firestore, asociados a tu cuenta (email/contraseña o
  Google) — sobreviven aunque iOS purgue el almacenamiento local del sitio.
  El dispositivo cachea localmente para funcionar offline, pero la fuente
  de verdad es la nube.
- El botón "Continuar con Google" abre un redirect, no un popup (los popups
  no funcionan en el modo standalone de una PWA anclada). Pruébalo siempre
  en el ícono anclado real, no solo en Safari normal.
- Actualizaciones: cuando subamos una versión nueva (firebase deploy), ciérrala y
  ábrela dos veces para que el service worker refresque.
- Desde iOS 16.4 las PWA ancladas soportan notificaciones push (futuro recordatorio
  de mañana/noche).
