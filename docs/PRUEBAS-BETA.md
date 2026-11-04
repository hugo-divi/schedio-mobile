# Pruebas de la beta en el iPhone

Todo lo nuevo (Inicio con el plan de hoy, aviso diario, insignias nuevas y
fechas del aula) solo se activa en cuentas con `betaTester: true`. La idea es
probarlo en tu iPhone **sin publicar nada para los demás**.

## 0. Preparación (una vez)

1. **Marca tus cuentas como beta.** Firebase Console → Firestore →
   colección `users` → el documento de tu cuenta (su id es el UID que ves en
   Authentication). Añade el campo `betaTester` de tipo boolean a `true`. La
   app no puede cambiarlo: solo se hace desde la consola.
2. **Despliega las reglas de Firestore.** Impiden que alguien se ponga
   `betaTester` a sí mismo. No afectan a la app publicada.
   ```bash
   firebase deploy --only firestore:rules
   ```
3. **Despliega solo la función del aviso diario.** Es nueva y solo actúa en
   cuentas beta. Las demás funciones se quedan como están.
   ```bash
   firebase deploy --only functions:dailyPlanReminder
   ```
4. **Publica la vista previa.** No toques `firebase deploy --only hosting`:
   eso publica para todos.

   ```bash
   npm run deploy:beta-preview
   ```

   Añade el dominio que te dé a Authentication → Settings → Dominios
   autorizados.

   O mejor, deja que se publique sola (ver «Publicación automática» abajo):
   la URL sale en la pestaña Actions de GitHub, en «Vista previa beta».

5. **Instálala en el iPhone.** Abre la URL en Safari → Compartir → Añadir a
   pantalla de inicio. Ábrela siempre desde ese icono: en iOS las
   notificaciones solo funcionan así.

> Si el login con Google falla en la vista previa, entra con correo y
> contraseña. Es por el dominio distinto, no por la app.
>
> Cada cuenta guarda un solo dispositivo para las notificaciones: al activarlas
> en la vista previa, dejan de llegar al PWA de siempre de esa cuenta.

### Publicación automática (configurar una vez)

`.github/workflows/beta-preview.yml` publica la vista previa con cada cambio
que se sube a una rama `claude/**`. Así no hace falta repetir el paso 4.
`app.schedio.es` no se toca. Necesita estos secretos del repositorio, en
GitHub → Settings → Secrets and variables → Actions:

1. **`FIREBASE_SERVICE_ACCOUNT_SCHEDIO_B3958`**: lo más fácil es ejecutar
   `firebase init hosting:github` en el proyecto. Crea la cuenta de servicio
   con los permisos justos y sube este secreto al repositorio.
   - Responde **No** a lo de ejecutar un build y a lo de desplegar en el canal
     live.
   - No subas los `.yml` que genera: ya está el nuestro.
2. **Los mismos valores de tu `.env.local`**, cada uno como secreto con el
   mismo nombre:
   - `EXPO_PUBLIC__FIREBASE_API_KEY`
   - `EXPO_PUBLIC__FIREBASE_AUTH_DOMAIN`
   - `EXPO_PUBLIC__FIREBASE_PROJECT_ID`
   - `EXPO_PUBLIC__FIREBASE_STORAGE_BUCKET`
   - `EXPO_PUBLIC__FIREBASE_MESSAGING_SENDER_ID`
   - `EXPO_PUBLIC__FIREBASE_APP_ID`
   - `EXPO_PUBLIC__FIREBASE_VAPID_KEY`

Mientras falte la cuenta de servicio, el flujo se salta sin fallar. Las
reglas y la función (pasos 2 y 3) siguen siendo a mano, pero solo una vez.

## 1. Aviso diario (lo más importante)

| #   | Haz esto                                                                          | Debería pasar                                                                                             |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1.1 | En Inicio, en la tarjeta «¿Te aviso cada día con tu plan?», pulsa **Elegir hora** | Se abre la hoja con una hora propuesta y la vista previa del mensaje                                      |
| 1.2 | Elige una hora unos 20–30 min por delante y acepta el permiso                     | Ajustes muestra el aviso activado con esa hora                                                            |
| 1.3 | Espera a esa hora con tareas pendientes hoy                                       | Llega **una** notificación entre la hora elegida y 15 min después, con la asignatura y los minutos reales |
| 1.4 | Tócala                                                                            | Abre Inicio, no otra pantalla                                                                             |
| 1.5 | Esa noche y al día siguiente, mira si llega otra                                  | Solo una al día. Si un día no tienes nada pendiente, no llega                                             |
| 1.6 | Pon un examen para mañana                                                         | Ese día el aviso habla del examen, no del plan normal                                                     |
| 1.7 | En Ajustes, desactiva el aviso                                                    | Al día siguiente no llega                                                                                 |

