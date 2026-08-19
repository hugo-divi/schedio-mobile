import { Platform } from 'react-native';

let ExpoFocusMode = null;
if (Platform.OS === 'android') {
  try {
    ExpoFocusMode = require('expo-focus-mode').default;
  } catch {
    // Old dev client, built before this module shipped — see the rebuild
    // note in the rollout summary. Every export below just no-ops instead
    // of crashing the study screen.
    ExpoFocusMode = null;
  }
}

export const isFocusModeSupported = () => Platform.OS === 'android' && !!ExpoFocusMode;

/** Whether the student has already granted Notification Policy Access (DND) in system settings. */
export const hasDndPermission = () => {
  if (!isFocusModeSupported()) return false;
  return ExpoFocusMode.hasPermission();
};

/** Android won't let us request this permission with an in-app dialog — this opens the system settings screen for it. */
export const openDndPermissionSettings = () => {
  if (!isFocusModeSupported()) return;
  ExpoFocusMode.openPermissionSettings();
};

/** Silences generic notifications for the duration of a study session. Returns false (and no-ops) if permission was revoked since the toggle was turned on. */
export const enableStudyFocus = () => {
  if (!isFocusModeSupported()) return false;
  return ExpoFocusMode.enable();
};

/** Restores normal notification behaviour. Safe to call even if it was never enabled. */
export const disableStudyFocus = () => {
  if (!isFocusModeSupported()) return;
  ExpoFocusMode.disable();
};
