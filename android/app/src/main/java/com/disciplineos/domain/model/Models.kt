package com.disciplineos.domain.model

import android.os.SystemClock

data class BlockedApp(
    val id: String,
    val packageName: String,
    val displayName: String,
    val isActive: Boolean
)

data class BlockedSite(
    val id: String,
    val domain: String,
    val isActive: Boolean
)

data class ActiveLease(
    val id: String,
    val deviceId: String,
    val identifier: String, // package name or domain
    val type: String, // "app" or "site"
    val expiresAtEpochMs: Long,
    val isEmergency: Boolean,
    val leaseSignature: String,
    val canonicalPayload: String,
    val keyId: String,
    val policyVersion: Int,
    val verifiedAtElapsedRealtime: Long,
    val monotonicDeadlineElapsedRealtime: Long,
) {
    val isExpired: Boolean
        get() = isExpiredAt(SystemClock.elapsedRealtime())

    fun isExpiredAt(elapsedRealtime: Long): Boolean {
        return elapsedRealtime >= monotonicDeadlineElapsedRealtime
    }
}

data class PolicyCacheMetadata(
    val revision: Int,
    val syncedAtEpochMs: Long?,
)

data class TimeBank(
    val balanceSeconds: Int,
    val availableSeconds: Int,
    val reservedSeconds: Int,
    val maxSeconds: Int
)

data class TaskItem(
    val id: String,
    val title: String,
    val description: String?,
    val rewardSeconds: Int,
    val evidenceType: String,
    val isRecurring: Boolean
)

data class DeviceReserve(
    val id: String,
    val totalReservedSeconds: Int,
    val remainingSeconds: Int,
    val expiresAtEpochMs: Long
)

data class OfflineSpendRecord(
    val eventId: String,
    val targetType: String,
    val targetIdentifier: String,
    val secondsSpent: Int,
    val timestamp: Long,
    val isEmergency: Boolean,
    val isReconciled: Boolean
)

data class FocusSession(
    val id: String,
    val plannedDurationSeconds: Int,
    val serverStartedAt: String,
    val status: String,
    val observedDurationSeconds: Int,
    val rewardSeconds: Int,
    val rewardClaimed: Boolean,
)
