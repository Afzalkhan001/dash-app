package expo.modules.dashcall

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS side: src/features/calls/call-service.ts (requireOptionalNativeModule('DashCall'), so Expo Go and
 * the web build simply have no module and nothing changes there).
 *
 *  start(title, video)  — the call connected: foreground service + notification, keep-alive, ticks.
 *  update(title, video) — camera turned on/off (adds/removes the camera service type) or a new title.
 *  stop()               — hang-up: everything above is undone.
 *
 * Why a keep-alive: React Native pauses JS timers (setInterval/setTimeout) when the app goes to the
 * background, unless a headless JS task is running (JavaTimerManager). Without it the call's
 * heartbeat stops and the server drops us after ~45 s. While a call is on, a headless task
 * ("DashCallKeepAlive", registered in call-service.ts) stays open so timers keep running, and an
 * "onTick" event every 5 s drives the heartbeat as a second, timer-free path.
 */
class DashCallModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var ticking = false
  private var keepAliveTaskId: Int? = null
  private var keepAliveContext: ReactContext? = null

  private val tick = object : Runnable {
    override fun run() {
      if (!ticking) return
      try {
        sendEvent("onTick", mapOf("at" to System.currentTimeMillis()))
      } catch (e: Throwable) {
        Log.w(TAG, "onTick not delivered", e)
      }
      main.postDelayed(this, TICK_MS)
    }
  }

  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("DashCall")

    Events("onTick", "onLeaveRequested")

    OnCreate {
      context?.let { DashCallService.ensureChannel(it) }
    }

    Function("start") { title: String, video: Boolean ->
      DashCallService.onLeave = { reason ->
        try {
          sendEvent("onLeaveRequested", mapOf("reason" to reason))
        } catch (e: Throwable) {
          Log.w(TAG, "onLeaveRequested not delivered", e)
        }
      }
      val ok = startService(title, video)
      startKeepAlive()
      startTicks()
      ok
    }

    Function("update") { title: String, video: Boolean ->
      if (DashCallService.running) startService(title, video) else false
    }

    Function("stop") {
      stopAll()
    }

    Function("isRunning") {
      DashCallService.running
    }

    // The React instance is going away (reload, fatal error, app closing): never leave a call
    // notification or a keep-alive task behind.
    OnDestroy {
      stopAll()
    }
  }

  private fun startService(title: String, video: Boolean): Boolean {
    val ctx = context ?: return false
    val intent = Intent(ctx, DashCallService::class.java)
      .putExtra(DashCallService.EXTRA_TITLE, title)
      .putExtra(DashCallService.EXTRA_VIDEO, video)
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
      true
    } catch (e: Throwable) {
      // e.g. ForegroundServiceStartNotAllowedException when asked from the background (Android 12+).
      Log.w(TAG, "call service not started", e)
      false
    }
  }

  private fun stopAll() {
    DashCallService.onLeave = null
    stopTicks()
    stopKeepAlive()
    val ctx = context ?: return
    try {
      ctx.stopService(Intent(ctx, DashCallService::class.java))
    } catch (e: Throwable) {
      Log.w(TAG, "call service not stopped", e)
    }
    DashCallService.running = false
  }

  private fun startTicks() {
    main.post {
      if (ticking) return@post
      ticking = true
      main.postDelayed(tick, TICK_MS)
    }
  }

  private fun stopTicks() {
    ticking = false
    main.removeCallbacks(tick)
  }

  /** The exact ReactContext whose JavaTimerManager listens for headless tasks. */
  private fun reactContext(): ReactContext? {
    val app = appContext.reactContext?.applicationContext as? ReactApplication
    val fromHost = try {
      app?.reactHost?.currentReactContext
    } catch (e: Throwable) {
      null
    }
    return fromHost ?: (appContext.reactContext as? ReactContext)
  }

  private fun startKeepAlive() {
    main.post {
      if (keepAliveTaskId != null) return@post
      val rc = reactContext() ?: return@post
      try {
        val config = HeadlessJsTaskConfig(KEEP_ALIVE_TASK, Arguments.createMap(), 0, true)
        keepAliveTaskId = HeadlessJsTaskContext.getInstance(rc).startTask(config)
        keepAliveContext = rc
      } catch (e: Throwable) {
        Log.w(TAG, "keep-alive task not started", e)
      }
    }
  }

  private fun stopKeepAlive() {
    main.post {
      val id = keepAliveTaskId ?: return@post
      val rc = keepAliveContext
      keepAliveTaskId = null
      keepAliveContext = null
      if (rc == null) return@post
      try {
        val tasks = HeadlessJsTaskContext.getInstance(rc)
        if (tasks.isTaskRunning(id)) tasks.finishTask(id)
      } catch (e: Throwable) {
        Log.w(TAG, "keep-alive task not finished", e)
      }
    }
  }

  companion object {
    private const val TAG = "DashCall"
    private const val TICK_MS = 5_000L
    const val KEEP_ALIVE_TASK = "DashCallKeepAlive"
  }
}
