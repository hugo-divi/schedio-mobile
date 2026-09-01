import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDateKey } from './priority';

const STORAGE_KEY = '@schedio/widgetModel';

/** Must match the widget `name`s declared in app.json's react-native-android-widget plugin. */
export const WIDGET_NAMES = ['Small', 'Medium', 'Large'];

/**
 * Same day-grouping `examAlerts` uses server-side (functions/index.js,
 * madridDateKey): exams landing on the same calendar day fold into one
 * widget card instead of only ever surfacing the first row.
 */
const groupNearestExamDay = (exams) => {
  const upcoming = (exams || []).filter((exam) => !exam.completed && exam.date);
  if (upcoming.length === 0) return [];
  const firstKey = localDateKey(upcoming[0].date);
  return upcoming.filter((exam) => localDateKey(exam.date) === firstKey);
};

const todaysPendingTasks = (microplans) => {
  const todayKey = localDateKey(new Date());
  return (microplans || [])
    .filter((task) => !task.completed && localDateKey(task.date) === todayKey)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

/**
 * Plain, JSON-serializable snapshot of everything the widget needs to
 * render — this is what gets cached to AsyncStorage for the cold-start
 * case (widget added/updated while the JS app isn't actually open). Day
 * math (days until the exam) is deliberately NOT baked in here: it's
 * recomputed at render time in the widget itself, from `examDateIso`, so a
 * stale cached model still counts down correctly.
 */
export const computeWidgetModel = ({ exams, microplans, subjects, streak }) => {
  const subjectsById = new Map((subjects || []).map((subject) => [subject.id, subject]));
  const examGroup = groupNearestExamDay(exams);
  const tasksToday = todaysPendingTasks(microplans);

  return {
    // Marks this as real data rather than the placeholder the task handler
    // falls back to. Without it the widget can't tell "you genuinely have no
    // exams and a streak of 0" from "the app has never synced", and rendered
    // the first as if it were true — a fresh widget showed a big 0.
    synced: true,
    computedAt: new Date().toISOString(),
    streak: streak || 0,
    hasExam: examGroup.length > 0,
    examDateIso: examGroup[0]?.date ? new Date(examGroup[0].date).toISOString() : null,
    exams: examGroup.map((exam) => ({
      id: exam.id,
      name: exam.name,
      color: subjectsById.get(exam.subjectId)?.color || '#9B9B9B',
    })),
    tasksToday: tasksToday.slice(0, 3).map((task) => ({ id: task.id, text: task.text })),
  };
};

export const loadCachedWidgetModel = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const persistWidgetModel = async (model) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  } catch {
    // Non-fatal — the widget just keeps showing whatever it last rendered.
  }
};

/**
 * Pushes fresh data to every Schedio widget currently on the home screen.
 * Call this whenever the app has just loaded/refreshed exams, the plan, or
 * the streak (see app/dashboard/index.js `fetchData`). Safe to call on iOS
 * or before the native widget module exists in an old dev client build —
 * both cases just no-op instead of throwing and breaking the caller.
 */
export const syncHomeScreenWidgets = async (rawInputs) => {
  if (Platform.OS !== 'android') return;

  const model = computeWidgetModel(rawInputs);
  await persistWidgetModel(model);

  // Note: index.js imports 'react-native-android-widget' unconditionally at
  // startup (required to register the widget task handler), so a dev client
  // built before this shipped will fail to boot, not just skip this sync —
  // a fresh native rebuild is required, see the rollout notes.
  try {
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const { renderWidgetForName } = require('../widgets/ScheduioWidget');

    await Promise.all(
      WIDGET_NAMES.map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          renderWidget: () => renderWidgetForName(widgetName, model),
          widgetNotFound: () => {},
        })
      )
    );
  } catch (error) {
    console.error('Error updating home screen widgets', error);
  }
};
