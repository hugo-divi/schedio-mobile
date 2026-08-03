import { EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { collection, query, where, getDocs, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { auth, db, storage } from './firebase';

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 450;

/** Top-level collections that store rows keyed by `userId`. */
const OWNED_COLLECTIONS = ['subjects', 'exams', 'sessions'];

/** Subcollections hanging off `users/{uid}`. */
const USER_SUBCOLLECTIONS = ['resources', 'notes'];

const deleteRefsInBatches = async (refs) => {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH_LIMIT).forEach((r) => batch.delete(r));
    await batch.commit();
  }
};

/**
 * Every file under `users/{uid}/`. Storage has no recursive delete, and
 * `listAll` only returns one level, so folders are walked by hand.
 */
const deleteStorageTree = async (path) => {
  const folder = ref(storage, path);
  const { items, prefixes } = await listAll(folder);

  await Promise.all(items.map((item) => deleteObject(item).catch(() => {})));
  for (const prefix of prefixes) {
    await deleteStorageTree(prefix.fullPath);
  }
};

/**
 * Wipes everything the account owns. Exported separately from
 * `deleteAccount` so it can be reasoned about — and tested — without an
 * irreversible auth deletion attached to it.
 *
 * Runs while the user is still signed in, because the security rules check
 * `request.auth`: deleting the auth user first would lock us out of the data
 * and leave it orphaned forever.
 */
export const deleteAccountData = async (uid) => {
  if (!uid) throw new Error('deleteAccountData necesita un uid');

  // Storage first: it's the only part that can't be reached again if the
  // Firestore rows that reference it are already gone.
  await deleteStorageTree(`users/${uid}`).catch((error) => {
    console.warn('No se pudieron borrar todos los archivos de Storage:', error);
  });

  for (const name of USER_SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, name));
    await deleteRefsInBatches(snap.docs.map((d) => d.ref));
  }

  for (const name of OWNED_COLLECTIONS) {
    const snap = await getDocs(query(collection(db, name), where('userId', '==', uid)));
    await deleteRefsInBatches(snap.docs.map((d) => d.ref));
  }

  // Keyed by uid rather than holding a userId field.
  await deleteDoc(doc(db, 'streaks', uid)).catch(() => {});

  await deleteDoc(doc(db, 'users', uid));
};

/** True when the account signs in with an email and a password. */
export const usesPasswordSignIn = (user = auth.currentUser) =>
  !!user?.providerData?.some((p) => p.providerId === 'password');

/**
 * Deletes the account and everything it owns, in that order:
 * re-authenticate, wipe the data, then remove the auth user.
 *
 * Firebase refuses `deleteUser` unless the session is recent, which is why
 * the password is asked for rather than trusting the current session.
 */
export const deleteAccount = async (password) => {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay ninguna sesión iniciada.');

  if (!usesPasswordSignIn(user)) {
    // Re-authenticating a Google account needs a provider flow this app does
    // not have on native. Better to say so than to half-delete an account.
    throw new Error(
      'Esta cuenta inició sesión con Google. Cierra sesión, vuelve a entrar y prueba otra vez.'
    );
  }

  if (!password) throw new Error('Introduce tu contraseña para confirmar.');

  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);

  await deleteAccountData(user.uid);

  // Last, and only if the data went: an account deleted before its rows would
  // strand them with no way back in.
  await deleteUser(user);
};
