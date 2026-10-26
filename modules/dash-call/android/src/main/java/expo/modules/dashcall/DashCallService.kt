package expo.modules.dashcall

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * The "DASH call in progress" foreground service. While it runs, Android keeps the app's process,
 * microphone (and camera, while it is on) working after the user leaves the app.
 *
 *  - Started by DashCallModule.start() when a call connects; stopped by stop() on hang-up, when the
 *    React instance goes away (reload / crash), and by Android when the app is swiped away
 *    (stopWithTask="true" in the manifest, plus onTaskRemoved below).
 *  - Type microphone, plus camera while the user's camera is on (Android 11+). Android 14 refuses a
 *    camera-type service without the camera permission, so the camera type is only asked for when it
 *    is granted, and the service falls back to microphone only.
 *  - Its notification has its own channel ("Calls in progress", silent) and a "Leave call" action.
 */
class DashCallService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_LEAVE -> {
        val listener = onLeave
        if (listener != null) listener("notification") else shutDown()
        return START_NOT_STICKY
      }
      ACTION_STOP -> {
        shutDown()
        return START_NOT_STICKY
      }
    }
    val title = intent?.getStringExtra(EXTRA_TITLE)
    val video = intent?.getBooleanExtra(EXTRA_VIDEO, false) ?: false
    if (!goForeground(buildNotification(title), video)) {
      shutDown()
      return START_NOT_STICKY
    }
    running = true
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // The app was swiped away from Recents: leave the call (bye + /leave from JS if it is still
    // alive) and stop. The process goes with the task.
    onLeave?.invoke("task-removed")
    shutDown()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  private fun shutDown() {
    running = false
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
      else @Suppress("DEPRECATION") stopForeground(true)
    } catch (e: Throwable) {
      Log.w(TAG, "stopForeground failed", e)
    }
    stopSelf()
  }

  private fun granted(permission: String) = checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  /** startForeground with the right types; falls back step by step so the service never crashes the app. */
  private fun goForeground(notification: Notification, video: Boolean): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val mic = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      val attempts = buildList {
        if (video && granted(Manifest.permission.CAMERA)) add(mic or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
        add(mic)
      }
      for (types in attempts) {
        try {
          startForeground(NOTIFICATION_ID, notification, types)
          return true
        } catch (e: Throwable) {
          Log.w(TAG, "startForeground(types=$types) refused", e)
        }
      }
      return false
    }
    return try {
      startForeground(NOTIFICATION_ID, notification)
      true
    } catch (e: Throwable) {
      Log.w(TAG, "startForeground refused", e)
      false
    }
  }

  private fun buildNotification(title: String?): Notification {
    ensureChannel(this)
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      // Like tapping the app icon: brings the running app (and its call screen) back to the front.
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    }
    val immutable = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    val content = launch?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or immutable) }
    val leave = PendingIntent.getService(
      this,
      1,
      Intent(this, DashCallService::class.java).setAction(ACTION_LEAVE),
      PendingIntent.FLAG_UPDATE_CURRENT or immutable,
    )
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
      else @Suppress("DEPRECATION") Notification.Builder(this).setPriority(Notification.PRIORITY_LOW)
    builder
      .setSmallIcon(R.drawable.dash_call_notification)
      .setColor(Color.parseColor("#C33B02"))
      .setContentTitle("DASH call in progress")
      .setContentText(if (title.isNullOrBlank()) "Tap to return" else "$title · Tap to return")
      .setOngoing(true)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setWhen(System.currentTimeMillis())
      .setCategory(Notification.CATEGORY_CALL)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
    if (content != null) builder.setContentIntent(content)
    @Suppress("DEPRECATION")
    builder.addAction(Notification.Action.Builder(null, "Leave call", leave).build())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }
    return builder.build()
  }

  companion object {
    private const val TAG = "DashCallService"
    const val CHANNEL_ID = "dash-calls"
    const val NOTIFICATION_ID = 7341
    const val EXTRA_TITLE = "title"
    const val EXTRA_VIDEO = "video"
    const val ACTION_LEAVE = "expo.modules.dashcall.LEAVE"
    const val ACTION_STOP = "expo.modules.dashcall.STOP"

    @Volatile var running = false

    /** Set by DashCallModule: the user asked to leave from the notification, or swiped the app away. */
    @Volatile var onLeave: ((reason: String) -> Unit)? = null

    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      val channel = NotificationChannel(CHANNEL_ID, "Calls in progress", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while you are in a DASH call, so the call keeps going when you leave the app."
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
      nm.createNotificationChannel(channel)
    }
  }
}
