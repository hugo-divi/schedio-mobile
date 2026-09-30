<div align="center">

# Schedio

**Your whole school year on a single screen.**

A study-planning app for students aged 16 to 22. It doesn't teach you the material — it organises your studying, tells you what to work on today, and makes sure you reach exam day with the syllabus actually covered.

[**Get it on Google Play**](https://play.google.com/store/apps/details?id=com.schedio.mobile) · [**schedio.es**](https://schedio.es) · [**Install on iPhone**](https://schedio.es/iphone)

_Live in production since 9 September 2026 · version 1.0.1 · Android, iOS (PWA) and web_

📄 [Leer este README en español](README.es.md)

</div>

---

## The problem

A Spanish high-school student juggles between 8 and 11 subjects at once. They know which exams are coming and they know there isn't enough time, but they don't know **what to study today**. To-do apps ask them to plan it themselves, which is precisely the thing they can't do; calendars show them the problem without solving it.

Schedio flips the burden. You enter your subjects and your exam dates, and the app breaks the syllabus down into concrete sessions, day by day, recalculating whenever something changes.

> **Note for reviewers:** the app ships in Spanish by default because its audience is students in Spain, but it has a full English mode — **Settings → Language → English**.

## What it looks like

|                                                         The plan, spread across your days                                                          |                                                                     A study session                                                                     |
| :------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------: |
| <img src="https://schedio.es/assets/screens/playstore-02-plan-crop.png" width="260" alt="The Plan screen, with sessions spread across the days" /> |        <img src="https://schedio.es/assets/screens/playstore-03-estudio-timer-crop.png" width="260" alt="A study session timer in focus mode" />        |
|                                                         **The Backpack: notes and files**                                                          |                                                             **Profile, level and progress**                                                             |
|       <img src="https://schedio.es/assets/screens/playstore-04-mochila-crop.png" width="260" alt="The Backpack, holding notes and files" />        | <img src="https://schedio.es/assets/screens/playstore-07-estad-sticas-crop.png" width="260" alt="Profile screen with level, XP, badges and subjects" /> |

## What it does

- **Automatic study plan.** Splits each exam into sessions based on the grade you're aiming for, how hard you find the subject, how much time is left, and the days you mark as off. It regenerates when your exams change, not when someone remembers to press a button.
- **Study sessions with a configurable rhythm.** Pomodoro, _Schedio Study_ or continuous, with adjustable breaks and a persistent notification while the timer runs.
- **Focus Mode (Android).** A custom native Kotlin module that silences the phone's noise for the duration of a session.
- **The Backpack.** Notes and files per subject, stored in Firebase Storage.
- **Gamification with honest rules.** Streaks with explicit rest days and freezes, ranks, XP and badges — designed so the streak never lies to you or punishes you for taking a break.
- **Android home-screen widgets** in three sizes: next exam, today's summary, and the full plan.
- **University-entrance exams (PAU).** A countdown on the home screen for final-year students, and a calculator for the entrance grade using the real subject weightings.
- **Notifications** for upcoming exams, re-engagement and a weekly summary, served from scheduled Cloud Functions.
- **Spanish and English**, with dates, weekdays, months and numbers all formatted to match the chosen language.

## Architecture

### Three platforms, one codebase

The same Expo project builds for three targets, branching per platform only where there's no way around it:

| Target      | How it ships                                               | Notes                                                         |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| **Android** | Native EAS build → Google Play                             | Widgets, Focus Mode and native Google Sign-In                 |
| **iOS**     | **Installable PWA** (React Native Web, `output: "static"`) | No App Store: installed from `schedio.es/iphone`              |
| **Web**     | The same static bundle, on Firebase Hosting                | Prime isn't sold here; the free tier gets higher caps instead |

Serving iOS as a PWA was a deliberate call: it sidesteps the App Store fee and review, and it means a fix ships in minutes instead of days.

### The plan is deterministic; the AI is a bonus

This is on purpose and worth spelling out: **the study plan is not generated by a language model.** It's an algorithm living in `services/priority.js` and `services/microplanService.js`, with its invariants verified by scripts (`npm run check:plan`) — a 15-minute floor per session, a daily ceiling, fatigue modelling, and focus on whichever exam is closest. A student can't afford a study plan that shifts because a model had an off day, or that makes them wait on a network round-trip to find out what to revise.

The AI (Google Gemini) powers the part that genuinely benefits from it: the **personalised recommendations** on the home screen, which read the student's actual study patterns.

### The AI layer, hardened

The Gemini key **never travels in the client bundle**. Calls go through the `aiProxy` Cloud Function, which holds the key as a Firebase Functions secret and adds three defences:

1. **A per-user quota**, so one account can't eat the budget.
2. **A monthly budget circuit breaker**, cutting off global spend before it runs away.
3. **A fallback response pool**, so the app stays useful when the circuit is open or the API fails.

### Backend

Firebase throughout: Auth, Firestore, Storage and Cloud Functions on the Blaze plan. Five functions in production:

| Function              | Type      | What it does                                      |
| --------------------- | --------- | ------------------------------------------------- |
| `aiProxy`             | Callable  | Gemini proxy with quota, budget cap and fallbacks |
| `examAlerts`          | Scheduled | Warns about exams that are coming up              |
| `abandonedOnboarding` | Scheduled | Recovers people who dropped out mid-signup        |
| `reengagement`        | Scheduled | Re-engages inactive accounts                      |
| `weeklySummary`       | Scheduled | Weekly study recap                                |

## Stack

- **Expo SDK 54** (React Native 0.81, React 19), New Architecture enabled, Hermes engine.
- **Expo Router** for file-based navigation (`app/`).
- **Dev client / prebuild required.** With native modules in play (Google Sign-In, Firebase, Notifee, widgets, Focus Mode) Expo Go no longer cuts it: `npm run android` / `ios` run `expo run:android` / `run:ios`.
- **Firebase** (Auth + Firestore + Storage + Functions), plus `@react-native-firebase` (app + Crashlytics) for the native side.
- **Zustand** for global state (`store/`), **NativeWind** (Tailwind) for styling, **Reanimated** for motion.
- **Notifee** for local notifications and the study session's foreground service.
- **RevenueCat** for Schedio Prime purchases.
- **i18next** for Spanish and English.
- **Custom native module:** `modules/expo-focus-mode/` (Kotlin, Android).

## Getting started

Requirements: Node `>=22.20.0` (see `.nvmrc`), an Expo/EAS account for builds, and a native Android environment (or Xcode on macOS).

```bash
npm install
cp .env.example .env.local   # fill in the real values
npm run android              # prebuild + native build
```

For the web/PWA target:

```bash
npm run web                  # development
npx expo export --platform web && firebase deploy --only hosting
```

### Environment variables

Client variables use the `EXPO_PUBLIC__` prefix because Expo **bakes them into the bundle**: they aren't truly secret, so never put a key there that you can't afford to expose. See `.env.example` for the full list and where each one comes from.

The Gemini key is the exception: it lives as a Firebase Functions secret (`firebase functions:secrets:set GEMINI_API_KEY`) and only the `aiProxy` Cloud Function ever sees it. `.env.local` is gitignored.

## Invariant checks

This project doesn't lean on UI tests. The rules that must never break are covered by scripts that fail the commit if anyone violates them.

```bash
npm run lint                  # eslint
npm run check:plan            # study-planning algorithm invariants
npm run check:streak-rules    # streak, rest-day and freeze rules
npm run check:pau             # entrance-exam weightings and grade maths
npm run check:locale-format   # date and number formatting per language
npm run check:widgets         # the data feeding the Android widgets
npm run check:subject-colors  # minimum contrast across the subject palette
npm run check:tab-bar         # bottom bar geometry
npm run check:plan-screen     # Plan screen presentation
npm run check:plan-profile    # the student's planning profile
npm run check:fab-springs     # centre button animation
npm run check:tour            # guided tour steps
```

## Builds (EAS)

Profiles live in `eas.json`:

- `development` — internal dev client (`developmentClient: true`), `.apk`.
- `preview` — an installable `.apk` for manual testing.
- `production` — Google Play upload, with version auto-increment.

```bash
npx eas build --profile production --platform android
```

## Privacy and compliance

Approved by Google Play review. Android permissions are trimmed to what's actually used (POST_NOTIFICATIONS and the study session's foreground service), with `blockedPermissions` shutting out external storage, exact alarms and the floating-window permissions that dependencies dragged in.

- [Privacy policy](https://schedio.es/privacidad) · [Terms of service](https://schedio.es/terminos)
- Email verification is mandatory for password signups.
- Account and full data deletion from Settings (`services/account.js`).

## Project layout

```
app/          Expo Router routes (Home, Plan, Study, Profile, PAU…)
components/   Shared design-system components
services/     Business logic: planning, streaks, AI, auth, notifications, PAU
store/        Global state (Zustand)
functions/    Cloud Functions (aiProxy + 4 scheduled)
modules/      Focus Mode native module (Kotlin)
widgets/      Android home-screen widgets
i18n/         es/en translations
scripts/      Invariant checks
theme/        Schedio Design System tokens
legal/        Privacy policy and terms
```

## Licence

[Apache License 2.0](LICENSE). You may use, modify and redistribute the code, keeping attribution and the required notices.

The name "Schedio", its logo and its visual identity fall outside the licence and remain the property of Schedio — see [NOTICE](NOTICE). If you publish a derivative work, publish it under a different name.

## Status

Live and in daily use. Published on Google Play's production channel and available on iPhone as an installable PWA. The current focus is growth and acquisition, not infrastructure.
