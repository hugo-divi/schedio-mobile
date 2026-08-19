import { requireNativeModule } from 'expo-modules-core';

// Only ever resolvable on Android — expo-module.config.json declares no iOS
// platform, so this import must stay behind a Platform.OS === 'android'
// check on the JS side (see services/focusMode.js).
export default requireNativeModule('ExpoFocusMode');
