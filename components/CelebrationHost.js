import useCelebrationStore from '../store/celebrationStore';
import useSessionStore from '../store/sessionStore';
import AchievementCelebration from './AchievementCelebration';

/**
 * Draws whatever store/celebrationStore.js has queued, on top of whichever
 * tab is open. Mounted once, in app/dashboard/_layout.js.
 *
 * Waits while a session timer runs (nothing interrupts Estudiar mid-session)
 * and while a screen holds it — the end-of-session reveal, so the logo
 * animation lands first, as it always did.
 */
export default function CelebrationHost() {
  const queue = useCelebrationStore((state) => state.queue);
  const held = useCelebrationStore((state) => state.held);
  const sessionActive = useSessionStore((state) => state.sessionActive);

  if (queue.length === 0 || held || sessionActive) return null;

  return (
    <AchievementCelebration
      queue={queue}
      onFinish={() => useCelebrationStore.getState().finish()}
    />
  );
}
