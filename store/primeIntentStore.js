import { create } from 'zustand';

/**
 * What the student was trying to do when the paywall interrupted them.
 *
 * Without this the purchase ends in a dead end: buying Prime because the
 * Mochila blocked an upload used to drop the student back on a screen with
 * the upload sheet already closed, so they had to find the button, tap it and
 * pick the file again — right after paying.
 *
 * `reason` is set just before navigating to `/plus`; the paywall reads it to
 * say what *they* unlocked rather than a generic list, and sets `fulfilled`
 * once a purchase completes. The screen that was interrupted picks the action
 * back up when it regains focus, then clears the intent.
 *
 * Deliberately not persisted: an intent only makes sense within the run that
 * created it, and a stale one surviving a restart would reopen a sheet the
 * student never asked for.
 */
export const PRIME_INTENTS = {
  SUBJECTS: 'subjects',
  MOCHILA: 'mochila',
};

/** Mounts of UploadModal, so only the one that asked reopens. */
export const PRIME_ORIGINS = {
  QUICK_ACTIONS: 'quick-actions',
  MOCHILA_TAB: 'mochila-tab',
};

const usePrimeIntentStore = create((set) => ({
  /** One of PRIME_INTENTS, or null when the paywall was opened by browsing. */
  reason: null,
  /**
   * Which mount asked, for reasons raised from a component that exists in more
   * than one place. UploadModal lives both in the tab layout (the central "+")
   * and inside Plan's Mochila; without this both would reopen on the way back
   * and the student would get two upload sheets for one purchase.
   */
  origin: null,
  /** True once a purchase completed for the current `reason`. */
  fulfilled: false,

  startIntent: (reason, origin = null) => set({ reason, origin, fulfilled: false }),
  fulfilIntent: () => set({ fulfilled: true }),
  clearIntent: () => set({ reason: null, origin: null, fulfilled: false }),
}));

export default usePrimeIntentStore;
