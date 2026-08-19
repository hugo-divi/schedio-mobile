import { loadCachedWidgetModel } from '../services/widgetData';
import { renderWidgetForName } from './ScheduioWidget';

/**
 * Fallback shown before the app has ever synced real data to the widget
 * (freshly added, phone just restored, etc). Reuses the "no exam" empty
 * state — the copy ("sin exámenes próximos") reads slightly off for this
 * specific case (we don't actually know yet), but it's a rare, short-lived
 * state and doesn't warrant a fourth visual variant.
 */
const EMPTY_MODEL = {
  hasExam: false,
  streak: 0,
  availableWidgetSizes: ['small', 'medium'],
  exams: [],
  tasksToday: [],
};

/**
 * Reads from AsyncStorage, never Firestore: this handler can run headless,
 * with the app process dead, on a 30-minute OS alarm. Real data only ever
 * arrives via `syncHomeScreenWidgets` (services/widgetData.js), called from
 * the live app after it refreshes exams/plan/streak — see
 * app/dashboard/index.js `fetchData`.
 */
export async function widgetTaskHandler(props) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const model = (await loadCachedWidgetModel()) || EMPTY_MODEL;
      props.renderWidget(renderWidgetForName(props.widgetInfo.widgetName, model));
      break;
    }

    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
    default:
      // Taps use the built-in OPEN_APP / OPEN_URI click actions (see
      // widgets/ScheduioWidget.js), which the library resolves natively
      // without ever calling this handler — nothing custom to do here.
      break;
  }
}
