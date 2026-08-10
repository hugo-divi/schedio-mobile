// Web fallback for the study-session notification (notifee's foreground
// service is Android-only — there's no lock screen to show a chronometer on).
export const ACTION = { PAUSE: 'pause', RESUME: 'resume', STOP: 'stop' };

export const updateStudySessionNotification = async () => {};

export const stopStudySessionNotification = async () => {};

export const addNotificationActionListener = () => () => {};
