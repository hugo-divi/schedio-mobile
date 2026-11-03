import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Rank-ups and badge unlocks waiting to be shown — one queue for the whole
 * app, drawn by components/CelebrationHost.js.
 *
 * The same badge used to be celebrated in more than one session. Each screen
 * kept its own queue, and Estudiar filled its queue whenever `addSession`
 * resolved — which on a slow connection (the iPhone PWA especially) could be
 * after the student had already left the summary. The queue then sat there
 * until the next session ended and was shown again, as if just earned. Now:
 *
 *  · results go here, whenever they arrive, and are shown wherever the
 *    student happens to be (never over a running timer);
 *  · an item already queued is not queued twice;
 *  · once shown, its key is remembered on this device for this account, and
 *    nothing with that key is ever shown again — a guard on what the student
 *    sees, on top of the fixes that stop a badge from being re-awarded.
 */

const storageKey = (uid) => `schedio:celebrated:${uid}`;

/** What identifies an item. Ranks and badges are each earned once, ever. */
export const celebrationKeys = (item) => {
  if (item?.type === 'rank') return [`rank:${item.rank?.title}`];
  if (item?.type === 'badge') return [`badge:${item.badge?.id}`];
  if (item?.type === 'summary') return (item.badges || []).map((b) => `badge:${b.id}`);
  return [];
};

let seen = { uid: null, keys: new Set() };

const loadSeen = async (uid) => {
  if (seen.uid === uid) return seen.keys;
  let keys = new Set();
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) keys = new Set(parsed);
  } catch {
    // Unreadable means nothing remembered: at worst one celebration repeats.
  }
  seen = { uid, keys };
  return keys;
};

const useCelebrationStore = create((set, get) => ({
  uid: null,
  queue: [],
  /** True while a screen asks for quiet — Estudiar's end-of-session reveal. */
  held: false,

  setHeld: (held) => set({ held }),

  enqueue: async (uid, items) => {
    if (!uid || !items?.length) return;
    const keys = await loadSeen(uid);
    const queued = new Set(get().queue.flatMap(celebrationKeys));
    const fresh = items.filter((item) => {
      const itemKeys = celebrationKeys(item);
      if (itemKeys.length === 0) return false;
      return itemKeys.some((key) => !keys.has(key) && !queued.has(key));
    });
    if (fresh.length === 0) return;
    set((state) => ({ uid, queue: [...state.queue, ...fresh] }));
  },

  /** Called once the student has gone through everything on screen. */
  finish: async () => {
    const { queue, uid } = get();
    set({ queue: [] });
    if (!uid) return;
    const keys = await loadSeen(uid);
    queue.flatMap(celebrationKeys).forEach((key) => keys.add(key));
    try {
      await AsyncStorage.setItem(storageKey(uid), JSON.stringify([...keys]));
    } catch {
      // Not remembered: the store-side fixes still stop a re-award.
    }
  },

  clear: () => set({ queue: [], held: false }),
}));

export const enqueueCelebrations = (uid, items) =>
  useCelebrationStore.getState().enqueue(uid, items);

export default useCelebrationStore;
