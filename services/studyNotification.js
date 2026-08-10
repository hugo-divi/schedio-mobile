import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';

const CHANNEL_ID = 'study-session';
const NOTIFICATION_ID = 'study-session-timer';
// tokens.colors.bgBase, duplicated as a literal — this file has no reason to
// pull in the RN-only theme module just for one color. Fixed on purpose
// (not per-subject): a consistent, on-brand dark background reads calmer
// than the notification changing color every session.
const NOTIFICATION_COLOR = '#191919';

export const ACTION = { PAUSE: 'pause', RESUME: 'resume', STOP: 'stop' };

/**
 * Must be registered at module scope, before any component renders — it's
 * what lets Android relaunch the foreground service after it's been killed
 * and redelivered, not just the first time it starts. The promise never
 * resolves on purpose: notifee keeps the service alive until
 * `stopForegroundService()` is called, not until this returns.
 */
notifee.registerForegroundService(() => new Promise(() => {}));

/**
 * Required by notifee or it logs a warning, even though this case is rare
 * for us: the foreground service is what keeps the process alive while a
 * session notification is showing, so an action press landing here (app
 * fully killed, not just backgrounded) shouldn't normally happen. There's no
 * React state to reach from a killed app anyway, so this is intentionally a
 * no-op rather than a parallel state machine outside React.
 */
notifee.onBackgroundEvent(async () => {});

const channelReady = notifee.createChannel({
  id: CHANNEL_ID,
  name: 'Sesión de estudio',
  importance: AndroidImportance.HIGH,
  visibility: AndroidVisibility.PUBLIC,
});

const formatRemaining = (seconds) => {
  const safe = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const goalsSummary = (goals) => {
  if (!goals || goals.length === 0) return undefined;
  const done = goals.filter((g) => g.completed).length;
  return `${done}/${goals.length} objetivos completados`;
};

/** One line per objective, shown only once the notification is expanded —
 * the collapsed view keeps the terser `goalsSummary` count. */
const goalsBigText = (goals) => {
  if (!goals || goals.length === 0) return undefined;
  return goals.map((g) => `${g.completed ? '✓' : '○'} ${g.text}`).join('\n');
};

const progressOf = (totalSeconds, elapsedSeconds) =>
  totalSeconds
    ? {
        max: totalSeconds,
        current: Math.max(0, Math.min(totalSeconds, Math.round(elapsedSeconds || 0))),
        indeterminate: false,
      }
    : undefined;

/**
 * Shows/refreshes the ongoing study-session notification. Covers session
 * start, goal edits, and pause/resume — call it again with the current state
 * any time one of those changes, it's idempotent by `NOTIFICATION_ID`.
 *
 * The chronometer itself is Android's, driven purely by `endTimestamp` — it
 * keeps counting even if the JS thread is asleep, which is the whole point.
 * There's no native way to "pause" it, so a pause swaps to a plain frozen
 * line (`remainingSeconds`) instead, and resuming needs a freshly computed
 * `endTimestamp` from the caller. The progress bar isn't native like the
 * chronometer — the caller refreshes it periodically, not every second.
 */
export const updateStudySessionNotification = async ({
  subjectName,
  goals,
  paused,
  endTimestamp,
  remainingSeconds,
  elapsedSeconds,
  totalSeconds,
}) => {
  try {
    await channelReady;
    const summary = goalsSummary(goals);
    const bigText = goalsBigText(goals);
    const style = bigText ? { type: AndroidStyle.BIGTEXT, text: bigText, summary } : undefined;

    if (paused) {
      await notifee.displayNotification({
        id: NOTIFICATION_ID,
        title: subjectName ? `${subjectName} · en pausa` : 'Sesión en pausa',
        body: [formatRemaining(remainingSeconds), summary].filter(Boolean).join(' · '),
        android: {
          channelId: CHANNEL_ID,
          asForegroundService: true,
          ongoing: true,
          showChronometer: false,
          colorized: true,
          color: NOTIFICATION_COLOR,
          progress: progressOf(totalSeconds, totalSeconds - (remainingSeconds || 0)),
          style,
          pressAction: { id: 'default', launchActivity: 'default' },
          actions: [
            { title: 'Reanudar', pressAction: { id: ACTION.RESUME } },
            { title: 'Terminar', pressAction: { id: ACTION.STOP } },
          ],
        },
      });
      return;
    }

    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: subjectName ? `Estudiando ${subjectName}` : 'Sesión de estudio',
      body: summary,
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true,
        ongoing: true,
        showChronometer: true,
        chronometerDirection: 'down',
        timestamp: endTimestamp,
        colorized: true,
        color: NOTIFICATION_COLOR,
        progress: progressOf(totalSeconds, elapsedSeconds),
        style,
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [
          { title: 'Pausar', pressAction: { id: ACTION.PAUSE } },
          { title: 'Terminar', pressAction: { id: ACTION.STOP } },
        ],
      },
    });
  } catch (error) {
    console.error('[StudyNotification] Error updating notification:', error);
  }
};

export const stopStudySessionNotification = async () => {
  try {
    await notifee.stopForegroundService();
  } catch (error) {
    console.error('[StudyNotification] Error stopping notification:', error);
  }
};

/** Action-button taps while the JS context is alive (foreground or plain
 * backgrounded — see the onBackgroundEvent note above for the killed-app
 * case). Returns notifee's own unsubscribe function. */
export const addNotificationActionListener = (onAction) =>
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id) {
      onAction(detail.pressAction.id);
    }
  });
