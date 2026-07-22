# Schedio (app móvil)

App de productividad académica para estudiantes: gestión de asignaturas, exámenes, sesiones de estudio, gamificación y recomendaciones con IA. Construida con Expo/React Native.

## Stack

- Expo SDK 51 (React Native 0.74) — managed workflow, sin carpetas `android/`/`ios/` propias.
- Expo Router para navegación basada en archivos (`app/`).
- Firebase (Auth + Firestore + Storage) como backend.
- Zustand para estado global (`store/`).
- NativeWind (Tailwind) para estilos.
- RevenueCat para las compras de Schedio Prime.
- Google Gemini para las recomendaciones de IA.

## Requisitos

- Node (ver `.nvmrc` — usar `nvm use` si tienes nvm instalado).
- Cuenta de Expo/EAS para builds (`npx eas login`).

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y completa los valores reales (ver más abajo)
npx expo start
```

## Variables de entorno

Todas las variables usan el prefijo `EXPO_PUBLIC__` porque Expo las incluye en el bundle del cliente — **no son secretas de verdad**, así que nunca pongas ahí una clave que no puedas permitirte exponer. Ver `.env.example` para la lista completa y de dónde obtener cada una (Firebase Console, Google AI Studio, RevenueCat dashboard).

`.env.local` está en `.gitignore` — nunca se commitea.

## Scripts

```bash
npm run start     # expo start
npm run android    # expo start --android
npm run ios        # expo start --ios
npm run web        # expo start --web
npm run lint       # eslint .
```

## Builds (EAS)

Perfiles definidos en `eas.json`:

- `preview` — genera un `.apk` instalable directamente para pruebas manuales.
- `production` — genera el `.aab` para subir a Google Play.

```bash
npx eas build --profile preview --platform android
```

## Estado del proyecto

En desarrollo activo. Actualmente en Expo SDK 51; próxima migración a SDK 52/53 para cumplir el `targetSdkVersion` 35 exigido por Google Play.
