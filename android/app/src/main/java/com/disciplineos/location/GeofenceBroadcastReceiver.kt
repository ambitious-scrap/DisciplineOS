package com.disciplineos.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.disciplineos.DisciplineApplication
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class GeofenceBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) {
            Log.e(TAG, "Geofencing event error: ${event.errorCode}")
            return
        }
        val eventType = when (event.geofenceTransition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
            Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
            Geofence.GEOFENCE_TRANSITION_DWELL -> "dwell"
            else -> return
        }
        val application = context.applicationContext as? DisciplineApplication
        if (eventType == "enter") application?.activityRecognitionTracker?.startTracking()
        val movement = if (eventType == "exit") {
            application?.activityRecognitionTracker?.stopTrackingAndSummarize()
        } else {
            null
        }
        val pendingResult = goAsync()
        val geofences = event.triggeringGeofences.orEmpty()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                for (geofence in geofences) {
                    val geofenceId = geofence.requestId
                    val locationType = if (geofenceId.startsWith("gym", ignoreCase = true)) "gym" else "home"
                    application?.locationEvidenceRepository?.report(
                        locationType = locationType,
                        placeIdentifier = geofenceId,
                        eventType = eventType,
                        steps = movement?.stepDelta ?: 0,
                        activeSeconds = movement?.activeSeconds ?: 0,
                        sampleCount = movement?.sampleCount ?: 0,
                    )
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        private const val TAG = "GeofenceReceiver"
    }
}