Para repetir la prueba el mismo día, en tu documento de `users` borra
`dailyReminderState.lastSentDate` y `lastNotifiedDate`.

Fíjate en: si el texto suena natural, si llega a la hora que esperas y si te
dan ganas de abrir la app o de quitar el aviso.

## 2. Inicio

| #   | Haz esto                          | Debería pasar                                                                                                           |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Abre Inicio con plan para hoy     | Arriba, «Hoy · miércoles 4», el titular («Hoy toca Química · 30 min» o «Hoy: 50 min de estudio») y la lista de sesiones |
| 2.2 | Pulsa el botón de empezar         | Arranca la sesión de la primera tarea pendiente                                                                         |
| 2.3 | Completa una sesión y vuelve      | «1/3 hechas» y el titular pasa a «Te quedan X min»                                                                      |
| 2.4 | Completa todo el día              | Estado de día completado con los minutos estudiados                                                                     |
| 2.5 | Cuenta sin exámenes               | «Añade tu próximo examen»                                                                                               |
| 2.6 | Sin tokens de IA (o sin conexión) | Inicio sigue diciendo algo con sentido; la frase de la IA solo aparece, marcada, cuando la hay                          |

## 3. Insignias (y la insignia repetida)

| #   | Haz esto                                                                           | Debería pasar                                                                                  |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 3.1 | Abre Perfil → insignias                                                            | Galería por categorías y niveles (bronce, plata, oro), con «Más cerca»                         |
| 3.2 | Al abrir la beta por primera vez                                                   | Te pueden caer de golpe las que ya merecías por lo hecho antes. Es normal, y solo pasa una vez |
| 3.3 | Completa el plan de un día                                                         | **Día redondo**, con su celebración y su XP                                                    |
| 3.4 | Sube tu primer apunte a la Mochila                                                 | **Mochila lista**                                                                              |
| 3.5 | **Clave:** después de ganar una, haz otra sesión, cierra la app y vuelve a abrirla | La misma insignia **no** vuelve a salir. Era el error que veías                                |
| 3.6 | Apunta la nota de un examen                                                        | **Primera nota** (y Excelencia solo con un 10)                                                 |

Si una insignia se repite, apunta cuál, en qué pantalla estabas y si acababas
de abrir la app. Con eso lo encuentro.

## 3b. Al terminar una sesión

| #    | Haz esto                          | Debería pasar                                                                                                       |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 3b.1 | Termina una sesión de 5 min o más | Debajo del resumen, «Compartir» y, si te queda algo hoy, una línea discreta «Siguiente en tu plan: Inglés · 20 min» |
| 3b.2 | Toca «Compartir»                  | Una hoja con la tarjeta tal como saldrá: minutos, asignatura, racha y plan de hoy, sin tu nombre                    |
| 3b.3 | Toca «Compartir» en esa hoja      | La hoja de compartir del iPhone, con la imagen: prueba a subirla a una historia o a guardarla en Fotos              |
| 3b.4 | Toca la línea de «Siguiente»      | Empieza esa sesión directamente; tu valoración y tu nota de la sesión anterior se guardan                           |
| 3b.5 | Termina la última sesión del día  | No sale «Siguiente»; la tarjeta dice «Plan de hoy completado»                                                       |

## 4. Enlace de un aula

| #   | Haz esto                                                   | Debería pasar                                                                               |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 4.1 | Cierra sesión y abre `URL-de-la-vista-previa/aula/PRUEBA1` | No sale «pantalla no encontrada»: va a la bienvenida o al login                             |
| 4.2 | Inicia sesión                                              | De momento no pasa nada más: el código queda guardado hasta conectar la pantalla de tu aula |

Las tarjetas de fechas del aula no se pueden probar todavía: hace falta tu
código de aulas.

## 5. Lo que es para todos (revísalo también)

Estos cambios no van detrás de la beta y saldrán para todos cuando
publiques:

- Ya no se cierra la sesión a los 45 días.
- La app no pide el permiso de notificaciones nada más abrirse.
- Tocar una notificación lleva a su sitio (examen → Plan, resumen → Racha).
- La insignia ya no se repite entre sesiones (el arreglo es para todos).
- El aviso de «vuelve» solo sale con exámenes próximos, y como mucho 3 veces.

## Cuando acabes

Cuéntame qué falló o qué no te convenció, con capturas si puedes. Cuando esté
todo bien, se publica en este orden:

1. Hosting.
2. El resto de funciones.
3. La versión de Android.
4. Quitar la marca de beta, si decides abrirlo a todos.
