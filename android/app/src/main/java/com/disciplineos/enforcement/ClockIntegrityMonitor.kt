package com.disciplineos.enforcement

import android.content.Context
import android.os.SystemClock
import kotlin.math.abs

class ClockIntegrityMonitor(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun check(): Boolean {
        val nowWall = System.currentTimeMillis()
        val nowElapsed = SystemClock.elapsedRealtime()
        val previousWall = preferences.getLong(WALL_CLOCK_KEY, Long.MIN_VALUE)
        val previousElapsed = preferences.getLong(ELAPSED_KEY, Long.MIN_VALUE)

        val rebooted = previousElapsed == Long.MIN_VALUE || nowElapsed < previousElapsed
        val anomaly = if (rebooted) {
            false
        } else {
            val expectedWall = previousWall + (nowElapsed - previousElapsed)
            abs(nowWall - expectedWall) > CLOCK_JUMP_THRESHOLD_MS
        }

        preferences.edit()
            .putLong(WALL_CLOCK_KEY, nowWall)
            .putLong(ELAPSED_KEY, nowElapsed)
            .apply()
        return anomaly
    }

    private companion object {
        const val PREFERENCES = "disciplineos_protection"
        const val WALL_CLOCK_KEY = "wall_clock_at_reference"
        const val ELAPSED_KEY = "elapsed_realtime_at_reference"
        const val CLOCK_JUMP_THRESHOLD_MS = 5 * 60_000L
    }
}
