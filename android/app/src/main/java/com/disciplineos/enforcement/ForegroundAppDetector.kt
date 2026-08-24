package com.disciplineos.enforcement

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import com.disciplineos.domain.usecase.CheckIsAppBlockedUseCase
import com.disciplineos.ui.overlay.BlockOverlayActivity
import kotlinx.coroutines.*

class ForegroundAppDetector(
    private val context: Context,
    private val checkIsAppBlockedUseCase: CheckIsAppBlockedUseCase
) {
    private val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    private var isRunning = false
    private var lastForegroundPackage: String? = null

    fun startMonitoring(scope: CoroutineScope) {
        if (isRunning) return
        isRunning = true

        scope.launch(Dispatchers.Default) {
            while (isRunning) {
                checkForegroundApp()
                delay(300) // Fast 300ms polling loop
            }
        }
    }

    fun stopMonitoring() {
        isRunning = false
    }

    suspend fun checkForegroundApp() {
        val currentPackage = getForegroundPackageName() ?: return
        if (currentPackage == context.packageName) return // Ignore DisciplineOS itself

        if (currentPackage != lastForegroundPackage) {
            lastForegroundPackage = currentPackage

            val isBlocked = checkIsAppBlockedUseCase(currentPackage)
            if (isBlocked) {
                launchBlockOverlay(currentPackage)
            }
        }
    }

    fun onWindowChanged(packageName: String, scope: CoroutineScope) {
        if (packageName == context.packageName) return
        scope.launch(Dispatchers.Default) {
            val isBlocked = checkIsAppBlockedUseCase(packageName)
            if (isBlocked) {
                launchBlockOverlay(packageName)
            }
        }
    }

    private fun getForegroundPackageName(): String? {
        val time = System.currentTimeMillis()
        val events = usageStatsManager.queryEvents(time - 1000 * 5, time)
        val event = UsageEvents.Event()
        var lastPkg: String? = null

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                lastPkg = event.packageName
            }
        }
        return lastPkg
    }

    private fun launchBlockOverlay(blockedPackage: String) {
        val intent = Intent(context, BlockOverlayActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(BlockOverlayActivity.EXTRA_BLOCKED_IDENTIFIER, blockedPackage)
            putExtra(BlockOverlayActivity.EXTRA_BLOCKED_TYPE, "app")
        }
        context.startActivity(intent)
    }
}
