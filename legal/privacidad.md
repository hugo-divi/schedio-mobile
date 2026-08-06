<!--
Cómo usar este documento:
1. Identificación del responsable: decisión deliberada de Hugo (2 agosto 2026)
   de no vincular esta beta privada a una figura legal (ni autónomo ni
   sociedad) — el documento identifica solo "Schedio" + el email de
   contacto. Revisar y añadir nombre/NIF/CIF si eso cambia.
2. Publicado en https://schedio-landing.github.io/schedio-app/privacidad.html
   (landing en GitHub Pages) y enlazado desde `constants/legal.js`. Si cambias
   este Markdown, actualiza también el HTML publicado — no se sincronizan solos.
3. Revisa la fecha de "última actualización" cada vez que cambie algo real
   (nuevo proveedor, nuevo dato recogido, etc.) — Play Store y el RGPD exigen
   que el texto publicado coincida con lo que la app hace de verdad.
-->

# Política de privacidad de Schedio

**Última actualización:** 5 de agosto de 2026

Esta política explica qué datos personales recoge Schedio, para qué los usa, con quién los comparte y qué derechos tienes sobre ellos, conforme al Reglamento General de Protección de Datos (RGPD) y la Ley Orgánica 3/2018 (LOPD-GDD).

## 1. Responsable del tratamiento

- **Servicio:** Schedio
- **Contacto:** schedio.contacto@gmail.com

Puedes usar ese correo para cualquier duda sobre esta política o para ejercer los derechos descritos más abajo, incluida la solicitud de borrado de tu cuenta y tus datos.

## 2. A quién va dirigido Schedio

Schedio está pensado para estudiantes de Bachillerato, ESO y universidad, orientativamente entre 16 y 22 años. La normativa española (art. 7 LOPD-GDD) permite a los mayores de 14 años prestar su propio consentimiento para el tratamiento de datos personales, por lo que no se solicita consentimiento de padres o tutores para usar la app. Si tienes menos de 14 años, no debes registrarte en Schedio.

## 3. Qué datos recogemos y para qué

| Dato                                                                                                                  | De dónde sale                                   | Para qué lo usamos                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Email, nombre y contraseña (cifrada)                                                                                  | Registro con email/contraseña                   | Crear y proteger tu cuenta                                                                                              |
| Email, nombre y foto de perfil                                                                                        | Registro con Google                             | Crear y proteger tu cuenta, sin pedirte otra contraseña                                                                 |
| Curso, rama de Bachillerato, nota media, asignaturas                                                                  | Onboarding inicial                              | Generar tu plan de estudio y las recomendaciones de la app                                                              |
| Exámenes (asignatura y fecha)                                                                                         | Calendario académico que creas dentro de la app | Organizar tu calendario y avisarte con antelación                                                                       |
| Sesiones de estudio, rachas y rango                                                                                   | Uso normal de la app                            | Medir tu progreso y mostrártelo en Inicio/Perfil                                                                        |
| Archivos que subes a la Mochila (apuntes, imágenes, documentos)                                                       | Subida manual desde la app                      | Guardarlos para que los tengas disponibles en la app                                                                    |
| Historial de compras/suscripción (Schedio Prime)                                                                      | Google Play / App Store, vía RevenueCat         | Saber si tienes acceso a las funciones de pago                                                                          |
| Token de notificaciones push                                                                                          | Si aceptas el permiso de notificaciones         | Avisarte de exámenes próximos, retomar el estudio tras unos días sin abrir la app, y un resumen semanal de tus sesiones |
| Datos de fallos de la app (Crashlytics): modelo de dispositivo, versión de Android, y el punto del código donde falló | Automático si la app se cierra inesperadamente  | Detectar y corregir errores. No incluye tu email, contraseña ni contenido de la Mochila                                 |

No recogemos datos de pago (número de tarjeta, etc.) directamente: las compras las gestionan Google Play o Apple, no Schedio.

## 4. Base legal del tratamiento

