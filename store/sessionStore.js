import { create } from 'zustand';

/**
 * Whether the study timer is the thing on screen right now.
 *
 * It has to live outside Estudiar because the one piece of furniture that
 * needs to react to it belongs to somebody else: the floating "+" is rendered
 * by `app/dashboard/_layout.js`, absolutely positioned over everything, and is
 * *not* part of the tab bar. Estudiar hides the bar with
 * `navigation.setOptions({ tabBarStyle: { display: 'none' } })` when the timer
 * starts, and the button sailed straight through that — it kept floating over
 * a running session, offering a way out of the one screen that deliberately
 * has none.
 *
 * Not persisted. A session interrupted by the app closing comes back through
 * RecoverSessionSheet, which walks the student to the timer again and sets
 * this on the way; a flag restored from disk would instead hide the button on
 * a dashboard with no session running.
 */
const useSessionStore = create((set) => ({
  sessionActive: false,
  setSessionActive: (sessionActive) => set({ sessionActive }),
}));

export default useSessionStore;
