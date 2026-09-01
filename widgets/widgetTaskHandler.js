import { loadCachedWidgetModel } from '../services/widgetData';
import { renderWidgetForName } from './ScheduioWidget';

/**
 * Shown before the app has ever synced real data to the widget — freshly
 * added, phone just restored, app never opened since install.
 *
 * `synced: false` is the whole point. This used to reuse the "no exam" empty
 * state, which claimed things we had no way of knowing yet: a widget added
 * before the first sync announced "Sin exámenes próximos" and a streak of 0
 * to a student who might have neither. The widgets render their own
 * "open the app" state off this flag instead.
 */
const EMPTY_MODEL = {
  synced: false,
  hasExam: false,
  streak: 0,
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
      const { widgetName } = props.widgetInfo;
      try {
        props.renderWidget(renderWidgetForName(widgetName, model));
      } catch (error) {
        // `renderWidget` builds the native view tree synchronously, and
        // anything it refuses (an unsupported element, a colour it can't
        // parse) throws right here — which drew nothing at all. A widget
        // that renders as a transparent hole is the worst outcome: it looks
        // broken, it can't be tapped to fix itself, and it still occupies
        // the cells. So the last resort is the one card that is always
        // renderable, and it opens the app.
        console.error(`Widget ${widgetName} failed to render`, error);
        props.renderWidget(renderWidgetForName(widgetName, EMPTY_MODEL));
      }
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
