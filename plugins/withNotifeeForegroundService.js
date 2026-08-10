const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Notifee ships no Expo config plugin of its own — the foreground-service
 * <service> entry has to be injected by hand. Android 14+ (this app targets
 * SDK 36) refuses to start a foreground service without a declared type, so
 * skipping this crashes the study-session notification at runtime instead of
 * just failing to build.
 *
 * Type is `specialUse`: sessions run 15–120 minutes (services/study.js),
 * well past `shortService`'s ~3-minute cap, and none of the other typed
 * categories (location, mediaPlayback, dataSync, …) describe "a visible
 * countdown for a study session." `specialUse` requires a Play Console
 * declaration with a justification before public release — sideloading a
 * dev build for local testing doesn't go through that review, so this
 * doesn't block testing on a device now.
 */
const withNotifeeForegroundService = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return config;

    if (!app.service) app.service = [];

    const alreadyDeclared = app.service.some(
      (service) => service.$?.['android:name'] === 'app.notifee.core.ForegroundService'
    );
    if (alreadyDeclared) return config;

    app.service.push({
      $: {
        'android:name': 'app.notifee.core.ForegroundService',
        'android:foregroundServiceType': 'specialUse',
        'android:exported': 'false',
      },
      property: [
        {
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value': 'Muestra el cronómetro de una sesión de estudio en curso',
          },
        },
      ],
    });

    return config;
  });

module.exports = withNotifeeForegroundService;
