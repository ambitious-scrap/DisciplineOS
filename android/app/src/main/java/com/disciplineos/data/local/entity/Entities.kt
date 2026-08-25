package com.disciplineos.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "blocked_apps")
data class BlockedAppEntity(
    @PrimaryKey val id: String,
    val packageName: String,
    val displayName: String,
    val isActive: Boolean
)

@Entity(tableName = "blocked_sites")
data class BlockedSiteEntity(
    @PrimaryKey val id: String,
    val domain: String,
    val isActive: Boolean
)

@Entity(tableName = "active_leases")
data class ActiveLeaseEntity(
    @PrimaryKey val id: String,
    val deviceId: String = "",
    val identifier: String,
    val type: String,
    val expiresAtEpochMs: Long,
    val isEmergency: Boolean,
    val leaseSignature: String,
    val canonicalPayload: String = "",
    val keyId: String = "",
    val policyVersion: Int = 0,
    val verifiedAtElapsedRealtime: Long = 0L,
    val monotonicDeadlineElapsedRealtime: Long = 0L,
    val bootId: Long = -1L,
)

@Entity(tableName = "device_reserves")
data class DeviceReserveEntity(
    @PrimaryKey val id: String,
    val totalReservedSeconds: Int,
    val remainingSeconds: Int,
    val expiresAtEpochMs: Long
)

@Entity(tableName = "offline_spend_outbox")
data class OfflineSpendEntity(
    @PrimaryKey val eventId: String,
    val targetType: String,
    val targetIdentifier: String,
    val secondsSpent: Int,
    val timestamp: Long,
    val isEmergency: Boolean,
    val isReconciled: Boolean
)

@Entity(tableName = "policy_metadata")
data class PolicyMetadataEntity(
    @PrimaryKey val id: Int = 1,
    val revision: Int,
    val syncedAtEpochMs: Long,
)

@Entity(tableName = "protection_event_outbox")
data class ProtectionEventOutboxEntity(
    @PrimaryKey val eventId: String,
    val deviceId: String,
    val eventType: String,
    val detailsJson: String,
    val occurredAt: String,
)
