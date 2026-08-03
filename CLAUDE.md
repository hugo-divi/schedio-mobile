# Schedio — Contexto para agentes de código

App de productividad académica con IA para estudiantes de 16-22 años (Bachillerato, ESO, universidad) en España. Filosofía: "Que el estudio sea fácil" — la app organiza el estudio, no enseña contenido. Hook principal: "todo tu curso académico en una única pantalla."

## Stack técnico (real, verificado julio 2026)

- Frontend: React Native + Expo
- Backend: **Firebase** (Auth + distribución APK actual) — NO Supabase. Migración a Supabase evaluada solo como posibilidad futura si la app escala; no es prioridad y no debe asumirse en ninguna estimación de tiempo hasta nueva orden explícita.
- Emails: Resend
- Landing: migrando de Odoo a HTML/CSS estático en GitHub Pages

## Estado actual (julio 2026)

MVP funcional en beta privada Android vía APK, no publicada en Play Store.
Ya implementado: registro/login, asignaturas, Mochila básica, pantalla principal, flujo de organización inicial.

## PRIORIDAD ACTUAL — Checkpoint 1 (Play Store compliance)

Este es el bloqueante activo ahora mismo, por delante de cualquier feature nueva:

1. Auditar permisos declarados en `app.json` / AndroidManifest — deben coincidir exactamente con lo que la app usa
2. Política de privacidad — adaptar borrador existente (de Tribo) a Schedio: qué datos se recogen (email, progreso académico, asignaturas), con quién se comparten (Firebase, Resend), opción de borrado
3. Términos de servicio — mismo tratamiento
4. Enlazar ambas políticas en landing (GitHub Pages) y en pantalla de registro/perfil de la app
5. Auth conforme a políticas de datos de Google con Firebase Auth:
   - Verificación de email en registro — HECHO, en `master`. Corrección a esta misma lista: no era solo config — Firebase no bloquea por sí solo el login de una cuenta no verificada, así que hizo falta código (`sendEmailVerification` en `signUp`, pantalla `app/verify-email.js`, gate en login/register). Las cuentas de Google se saltan este paso porque Google ya las verifica.
   - Sign-in con Google nativo (Android) migrado de `signInWithPopup`/`signInWithRedirect` (solo funcionaban en web) a `@react-native-google-signin/google-signin`. Pendiente de pasos manuales en consola (Web Client ID, SHA-1/SHA-256, `google-services.json`, rebuild EAS) antes de poder probarlo en el APK.
   - Flujo de borrado de cuenta y datos asociados (esto SÍ requiere código)

No trabajar en calendario académico, rachas, ni ninguna otra feature de producto hasta que esta lista esté cerrada.

## Regla de oro anti-scope-creep

Antes de escribir código para cualquier pendiente, preguntar:

1. ¿Bloquea el hook principal o el compliance de Play Store? Si no, es v1.1.
2. ¿Está bien especificada o es una idea vaga? Si es vaga, especificar antes de estimar tiempo.
3. ¿Tiene un final claro o es una tarea abierta (pulido, animaciones)? Las abiertas necesitan un criterio explícito de "suficientemente bien" fijado de antemano.
4. ¿Depende de algo fuera de control (viralizar, terceros)? Si sí, no puede ser bloqueante para el lanzamiento.

## Pendientes de producto (clasificar siempre antes de estimar)

- Calendario académico (rehacer desde cero) → probable bloqueante, parte del hook
- Sistema de rachas (inspiración Duolingo) → probable bloqueante, parte del hook
- Mochila con "limitaciones inteligentes" → SIN ESPECIFICAR, exigir definición concreta antes de estimar
- Schedio Prime (Premium) → evaluar si puede ir en v1.1
- IA / coach académico → CONFIRMADO fuera del lanzamiento inicial, previsto 2º trimestre académico (nov-ene)
- Animaciones, transiciones, efecto cristal → v1.1 por defecto salvo que rompan la experiencia core
- Migración Firebase → Supabase → v1.1 / futuro, no estimar tiempo de lanzamiento contando con ella

## Diseño

Inspiración: Apple + Notion. Minimalismo, mucho blanco, sensación premium.
Colores: blanco `#FFFFFF` (fondo), negro `#000000` (texto), azul `#2979FF` (acento).
Tipografía: Inter.
Pantallas: Home (vista global), Calendario, Mochila, Sesiones, IA/Coach (futuro), Perfil.

## Cómo comportarte como agente en este repo

- Actúa como colaborador riguroso, no como validador automático de cualquier petición.
- Si una tarea pendiente no está bien especificada (ej. "limitaciones inteligentes"), para y pide definición antes de estimar o escribir código.
- Si detectas que un cambio propuesto no es bloqueante para el lanzamiento de septiembre 2026, dilo explícitamente antes de implementarlo.
- Prioriza siempre: ¿esto es parte del checkpoint 1 (Play Store) o puede esperar?
