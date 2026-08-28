import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidStyle,
  AlarmType,
  EventType,
  TriggerType,
} from '@notifee/react-native';

const CHANNEL_ID = 'study-session';
const NOTIFICATION_ID = 'study-session-timer';

/**
 * A second channel, for the one alert that has to get through: the break
 * ending. The session's own focus mode puts the phone into
 * INTERRUPTION_FILTER_PRIORITY, under which an ordinary Schedio notification
 * is silent — so this channel sets `bypassDnd`.
 *
 * That isn't overriding the student. `services/focusMode.js` deliberately
 * never touches *their* Do Not Disturb configuration, and this doesn't either:
 * it configures a channel of ours, used for a single alert. They silenced the
 * world in order to study with Schedio; Schedio's own timer isn't the world.
 *
 * `bypassDnd` only takes effect for an app holding Notification Policy Access,
 * which is exactly the permission focus mode already asks for — so this needs
 * no new permission. Where it isn't granted the flag is ignored and the alert
 * is merely visible instead of audible, which is the right failure: those
 * students aren't under a Schedio-imposed DND in the first place.
 *
 * NOTE: Android will not let `bypassDnd` change after the channel exists. To
 * change it later the id has to change with it (`-v2`), so this has to be
 * right the first time it ships.
 */
const BREAK_CHANNEL_ID = 'study-break-end';
const BREAK_NOTIFICATION_ID = 'study-break-end-alert';
// tokens.colors.bgBase, duplicated as a literal — this file has no reason to
// pull in the RN-only theme module just for one color. Fixed on purpose
// (not per-subject): a consistent, on-brand dark background reads calmer
// than the notification changing color every session.
const NOTIFICATION_COLOR = '#191919';

export const ACTION = { PAUSE: 'pause', RESUME: 'resume', STOP: 'stop', SKIP: 'skip' };

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

const breakChannelReady = notifee.createChannel({
  id: BREAK_CHANNEL_ID,
  name: 'Fin del descanso',
  description: 'Avisa cuando termina un descanso y vuelve a tocar estudiar.',
  importance: AndroidImportance.HIGH,
  visibility: AndroidVisibility.PUBLIC,
  vibration: true,
  bypassDnd: true,
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
  // 'work' | 'break'. The chronometer counts to the end of the *current phase*,
  // never to the end of the session — otherwise it and the on-screen ring
  // would be counting two different things.
  phase = 'work',
  block = 1,
  totalBlocks = 1,
}) => {
  try {
    await channelReady;
    const summary = goalsSummary(goals);
    const bigText = goalsBigText(goals);
    const style = bigText ? { type: AndroidStyle.BIGTEXT, text: bigText, summary } : undefined;
    const blockLabel = totalBlocks > 1 ? `Bloque ${block} de ${totalBlocks}` : null;

    if (!paused && phase === 'break') {
      // Its own branch rather than a reworded "studying": the title said
      // `Estudiando {materia}` in every state, which on a lock screen during a
      // break is simply false. "Pausar" is meaningless here too — the useful
      // button is the one that gives the time back.
      await notifee.displayNotification({
        id: NOTIFICATION_ID,
        title: subjectName ? `${subjectName} · descanso` : 'Descanso',
        body: [blockLabel, summary].filter(Boolean).join(' · ') || undefined,
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
            { title: 'Saltar descanso', pressAction: { id: ACTION.SKIP } },
            { title: 'Terminar', pressAction: { id: ACTION.STOP } },
          ],
        },
      });
      return;
    }

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
      body: [blockLabel, summary].filter(Boolean).join(' · ') || undefined,
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

/**
 * Books the "break's over" alert for the moment the break ends.
 *
 * It has to be scheduled rather than fired: with the screen locked the JS
 * thread is asleep, so nothing of ours runs at the moment it matters. Android
 * delivers this one on its own.
 *
 * `SET_AND_ALLOW_WHILE_IDLE` gets through Doze and — unlike the exact variants
 * — needs no `SCHEDULE_EXACT_ALARM`, which on Android 12+ would mean reopening
 * the Play Store permissions audit. It is inexact, and that is affordable
 * precisely because the next block starts on its own: a late alert costs a
 * few seconds of a block already running, not the session. notifee's default
 * (WorkManager) is looser still, hence naming the alarm explicitly.
 *
 * Always call `cancelBreakEndAlert` before rescheduling — the id is fixed, but
 * a pause moves the end time and a skip removes it altogether.
 */
export const scheduleBreakEndAlert = async ({ timestamp, subjectName, block, totalBlocks }) => {
  try {
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return;
    await breakChannelReady;

    await notifee.createTriggerNotification(
      {
        id: BREAK_NOTIFICATION_ID,
        title: 'Se acabó el descanso',
        body: subjectName
          ? `Bloque ${block} de ${totalBlocks} · ${subjectName}`
          : `Bloque ${block} de ${totalBlocks}`,
        android: {
          channelId: BREAK_CHANNEL_ID,
          smallIcon: 'ic_launcher',
          pressAction: { id: 'default', launchActivity: 'default' },
          // Cleared by hand rather than left around: the session notification
          // right below it is already saying where the timer is.
          autoCancel: true,
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp,
        alarmManager: { type: AlarmType.SET_AND_ALLOW_WHILE_IDLE },
      }
    );
  } catch (error) {
    console.error('[StudyNotification] Error scheduling the break alert:', error);
  }
};

/**
 * Drops a booked alert. Called on skipping a break, on pausing (before it is
 * booked again for the new end time) and whenever the session ends — a
 * trigger notification that outlives its session and fires half an hour later
 * is the classic way this feature goes wrong.
 */
export const cancelBreakEndAlert = async () => {
  try {
    await notifee.cancelTriggerNotification(BREAK_NOTIFICATION_ID);
    await notifee.cancelDisplayedNotification(BREAK_NOTIFICATION_ID);
  } catch (error) {
    // Nothing booked is the ordinary case, not a failure worth shouting about.
    console.log('[StudyNotification] No break alert to cancel:', error?.message);
  }
};

export const stopStudySessionNotification = async () => {
  try {
    await cancelBreakEndAlert();
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
