package com.disciplineos.location

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.util.Log
data class MovementSummary(
    val stepDelta: Int,
    val activeSeconds: Int,
    val sampleCount: Int,
    val monotonicDurationMs: Long,
)

class ActivityRecognitionTracker(private val context: Context) : SensorEventListener {
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val stepDetectorSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
    private var detectedStepsDuringDwell = 0
    private var sampleCount = 0
    private var trackingStartedElapsed = 0L
    private var isTracking = false

    fun startTracking() {
        detectedStepsDuringDwell = 0
        sampleCount = 0
        trackingStartedElapsed = SystemClock.elapsedRealtime()
        isTracking = true
        if (stepDetectorSensor != null) {
            sensorManager.registerListener(this, stepDetectorSensor, SensorManager.SENSOR_DELAY_NORMAL)
        }
    }

    fun stopTrackingAndSummarize(): MovementSummary {
        val elapsed = (SystemClock.elapsedRealtime() - trackingStartedElapsed).coerceAtLeast(0L)
        isTracking = false
        sensorManager.unregisterListener(this)
        return MovementSummary(
            stepDelta = detectedStepsDuringDwell,
            activeSeconds = (elapsed / 1_000L).toInt(),
            sampleCount = sampleCount,
            monotonicDurationMs = elapsed,
        )
    }

    fun stopTrackingAndValidate(minimumStepsRequired: Int = 100): Boolean {
        val summary = stopTrackingAndSummarize()
        val isVerified = summary.stepDelta >= minimumStepsRequired
        Log.i("ActivityTracker", "Dwell steps recorded: ${summary.stepDelta} (Verified: $isVerified)")
        return isVerified
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_STEP_DETECTOR && isTracking) {
            detectedStepsDuringDwell++
            sampleCount++
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
