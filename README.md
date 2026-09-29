<div align="center">

# Schedio

**Todo tu curso académico en una sola pantalla.**

App de productividad académica para estudiantes de 16 a 22 años. No enseña contenido: organiza el estudio, decide qué toca hoy y se encarga de que llegues al examen con el temario repartido.

[**Descargar en Google Play**](https://play.google.com/store/apps/details?id=com.schedio.mobile) · [**schedio.es**](https://schedio.es) · [**Instalar en iPhone**](https://schedio.es/iphone)

_En producción desde el 9 de septiembre de 2026 · versión 1.0.1 · Android, iOS (PWA) y web_

</div>

---

## El problema

Un estudiante de Bachillerato lleva entre 8 y 11 asignaturas a la vez. Sabe qué exámenes tiene y sabe que no le da tiempo, pero no sabe **qué estudiar hoy**. Las apps de tareas le piden que planifique él, que es justo lo que no sabe hacer; los calendarios le enseñan el problema sin resolverlo.

Schedio invierte la carga: tú metes las asignaturas y las fechas de examen, y la app reparte el temario en sesiones concretas, día a día, recalculando cuando algo cambia.

## Cómo se ve

|                                                            El plan, repartido por día                                                             |                                                                La sesión de estudio                                                                |
| :-----------------------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------: |
| <img src="https://schedio.es/assets/screens/playstore-02-plan-crop.png" width="260" alt="Pantalla de Plan con las sesiones repartidas por día" /> |    <img src="https://schedio.es/assets/screens/playstore-03-estudio-timer-crop.png" width="260" alt="Temporizador de sesión en modo enfoque" />    |
|                                                        **La Mochila: apuntes y archivos**                                                         |                                                            **Perfil, nivel y progreso**                                                            |
|         <img src="https://schedio.es/assets/screens/playstore-04-mochila-crop.png" width="260" alt="La Mochila con apuntes y archivos" />         | <img src="https://schedio.es/assets/screens/playstore-07-estad-sticas-crop.png" width="260" alt="Perfil con nivel, XP, insignias y asignaturas" /> |

## Qué hace

- **Plan de estudio automático.** Reparte cada examen en sesiones según la nota objetivo, la dificultad percibida, el tiempo que queda y los días que el estudiante marca como libres. Se regenera solo cuando cambian los exámenes, no cuando alguien se acuerda de pulsar un botón.
- **Sesiones de estudio con ritmo configurable.** Pomodoro, _Schedio Study_ o continuo, con descansos ajustables y notificación persistente mientras corre el cronómetro.
- **Focus Mode (Android).** Módulo nativo propio en Kotlin que silencia el ruido del móvil durante la sesión.
- **Mochila.** Apuntes y archivos por asignatura, en Firebase Storage.
- **Gamificación con reglas honestas.** Racha con días libres y comodines explícitos, rangos, XP e insignias — diseñado para que la racha no mienta ni castigue por descansar.
- **Widgets de Android** en tres tamaños: próximo examen, resumen del día y plan completo.
- **PAU.** Cuenta atrás en Inicio para 2.º de Bachillerato y calculadora de la nota de acceso con las ponderaciones reales.
- **Notificaciones** de examen próximo, reenganche y resumen semanal, servidas desde Cloud Functions programadas.
- **Español e inglés**, con fechas, días, meses y números formateados según el idioma elegido.

## Arquitectura

### Tres plataformas, un solo código

El mismo proyecto Expo compila a tres destinos, con ramas por plataforma donde no queda más remedio:

| Destino     | Cómo se entrega                                           | Notas                                                                 |
| ----------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| **Android** | Build nativa EAS → Google Play                            | Widgets, Focus Mode y Google Sign-In nativo                           |
| **iOS**     | **PWA instalable** (React Native Web, `output: "static"`) | Sin App Store: se instala desde `schedio.es/iphone`                   |
| **Web**     | El mismo bundle estático, en Firebase Hosting             | Prime no se vende aquí; el tier gratis lleva topes más altos a cambio |

La decisión de servir iOS como PWA fue deliberada: evita la cuota y la revisión de App Store, y permite desplegar una corrección en minutos en vez de días.

### El plan es determinista; la IA es un extra

Esto es a propósito y conviene subrayarlo: **el plan de estudio no lo genera un modelo de lenguaje.** Es un algoritmo en `services/priority.js` y `services/microplanService.js`, con invariantes verificadas por scripts (`npm run check:plan`) — suelo de 15 minutos por sesión, techo diario, modelado de cansancio, foco en el examen inminente. Un estudiante no puede permitirse que su plan de estudio cambie porque un modelo haya tenido un mal día, ni esperar a una llamada de red para saber qué estudiar.

La IA (Google Gemini) alimenta lo que sí gana con ella: las **recomendaciones personalizadas** de la pantalla de Inicio, que leen el patrón real de estudio del usuario.

### La capa de IA, endurecida

La clave de Gemini **nunca viaja en el bundle del cliente**. Las llamadas pasan por la Cloud Function `aiProxy`, que guarda la clave como secreto de Firebase Functions y añade tres defensas:

1. **Cuota por usuario**, para que una cuenta no se coma el presupuesto.
2. **Circuit breaker de presupuesto mensual**, que corta el gasto global antes de que se dispare.
3. **Pool de respuestas de reserva**, para que la app siga siendo útil cuando el circuito está abierto o la API falla.

### Backend

Firebase completo: Auth, Firestore, Storage y Cloud Functions en plan Blaze. Cinco funciones en producción:

| Función               | Tipo       | Qué hace                                         |
| --------------------- | ---------- | ------------------------------------------------ |
| `aiProxy`             | Callable   | Proxy de Gemini con cuota, presupuesto y reserva |
| `examAlerts`          | Programada | Avisa de los exámenes que se acercan             |
| `abandonedOnboarding` | Programada | Recupera a quien se quedó a medias del registro  |
| `reengagement`        | Programada | Reengancha cuentas inactivas                     |
| `weeklySummary`       | Programada | Resumen semanal de estudio                       |

## Stack

- **Expo SDK 54** (React Native 0.81, React 19), New Architecture activada, motor Hermes.
- **Expo Router** para navegación basada en ficheros (`app/`).
- **Requiere dev client / prebuild.** Con módulos nativos (Google Sign-In, Firebase, Notifee, widgets, Focus Mode) Expo Go ya no vale: `npm run android` / `ios` ejecutan `expo run:android` / `run:ios`.
- **Firebase** (Auth + Firestore + Storage + Functions), más `@react-native-firebase` (app + Crashlytics) para la parte nativa.
- **Zustand** para estado global (`store/`), **NativeWind** (Tailwind) para estilos, **Reanimated** para movimiento.
- **Notifee** para notificaciones locales y el servicio en primer plano de la sesión de estudio.
- **RevenueCat** para las compras de Schedio Prime.
- **i18next** para español e inglés.
- **Módulo nativo propio:** `modules/expo-focus-mode/` (Kotlin, Android).

## Puesta en marcha

Requisitos: Node `>=22.20.0` (ver `.nvmrc`), cuenta de Expo/EAS para builds, y entorno nativo de Android (o Xcode en macOS).

```bash
npm install
cp .env.example .env.local   # completa los valores reales
npm run android              # prebuild + build nativo
```

Para el target web/PWA:

```bash
npm run web                  # desarrollo
npx expo export --platform web && firebase deploy --only hosting
```

### Variables de entorno

Las variables del cliente usan el prefijo `EXPO_PUBLIC__` porque Expo **las incluye en el bundle**: no son secretas de verdad, así que nunca pongas ahí una clave que no puedas permitirte exponer. Ver `.env.example` para la lista completa y de dónde sale cada una.

La clave de Gemini es la excepción: vive como secreto de Firebase Functions (`firebase functions:secrets:set GEMINI_API_KEY`) y solo la ve la Cloud Function `aiProxy`. `.env.local` está en `.gitignore`.

## Comprobaciones de invariantes

El proyecto no se apoya en tests de interfaz: las reglas que no pueden romperse están cubiertas por scripts que fallan el commit si alguien las viola.

```bash
npm run lint                  # eslint
npm run check:plan            # invariantes del algoritmo de planificación
npm run check:streak-rules    # reglas de racha, días libres y comodines
npm run check:pau             # ponderaciones y cálculo de la nota de acceso
npm run check:locale-format   # formato de fechas y números por idioma
npm run check:widgets         # datos que alimentan los widgets de Android
npm run check:subject-colors  # contraste mínimo de la paleta de asignaturas
npm run check:tab-bar         # geometría de la barra inferior
npm run check:plan-screen     # presentación de la pantalla de Plan
npm run check:plan-profile    # perfil de planificación del estudiante
npm run check:fab-springs     # animación del botón central
npm run check:tour            # pasos del tour guiado
```

## Builds (EAS)

Perfiles en `eas.json`:

- `development` — dev client interno (`developmentClient: true`), `.apk`.
- `preview` — `.apk` instalable para pruebas manuales.
- `production` — subida a Google Play, con autoincremento de versión.

```bash
npx eas build --profile production --platform android
```

## Privacidad y cumplimiento

Aprobado por revisión de Google Play. Los permisos de Android están recortados al mínimo real (POST_NOTIFICATIONS y el servicio en primer plano de la sesión de estudio), con `blockedPermissions` cerrando el almacenamiento externo, las alarmas exactas y las ventanas flotantes que arrastraban las dependencias.

- [Política de privacidad](https://schedio.es/privacidad) · [Términos de servicio](https://schedio.es/terminos)
- Verificación de email obligatoria en el registro con contraseña.
- Borrado de cuenta y de todos sus datos desde Ajustes (`services/account.js`).

## Estructura

```
app/          Rutas de Expo Router (Inicio, Plan, Estudio, Perfil, PAU…)
components/   Componentes compartidos del design system
services/     Lógica de negocio: plan, racha, IA, auth, notificaciones, PAU
store/        Estado global (Zustand)
functions/    Cloud Functions (aiProxy + 4 programadas)
modules/      Módulo nativo de Focus Mode (Kotlin)
widgets/      Widgets de pantalla de inicio de Android
i18n/         Traducciones es/en
scripts/      Comprobaciones de invariantes
theme/        Tokens del Schedio Design System
legal/        Política de privacidad y términos
```

## Estado

En producción y en uso diario. Publicada en el canal de producción de Google Play y disponible en iPhone como PWA instalable. El foco actual es adquisición y crecimiento, no infraestructura.
