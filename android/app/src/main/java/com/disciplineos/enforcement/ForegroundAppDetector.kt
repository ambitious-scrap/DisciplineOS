package com.disciplineos.enforcement

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import com.disciplineos.domain.repository.PolicyRepository
import com.disciplineos.domain.repository.SessionRepository
import com.disciplineos.domain.usecase.CheckIsAppBlockedUseCase
import com.disciplineos.ui.overlay.BlockOverlayActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class ForegroundAppDetector(
    private val context: Context,
    private val checkIsAppBlockedUseCase: CheckIsAppBlockedUseCase,
    private val policyRepository: PolicyRepository,
    private val sessionRepository: SessionRepository,
    private val enforcementController: EnforcementController,
    private val protectionStateManager: ProtectionStateManager,
) {
    private val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    private var lastForegroundPackage: String? = null

    fun startMonitoring(scope: CoroutineScope) {
        scope.launch(Dispatchers.Default) {
            var hardModeTick = 0
            while (isActive) {
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
        lastForegroundPackage = null
    }

    private suspend fun checkForegroundApp() {
        val currentPackage = getForegroundPackageName() ?: return
        if (currentPackage == context.packageName) return

        if (currentPackage != lastForegroundPackage) {
            lastForegroundPackage = currentPackage
            if (checkIsAppBlockedUseCase(currentPackage)) {
                launchBlockOverlay(currentPackage)
            }
        }
    }

    fun onWindowChanged(packageName: String, scope: CoroutineScope) {
        if (packageName == context.packageName) return
        scope.launch(Dispatchers.Default) {
            if (checkIsAppBlockedUseCase(packageName)) {
                launchBlockOverlay(packageName)
            }
        }
    }

    private suspend fun reconcileDeviceOwnerPolicy() {
        val blockedApps = policyRepository.getBlockedAppsFlow().first()
        val validLeases = sessionRepository.getActiveLeasesFlow().first()
        enforcementController.reconcile(
            blockedApps = blockedApps,
            validLeases = validLeases,
            protectionState = protectionStateManager.state.value,
        )
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
