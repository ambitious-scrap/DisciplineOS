package com.disciplineos.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
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

        val transition = event.geofenceTransition
        val triggeringGeofences = event.triggeringGeofences ?: return

        for (geofence in triggeringGeofences) {
            val geofenceId = geofence.requestId
            when (transition) {
                Geofence.GEOFENCE_TRANSITION_ENTER -> {
                    Log.i(TAG, "Entered geofence: $geofenceId")
                    handleGeofenceEnter(context, geofenceId)
                }
                Geofence.GEOFENCE_TRANSITION_EXIT -> {
                    Log.i(TAG, "Exited geofence: $geofenceId")
                    handleGeofenceExit(context, geofenceId)
                }
                Geofence.GEOFENCE_TRANSITION_DWELL -> {
                    Log.i(TAG, "Dwelling in geofence: $geofenceId")
                }
            }
        }
    }

    private fun handleGeofenceEnter(context: Context, geofenceId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            // Record enter timestamp locally
        }
    }

    private fun handleGeofenceExit(context: Context, geofenceId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            // Measure dwell duration & trigger reward evaluation
        }
    }

    companion object {
        private const val TAG = "GeofenceReceiver"
    }
}
