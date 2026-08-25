package com.disciplineos.enforcement

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import com.disciplineos.domain.repository.PolicyRepository
import com.disciplineos.domain.repository.SessionRepository
import com.disciplineos.receiver.DisciplineDeviceAdminReceiver
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first

class ForegroundAppDetector(
    private val context: Context,
    private val checkIsAppBlockedUseCase: CheckIsAppBlockedUseCase,
    private val policyRepository: PolicyRepository,
    private val sessionRepository: SessionRepository
) {
    private val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    private var isRunning = false
    private var lastForegroundPackage: String? = null
    private val suspendedPackages = mutableSetOf<String>()

    fun startMonitoring(scope: CoroutineScope) {
        if (isRunning) return
        isRunning = true

        scope.launch(Dispatchers.Default) {
            var hardModeTick = 0
            while (isRunning) {
                checkForegroundApp()
                if (++hardModeTick >= 3) {
                    hardModeTick = 0
                    reconcileDeviceOwnerPolicy()
                }
                delay(300)
            }
        }
    }

    fun stopMonitoring() {
        isRunning = false
        suspendedPackages.clear()
    }

    suspend fun checkForegroundApp() {
        val currentPackage = getForegroundPackageName() ?: return
        if (currentPackage == context.packageName) return

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

    private suspend fun reconcileDeviceOwnerPolicy() {
        if (!DisciplineDeviceAdminReceiver.isDeviceOwner(context)) return
        val blockedApps = policyRepository.getBlockedAppsFlow().first()
            .filter { it.isActive && it.packageName != context.packageName }
        val blockedPackages = blockedApps.map { it.packageName }.toSet()
        val knownPackages = suspendedPackages.toSet() + blockedPackages

        for (packageName in knownPackages) {
            val lease = sessionRepository.getActiveLeaseForIdentifier(packageName)
            val shouldSuspend = packageName in blockedPackages && (lease == null || lease.isExpired)
            if (shouldSuspend && suspendedPackages.add(packageName)) {
                DisciplineDeviceAdminReceiver.suspendPackages(context, arrayOf(packageName), true)
            } else if (!shouldSuspend && suspendedPackages.remove(packageName)) {
                DisciplineDeviceAdminReceiver.suspendPackages(context, arrayOf(packageName), false)
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