- **Ejecución del contrato de uso:** los datos de cuenta, calendario, Mochila y progreso son necesarios para prestarte el servicio que pides al registrarte.
- **Consentimiento:** para las recomendaciones generadas con inteligencia artificial y para las notificaciones push (se piden explícitamente al aceptar el permiso).
- **Interés legítimo:** medidas mínimas de seguridad y prevención de abuso (por ejemplo, limitar intentos de inicio de sesión), y el diagnóstico de fallos técnicos (Crashlytics).

## 5. Con quién compartimos tus datos

Schedio no vende tus datos a nadie. Los siguientes proveedores tratan datos por nuestra cuenta, como encargados del tratamiento, únicamente para prestar el servicio:

- **Google Firebase** (Authentication, Firestore, Storage, Cloud Messaging, Crashlytics, Cloud Functions): aloja tu cuenta, tu calendario, tu progreso, los archivos de tu Mochila, envía las notificaciones push y recoge los datos de fallos técnicos. Firestore/Storage se almacenan en la región europea (`eur3`/`europe-southwest1`).
- **Google Gemini API**: cuando usas las recomendaciones de IA, tu nombre y tu perfil académico (asignaturas, notas, exámenes próximos, patrones de estudio) se envían a esta API de Google para generar el texto de la recomendación. No se envían tu email, contraseña ni archivos de la Mochila.
- **RevenueCat**: gestiona el estado de tu suscripción a Schedio Prime a partir de tu compra en Google Play/App Store; no ve tu email ni tus datos académicos.
- **Google Play / App Store**: procesan el pago de Schedio Prime directamente; Schedio no ve ni almacena tus datos de pago.

Como Google (Firebase, Gemini) y RevenueCat son empresas con sede fuera de la Unión Europea, estas transferencias se realizan bajo las garantías previstas por el RGPD (cláusulas contractuales tipo u otros mecanismos equivalentes que cada proveedor tiene publicados).

## 6. Cuánto tiempo conservamos tus datos

Conservamos tus datos mientras tu cuenta esté activa. Si eliminas tu cuenta, se borran tu perfil, tus asignaturas, exámenes, sesiones, rachas y archivos de la Mochila. Algunos registros mínimos (por ejemplo, los necesarios para justificar una compra ya realizada) pueden conservarse el tiempo que exija la normativa fiscal o mercantil aplicable.

## 7. Cómo borrar tu cuenta y tus datos

Tienes dos formas de hacerlo, sin necesidad de tener la app instalada:

- **Desde la app:** Ajustes → Eliminar cuenta, si te registraste con email y contraseña. El borrado es inmediato y no se puede deshacer.
- **Por email, sin abrir la app:** escribe a schedio.contacto@gmail.com solicitando el borrado de tu cuenta y tus datos, desde el mismo correo con el que te registraste. Lo tramitamos en un plazo máximo de 30 días y te confirmamos cuando esté hecho. Esta es también la única vía disponible hoy para las cuentas registradas con Google, ya que el borrado propio dentro de la app todavía no soporta ese caso.

En ambos casos se elimina permanentemente: tu perfil, asignaturas, exámenes, sesiones de estudio, rachas, archivos de la Mochila y tu cuenta de acceso.

## 8. Tus derechos

Además de la supresión (punto anterior), puedes ejercer en cualquier momento, escribiendo a schedio.contacto@gmail.com:

- **Acceso**: saber qué datos tenemos sobre ti.
- **Rectificación**: corregir datos inexactos.
- **Portabilidad**: recibir tus datos en un formato reutilizable.
- **Oposición y limitación**: oponerte a un tratamiento concreto o pedir que lo pausemos.

Si consideras que no hemos atendido tu solicitud correctamente, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).

## 9. Seguridad

Toda la comunicación entre la app y nuestros servidores viaja cifrada (HTTPS/TLS). El acceso a tus datos está protegido además por las reglas de seguridad de Firestore y Storage, que restringen cada documento y archivo a su propio dueño. Las contraseñas nunca se almacenan en texto plano: las gestiona Firebase Authentication.

## 10. Cambios en esta política

Si cambiamos de forma relevante qué datos recogemos o con quién los compartimos, lo reflejaremos aquí actualizando la fecha de la cabecera y, si el cambio es sustancial, te avisaremos dentro de la app.
