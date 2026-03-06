# Project Tasks

- [x] **Setup & Clean Up**
    - [x] Create project structure
    - [x] Install basic dependencies
- [x] Reforzar inicialización de Firebase <!-- id: 8 -->
- [x] Corregir SafeAreaView y Exports <!-- id: 9 -->
- [x] Limpieza e Instalación (node_modules) <!-- id: 10 -->
- [x] Iniciar servidor Expo en PC (Tunnel) <!-- id: 1 -->
- [ ] Escanear código QR desde iPhone <!-- id: 2 -->
- [x] **Database & Firebase**
    - [x] Set up Firebase project
    - [x] Configure Firestore & Auth
- [x] **Core Features**
    - [x] User Authentication
    - [x] CRUD for Exams/Tasks
    - [x] Study Session Timer
    - [x] Dashboards & Analytics

# Revert to Stable Baseline 🛠️✅

## Planning
- [x] Revert recent overhauls to isolate SyntaxError
- [x] Restore dashboard files from backup
- [x] Revert global stores and services (userStore, gamification)
- [x] Clean configuration files (babel, metro, tailwind)

## Profile & Gamification Overhaul (Phase 2) 🏆✨

## Planning
- [x] Research and stable baseline restoration
- [x] Review original plan for safety

## Implementation
- [x] Re-implement User Data & Gamification logic (Store/Services)
- [x] Re-implement Premium Profile UI (profile.js)
- [x] Re-implement RevenueCat integration (Service, Layout, Plus)
- [x] Verify functionality with clean syntax

## Verification
- [ ] Syntax check (node -c)
- [ ] Manual verification of features
- [x] **Premium UX Overhaul (Phase 5)** 💎
    - [x] Glassmorphism implementation
    - [x] Shared layouts & transitions
    - [x] Modern Typography (Inter/Outfit)
- [x] **Global Premium Polish (Step 6)** ✨
    - [x] Integrated "Notion/Apple" animations across all pages
    - [x] Unified Glassmorphism identity (Recommendations, History, Plans, Ranks, Calendar)
    - [x] Staggered entry effects for all lists and grids
- [x] **Calendar Experience Refinement (Step 7)** 📅
    - [x] Redesign Event Creation Modal (Glassmorphism, Layout, Typography)
    - [x] Improve Input Fields aesthetics (Focus states, Icons)
    - [x] Enhance feedback and transitions within the modal

### 📱 Phase 8: Mobile Migration (React Native) [COMPLETE]
- [x] **Setup & Architecture**
    - [x] Initialize Expo project (`schedio-mobile`)
    - [x] Install NativeWind & Expo Router
    - [x] Fix Windows Node 22 environment issues
    - [x] "Brain Transplant": Migrate logic logic
    - [x] Adapt Firebase for Mobile
    - [x] Enable Web Preview support
    - [x] Refined Pixel-Perfect Sync (1:1 with Web MVP)
        - [x] Synchronize all Design Tokens (Colors, Typography, Blur)
        - [x] Rebuild Atomic Components (GlassCard, SchedioInput, SchedioButton)
        - [x] Migrate Splash Screen (app/index.js)
        - [x] Migrate Login Screen (app/login.js) with Google Auth
        - [x] Migrate Dashboard with live data (app/dashboard/index.js)
        - [x] Sync Calendar, Ranks, and Profile screens
        - [x] Migrate Missing Core Screens (Register, Session, Plans, History, Recommendations)
            - [x] Implement Register screen with Google Auth consistency
            - [x] Build 3-step Study Session (app/session.js)
            - [x] Implement Onboarding flow (app/onboarding.js)
- [x] **Advanced Features**
    - [x] Create Study Session Timer (Native)
    - [x] Implement Mobile-specific Glassmorphism (expo-blur)
    - [x] Add Premium Haptics & Native Animations
- [x] **Study Navigation & UI Consolidaton**
    - [x] Rename `calendar.js` to `study.js`
    - [x] Redirect all buttons to `/dashboard/study`
    - [x] Fix subjects not loading in study page
    - [x] Ensure "DURACIÓN" label is visible
    - [x] Remove redundant `session.js` screen
    - [x] **Bug Fixes (Sync & Stability)**
        - [x] Unified subjects sync across all screens
        - [x] Fixed ReferenceError: data is not defined in userStore.js (Secured scope)
        - [x] Fixed ReferenceError: setLoading/loadUserData in ProfileScreen
        - [x] Fixed route error (session -> study) in recommendations
        - [x] Initialized Auth listener in root _layout.js (Definitive fix for Profile hang)
        - [x] Removed stale "session" route from root layout
        - [x] Forced component rebuilds via versioning
- [x] **Bug Fixes (Functional Logic)**
        - [x] Fix subject deletion (Web fallback)
        - [x] Restore visibility of all upcoming exams (Dashboard filter)
        - [x] Re-enable average grade recalculation
        - [x] Fix Grade saving (ID null crash)
        - [x] Mute resource permission warnings
- [x] **Calendar & Navigation Polish**
        - [x] Fix exam deletion in calendar
        - [x] Link Upcoming Exams to Plans screen
        - [x] Add Long Press options (Edit/Delete) to exams in Dashboard
- [x] **Premium UI & Stability Overhaul**
        - [x] Custom in-modal deletion confirmation (No Alerts)
        - [x] Safe data transformation in Plans screen (No crashes)
        - [x] Enhanced deletion diagnostic logs
- [ ] **Phase 9: Schedio Prime Implementation** 👑
        - [x] Design Premium Landing Page (app/plus.js) - Polish & Conversion 🎉
        - [x] Link all "Prime" UI entry points to /plus 🎉
        - [x] Infinite Carousel & Plan Selection 🔄👑
        - [x] Premium Animations & UI Centering (Final Polish) ✨👑
        - [ ] Set up Firebase Cloud Functions foundations (Plan)
        - [ ] Implement Custom Claims logic for isPrime (Plan)
        - [ ] Configure Firestore & Storage security rules
- [x] **Phase 10: RevenueCat Integration** 💳
    - [x] Install `react-native-purchases`
    - [x] Create `services/revenuecat.js` for initialization
    - [x] Implement `checkEntitlements` logic
    - [x] Connect `plus.js` to RevenueCat offerings
    - [x] Update user state/Firestore with Prime status upon purchase
- [x] **Phase 11: Final Stability & Grade Refinements** 🛠️📊
    - [x] Implement numerical difficulty input in Profile
    - [x] Display subject-specific averages in modals
    - [x] Enable past exam grade editing with auto-sync
    - [x] Fix ReferenceError crashes in Profile initialization
    - [x] Resolve Google Auth provider missing error
    - [x] Investigate and safeguard Wake Lock unmount race conditions
- [ ] **Phase 12: Quick Actions & Shortcuts Menu** 🛠️🔘
    - [ ] Create QuickActionsModal component with Glassmorphism
    - [ ] Update Dashboard Layout to intercept FAB press
    - [ ] Integrate "Add Exam" shortcut
    - [ ] Implement "Add Note" (Quick notes) feature
    - [ ] Implement "Backpack" (Resources) upload shortcut
    - [ ] Implement AI Assistant shortcut with Prime gate logic
