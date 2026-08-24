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
    val identifier: String,
    val type: String,
    val expiresAtEpochMs: Long,
    val isEmergency: Boolean,
    val leaseSignature: String
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
