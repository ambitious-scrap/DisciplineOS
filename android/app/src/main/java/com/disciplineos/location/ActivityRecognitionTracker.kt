package com.disciplineos.location

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log

class ActivityRecognitionTracker(private val context: Context) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val stepDetectorSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
    private var detectedStepsDuringDwell = 0
    private var isTracking = false

    fun startTracking() {
        detectedStepsDuringDwell = 0
        isTracking = true
        if (stepDetectorSensor != null) {
            sensorManager.registerListener(this, stepDetectorSensor, SensorManager.SENSOR_DELAY_NORMAL)
        }
    }

    fun stopTrackingAndValidate(minimumStepsRequired: Int = 100): Boolean {
        isTracking = false
        sensorManager.unregisterListener(this)
        val isVerified = detectedStepsDuringDwell >= minimumStepsRequired
        Log.i("ActivityTracker", "Dwell steps recorded: $detectedStepsDuringDwell (Verified: $isVerified)")
        return isVerified
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_STEP_DETECTOR && isTracking) {
            detectedStepsDuringDwell++
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
