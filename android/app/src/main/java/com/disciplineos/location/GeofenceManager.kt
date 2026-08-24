package com.disciplineos.location

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices

data class GeofenceArea(
    val id: String,
    val type: String, // "home", "gym", "custom"
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Float = 100f
)

class GeofenceManager(private val context: Context) {

    private val geofencingClient: GeofencingClient = LocationServices.getGeofencingClient(context)

    private val geofencePendingIntent: PendingIntent by lazy {
        val intent = Intent(context, GeofenceBroadcastReceiver::class.java)
        PendingIntent.getBroadcast(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
    }

    @SuppressLint("MissingPermission")
    fun registerGeofences(areas: List<GeofenceArea>) {
        if (areas.isEmpty()) return

        val geofenceList = areas.map { area ->
            Geofence.Builder()
                .setRequestId(area.id)
                .setCircularRegion(area.latitude, area.longitude, area.radiusMeters)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(
                    Geofence.GEOFENCE_TRANSITION_ENTER or
                    Geofence.GEOFENCE_TRANSITION_EXIT or
                    Geofence.GEOFENCE_TRANSITION_DWELL
                )
                .setLoiteringDelay(1000 * 60 * 5) // 5 min loiter
                .build()
        }

        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofences(geofenceList)
            .build()

        geofencingClient.addGeofences(request, geofencePendingIntent)
            .addOnSuccessListener {
                Log.i(TAG, "Successfully registered ${areas.size} geofences")
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to register geofences", e)
            }
    }

    fun removeGeofences() {
        geofencingClient.removeGeofences(geofencePendingIntent)
    }

    companion object {
        private const val TAG = "GeofenceManager"
    }
}
