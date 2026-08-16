# Schedio (app móvil)

App de productividad académica para estudiantes: gestión de asignaturas, exámenes, sesiones de estudio, gamificación y recomendaciones con IA. Construida con Expo/React Native.

## Stack

- Expo SDK 54 (React Native 0.81, React 19) — New Architecture activada.
- Requiere **dev client / prebuild**: al usar módulos nativos (Google Sign-In, Firebase, Notifee) ya no vale Expo Go. `npm run android`/`ios` ejecutan `expo run:android`/`run:ios`, que generan `android/`/`ios/` vía prebuild (carpetas gitignored, no se commitean).
- Expo Router para navegación basada en archivos (`app/`).
- Firebase (Auth + Firestore + Storage) como backend, más `@react-native-firebase` (app + Crashlytics) para las partes nativas.
- Cloud Functions (`functions/`) — la función `aiProxy` guarda la key de Gemini como secreto de Firebase Functions y hace de proxy; la clave nunca viaja en el bundle del cliente.
- Google Sign-In nativo vía `@react-native-google-signin/google-signin`.
- Notifee (`@notifee/react-native`) para notificaciones locales.
- Zustand para estado global (`store/`).
- NativeWind (Tailwind) para estilos.
- RevenueCat para las compras de Schedio Prime.
- Google Gemini (vía Cloud Function `aiProxy`) para las recomendaciones de IA.

## Requisitos

- Node `>=22.20.0` (ver `.nvmrc` — usar `nvm use` si tienes nvm instalado).
- Cuenta de Expo/EAS para builds (`npx eas login`).
- Entorno nativo de Android (y/o Xcode en macOS) configurado para `expo run:android`/`run:ios`, ya que el proyecto usa dev client.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y completa los valores reales (ver más abajo)
npx expo start
```

## Variables de entorno

Todas las variables usan el prefijo `EXPO_PUBLIC__` porque Expo las incluye en el bundle del cliente — **no son secretas de verdad**, así que nunca pongas ahí una clave que no puedas permitirte exponer. Ver `.env.example` para la lista completa y de dónde obtener cada una (Firebase Console, RevenueCat dashboard, Google Cloud Console para el Web Client ID de Google Sign-In).

La key de Gemini es la excepción: no es una variable `EXPO_PUBLIC__`, vive como secreto de Firebase Functions (`firebase functions:secrets:set GEMINI_API_KEY`) y solo la usa la Cloud Function `aiProxy`.

`.env.local` está en `.gitignore` — nunca se commitea.

## Scripts

```bash
npm run start      # expo start
npm run android     # expo run:android (prebuild + build nativo)
npm run ios         # expo run:ios
npm run web         # expo start --web
npm run lint        # eslint .
npm run check:plan  # valida invariantes del algoritmo de planificación (services/priority.js, taskCopy.js, microplanService.js)
```

## Builds (EAS)

Perfiles definidos en `eas.json`:

- `development` — dev client interno (`developmentClient: true`), `.apk`.
- `preview` — genera un `.apk` instalable directamente para pruebas manuales.
- `production` — build de subida a Google Play, con autoincremento de versión.

```bash
npx eas build --profile preview --platform android
```

## Estado del proyecto

En desarrollo activo, en beta privada Android vía APK (aún no publicada en Play Store). Migrado a Expo SDK 54 con `compileSdkVersion`/`targetSdkVersion` 36, cumpliendo el requisito de Google Play. Foco actual: checkpoint de compliance para Play Store (permisos, política de privacidad, términos de servicio, verificación de email y Google Sign-In nativo, borrado de cuenta).
