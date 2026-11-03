/**
 * Features still being tested, switched on per account.
 *
 * There is one Firebase project, so a hosting or functions deploy reaches
 * every student at once — including every iPhone, which runs the PWA. What is
 * still being checked therefore can't hide behind "not published yet"; it
 * hides behind this flag instead.
 *
 * `betaTester: true` lives on `users/{uid}` and is set by hand from the
 * Firebase console (Firestore → users → the account → add field, boolean).
 * firestore.rules refuses it from the client, so nobody can switch it on for
 * themselves. functions/index.js reads the same field before sending anything
 * that is still in beta.
 *
 * What it gates today: the new "Hoy" on Inicio, the daily plan reminder and
 * the new badges. Fixes that apply to everyone are not behind it.
 */
export const isBetaProfile = (profile) => profile?.betaTester === true;
