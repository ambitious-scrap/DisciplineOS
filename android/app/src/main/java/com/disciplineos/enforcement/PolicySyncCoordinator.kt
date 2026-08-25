package com.disciplineos.enforcement

import com.disciplineos.domain.repository.PolicyRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class PolicySyncCoordinator(
    private val policyRepository: PolicyRepository,
    private val protectionStateManager: ProtectionStateManager,
    private val eventReporter: ProtectionEventReporter,
    private val clockIntegrityMonitor: ClockIntegrityMonitor,
) {
    private var started = false
    private var failureReported = false

    fun start(scope: CoroutineScope) {
        if (started) return
        started = true
        scope.launch {
            while (isActive) {
                syncNow()
                delay(SYNC_INTERVAL_MS)
            }
        }
    }

    suspend fun syncNow(): Result<Unit> {
        if (clockIntegrityMonitor.check()) {
            protectionStateManager.markDegraded(ProtectionFlag.CLOCK_ANOMALY)
            eventReporter.report("clock_changed")
        }

        val result = policyRepository.syncPolicy()
        if (result.isSuccess) {
            val metadata = policyRepository.getPolicyMetadata()
            protectionStateManager.markPolicySync(
                revision = metadata.revision,
                syncedAtEpochMs = metadata.syncedAtEpochMs ?: System.currentTimeMillis(),
            )
            if (failureReported) {
                failureReported = false
                eventReporter.report("protection_restored")
            }
            eventReporter.flush()
        } else {
            val metadata = policyRepository.getPolicyMetadata()
            val stale = metadata.syncedAtEpochMs == null ||
                System.currentTimeMillis() - metadata.syncedAtEpochMs > MAX_POLICY_STALENESS_MS
            if (stale) {
                protectionStateManager.markDegraded(ProtectionFlag.POLICY_STALE)
            } else {
                protectionStateManager.markOfflineProtected()
            }
            protectionStateManager.markDegraded(ProtectionFlag.SERVER_UNREACHABLE)
            if (!failureReported) {
                failureReported = true
                eventReporter.report(
                    "policy_sync_failed",
                    mapOf("stale" to stale, "revision" to metadata.revision),
                )
            }
        }
        return result
    }

    private companion object {
        const val SYNC_INTERVAL_MS = 60_000L
        const val MAX_POLICY_STALENESS_MS = 10 * 60_000L
    }
}
