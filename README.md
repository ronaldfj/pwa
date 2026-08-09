# Fénix PWA — Instalación con Firebase Hosting (tu caso)

## Desplegar (una vez, ~5 min)
Requisito: Node.js instalado.

```bash
npm install -g firebase-tools
firebase login
cd (esta carpeta)
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
- Tus datos viven en el almacenamiento local de Safari para ese sitio.
  iOS puede purgarlo si NO usas la app por varias semanas — con uso diario no pasa,
  pero el siguiente paso recomendado es sincronizar con Firestore para blindarlo.
- Actualizaciones: cuando subamos una versión nueva (firebase deploy), ciérrala y
  ábrela dos veces para que el service worker refresque.
- Desde iOS 16.4 las PWA ancladas soportan notificaciones push (futuro recordatorio
  de mañana/noche).
