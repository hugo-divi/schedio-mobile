package expo.modules.focusmode

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Thin wrapper around Android's Notification Policy Access (Do Not
 * Disturb). No manifest permission exists for this — it's a "special app
 * access" the student grants manually in system Settings, checked and used
 * here purely through NotificationManager.
 */
class ExpoFocusModeModule : Module() {
  private val notificationManager: NotificationManager?
    get() =
      appContext.reactContext?.getSystemService(Context.NOTIFICATION_SERVICE)
        as? NotificationManager

  override fun definition() = ModuleDefinition {
    Name("ExpoFocusMode")

    Function("hasPermission") {
      notificationManager?.isNotificationPolicyAccessGranted ?: false
    }

    Function("openPermissionSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      appContext.reactContext?.startActivity(intent)
    }

    // INTERRUPTION_FILTER_PRIORITY, not _NONE: silences generic notification
    // noise for the session while still respecting whatever the student has
    // already configured as their own DND exceptions on the device (alarms,
    // repeat callers, starred contacts...) — we only flip the filter, we
    // never touch their actual policy configuration.
    Function("enable") {
      val manager = notificationManager
      if (manager != null && manager.isNotificationPolicyAccessGranted) {
        manager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
        true
      } else {
        false
      }
    }

    Function("disable") {
      val manager = notificationManager
      if (manager != null && manager.isNotificationPolicyAccessGranted) {
        manager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL)
      }
      true
    }
  }
}
