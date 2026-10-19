package com.fluely.mobile

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.*
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.*
import android.provider.Settings
import android.util.Base64
import android.view.*
import android.widget.*
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** User-started foreground capture. No boot receiver, background restart, or hidden capture. */
class FluelyCaptureService : Service() {
    companion object {
        const val OVERLAY = "com.fluely.mobile.OVERLAY"
        const val MICROPHONE = "com.fluely.mobile.MICROPHONE"
        const val SCREEN = "com.fluely.mobile.SCREEN"
        @Volatile var instance: FluelyCaptureService? = null
        @Volatile var captureReply: ((String?, String?) -> Unit)? = null
        fun failCapture(error: String) { val reply = captureReply; captureReply = null; reply?.invoke(null, error); instance?.let { Handler(Looper.getMainLooper()).post { it.stopProjection(); it.stopIfIdle() } } }
    }
    @Volatile var recording = false; private set
    var overlayVisible = false; private set
    private var overlay: View? = null
    private var recorder: AudioRecord? = null
    private var worker: Thread? = null
    private val pcm = ByteArrayOutputStream()
    private var recordingError: String? = null
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var foregroundTypes = 0
    override fun onBind(intent: Intent?) = null
    override fun onCreate() { super.onCreate(); instance = this }
    private fun foreground(type: Int) {
        foregroundTypes = foregroundTypes or type
        val channel = "fluely_capture"
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(channel, "Fluely active controls and capture", NotificationManager.IMPORTANCE_LOW))
        val open = packageManager.getLaunchIntentForPackage(packageName)
        val notification = Notification.Builder(this, channel).setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Fluely is active").setContentText("Tap to open Fluely. Stop capture or the overlay in Fluely.").setOngoing(true)
        if (open != null) notification.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        if (Build.VERSION.SDK_INT >= 29) startForeground(14, notification.build(), foregroundTypes) else startForeground(14, notification.build())
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try { when (intent?.action) {
            OVERLAY -> { foreground(if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0); showOverlay() }
            MICROPHONE -> { foreground(if (Build.VERSION.SDK_INT >= 30) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0); record() }
            SCREEN -> { foreground(if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0); capture(intent) }
            else -> stopSelf()
        } } catch (failure: Exception) { failCapture(failure.message ?: "Foreground capture failed"); recordingError = failure.message; stopSelf() }
        return START_NOT_STICKY
    }
    private fun showOverlay() {
        if (!Settings.canDrawOverlays(this)) throw SecurityException("Overlay permission was revoked")
        if (overlay != null) return
        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(16, 12, 16, 12); setBackgroundColor(0xee171923.toInt())
            addView(TextView(context).apply { text = "Fluely"; setTextColor(0xffffffff.toInt()) })
            addView(Button(context).apply { text = "Open chat"; setOnClickListener { packageManager.getLaunchIntentForPackage(packageName)?.let { it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(it) } } })
            addView(Button(context).apply { text = "Close overlay"; setOnClickListener { hideOverlay() } })
        }
        val params = WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.END; x = 16; y = 96 }
        getSystemService(WindowManager::class.java).addView(controls, params); overlay = controls; overlayVisible = true
    }
    fun hideOverlay() { Handler(Looper.getMainLooper()).post {
        overlay?.let { getSystemService(WindowManager::class.java).removeView(it) }; overlay = null; overlayVisible = false; stopIfIdle()
    } }
    private fun record() {
        if (recording) return
        pcm.reset(); recordingError = null
        val size = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT).coerceAtLeast(4096)
        val audio = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
        if (audio.state != AudioRecord.STATE_INITIALIZED) { audio.release(); throw IllegalStateException("Microphone could not initialize") }
        recorder = audio; audio.startRecording(); recording = true
        worker = Thread {
            val buffer = ByteArray(size)
            try { while (recording && pcm.size() < 16000 * 2 * 120) { val count = audio.read(buffer, 0, buffer.size); if (count < 0) throw IllegalStateException("Microphone read failed: $count"); if (count > 0) pcm.write(buffer, 0, count) } }
            catch (failure: Exception) { recordingError = failure.message }
            finally { recording = false; try { audio.stop() } catch (_: Exception) {}; audio.release(); recorder = null }
        }.apply { start() }
    }
    fun stopRecording(): String {
        recording = false; worker?.join(3000)
        if (worker?.isAlive == true) throw IllegalStateException("Microphone is still stopping; try again")
        worker = null; recordingError?.let { throw IllegalStateException(it) }
        val data = pcm.toByteArray(); if (data.isEmpty()) throw IllegalStateException("No audio was recorded")
        val wav = ByteBuffer.allocate(44 + data.size).order(ByteOrder.LITTLE_ENDIAN)
        wav.put("RIFF".toByteArray()).putInt(36 + data.size).put("WAVEfmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(16000).putInt(32000).putShort(2).putShort(16).put("data".toByteArray()).putInt(data.size).put(data)
        pcm.reset(); Handler(Looper.getMainLooper()).post { stopIfIdle() }; return Base64.encodeToString(wav.array(), Base64.NO_WRAP)
    }
    private fun capture(intent: Intent) {
        stopProjection()
        val consent = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra("consent", Intent::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra<Intent>("consent")
        val manager = getSystemService(MediaProjectionManager::class.java)
        val next = manager.getMediaProjection(intent.getIntExtra("resultCode", Activity.RESULT_CANCELED), consent ?: throw IllegalStateException("Screen consent missing"))
        projection = next
        next.registerCallback(object : MediaProjection.Callback() { override fun onStop() { failCapture("Screen capture permission ended"); stopProjection(); stopIfIdle() } }, Handler(Looper.getMainLooper()))
        val metrics = resources.displayMetrics; val width = metrics.widthPixels; val height = metrics.heightPixels
        val images = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2); reader = images
        images.setOnImageAvailableListener({ source ->
            val frame = source.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                val plane = frame.planes[0]; val paddedWidth = plane.rowStride / plane.pixelStride
                val padded = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888); padded.copyPixelsFromBuffer(plane.buffer)
                val bitmap = Bitmap.createBitmap(padded, 0, 0, width, height); val bytes = ByteArrayOutputStream(); bitmap.compress(Bitmap.CompressFormat.JPEG, 90, bytes)
                val reply = captureReply; captureReply = null; reply?.invoke(Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP), null)
                bitmap.recycle(); if (bitmap !== padded) padded.recycle()
            } catch (failure: Exception) { failCapture(failure.message ?: "Cannot read screen") }
            finally { frame.close(); stopProjection(); stopIfIdle() }
        }, Handler(Looper.getMainLooper()))
        display = next.createVirtualDisplay("Fluely consented capture", width, height, metrics.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, images.surface, null, null)
    }
    private fun stopProjection() { display?.release(); display = null; reader?.close(); reader = null; val old = projection; projection = null; old?.stop() }
    private fun stopIfIdle() { if (!overlayVisible && !recording && projection == null) stopSelf() }
    override fun onDestroy() { recording = false; recorder?.let { try { it.stop() } catch (_: Exception) {} }; overlay?.let { getSystemService(WindowManager::class.java).removeView(it) }; overlay = null; overlayVisible = false; stopProjection(); failCapture("Fluely capture service stopped"); instance = null; super.onDestroy() }
}
