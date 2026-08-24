package com.disciplineos.domain.model

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
    val identifier: String, // package name or domain
    val type: String, // "app" or "site"
    val expiresAtEpochMs: Long,
    val isEmergency: Boolean,
    val leaseSignature: String
) {
    val isExpired: Boolean
        get() = System.currentTimeMillis() >= expiresAtEpochMs
}

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
