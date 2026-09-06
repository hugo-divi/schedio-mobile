import 'expo-router/entry';
import { Platform } from 'react-native';

// Widgets are an Android home-screen feature — react-native-android-widget
// has nothing to register on web, and importing it unconditionally would
// pull Android-only native-module glue into the web bundle for no reason.
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./widgets/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
