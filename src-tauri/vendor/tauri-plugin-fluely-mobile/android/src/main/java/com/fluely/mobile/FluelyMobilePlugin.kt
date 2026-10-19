package com.fluely.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")])
class FluelyMobilePlugin(private val activity: Activity) : Plugin(activity) {
    private fun statusObject() = JSObject().apply {
        put("microphone", ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED)
        put("overlay", Settings.canDrawOverlays(activity))
        put("recording", FluelyCaptureService.instance?.recording == true)
        put("overlayVisible", FluelyCaptureService.instance?.overlayVisible == true)
    }
    @Command fun status(invoke: Invoke) { invoke.resolve(statusObject()) }
    @Command fun systemLocale(invoke: Invoke) { invoke.resolve(JSObject().apply { put("language", java.util.Locale.getDefault().language) }) }
    @Command fun requestMicrophone(invoke: Invoke) { requestPermissionForAlias("microphone", invoke, "microphoneResult") }
    @PermissionCallback fun microphoneResult(invoke: Invoke) { invoke.resolve(statusObject()) }
    @Command fun requestOverlay(invoke: Invoke) {
        startActivityForResult(invoke, Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${activity.packageName}")), "overlayResult")
    }
    @ActivityCallback fun overlayResult(invoke: Invoke, result: ActivityResult) { invoke.resolve(statusObject()) }
    private fun start(action: String, invoke: Invoke) {
        try {
            if (!activity.hasWindowFocus()) { invoke.reject("Open Fluely before starting a foreground service"); return }
            ContextCompat.startForegroundService(activity, Intent(activity, FluelyCaptureService::class.java).setAction(action))
            invoke.resolve(JSObject().apply { put("started", true) })
        } catch (failure: Exception) { invoke.reject(failure.message ?: "Cannot start Fluely service") }
    }
    @Command fun showOverlay(invoke: Invoke) {
        if (!Settings.canDrawOverlays(activity)) { invoke.reject("Allow display over other apps in Android settings first"); return }
        start(FluelyCaptureService.OVERLAY, invoke)
    }
    @Command fun hideOverlay(invoke: Invoke) { FluelyCaptureService.instance?.hideOverlay(); invoke.resolve(statusObject()) }
    @Command fun startMicrophone(invoke: Invoke) {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) { invoke.reject("Allow microphone permission first"); return }
        if (FluelyCaptureService.instance?.recording == true) { invoke.reject("Microphone is already recording"); return }
        start(FluelyCaptureService.MICROPHONE, invoke)
    }
    @Command fun stopMicrophone(invoke: Invoke) {
        val service = FluelyCaptureService.instance ?: run { invoke.reject("Microphone service is not running"); return }
        Thread {
            try { val audio = service.stopRecording(); activity.runOnUiThread { invoke.resolve(JSObject().apply { put("audioBase64", audio); put("mime", "audio/wav") }) } }
            catch (failure: Exception) { activity.runOnUiThread { invoke.reject(failure.message ?: "Cannot finish recording") } }
        }.start()
    }
    @Command fun captureScreen(invoke: Invoke) {
        if (FluelyCaptureService.captureReply != null) { invoke.reject("A screen request is already pending"); return }
        val manager = activity.getSystemService(MediaProjectionManager::class.java)
        startActivityForResult(invoke, manager.createScreenCaptureIntent(), "screenResult")
    }
    @ActivityCallback fun screenResult(invoke: Invoke, result: ActivityResult) {
        val consent = result.data
        if (result.resultCode != Activity.RESULT_OK || consent == null) { invoke.reject("Screen capture consent was declined"); return }
        if (FluelyCaptureService.captureReply != null) { invoke.reject("A screen request is already pending"); return }
        val reply: (String?, String?) -> Unit = { image, error -> activity.runOnUiThread {
            if (image != null) invoke.resolve(JSObject().apply { put("imageBase64", image); put("mime", "image/jpeg") }) else invoke.reject(error ?: "Screen capture stopped")
        } }
        FluelyCaptureService.captureReply = reply
        try {
            ContextCompat.startForegroundService(activity, Intent(activity, FluelyCaptureService::class.java).setAction(FluelyCaptureService.SCREEN).putExtra("consent", consent).putExtra("resultCode", result.resultCode))
            Handler(Looper.getMainLooper()).postDelayed({ if (FluelyCaptureService.captureReply === reply) FluelyCaptureService.failCapture("Screen capture timed out") }, 15000)
        } catch (failure: Exception) { FluelyCaptureService.failCapture(failure.message ?: "Cannot start screen capture") }
    }
}
