package com.disciplineos.domain.repository

import com.disciplineos.domain.model.*
import kotlinx.coroutines.flow.Flow

interface PolicyRepository {
    fun getBlockedAppsFlow(): Flow<List<BlockedApp>>
    fun getBlockedSitesFlow(): Flow<List<BlockedSite>>
    suspend fun isAppBlocked(packageName: String): Boolean
    suspend fun isDomainBlocked(domain: String): Boolean
    suspend fun syncPolicy(): Result<Unit>
}

interface SessionRepository {
    fun getActiveLeasesFlow(): Flow<List<ActiveLease>>
    suspend fun getActiveLeaseForIdentifier(identifier: String): ActiveLease?
    suspend fun requestUnlock(identifier: String, type: String, seconds: Int): Result<ActiveLease>
    suspend fun requestEmergencyUnlock(identifier: String, type: String, seconds: Int): Result<ActiveLease>
    suspend fun saveLease(lease: ActiveLease)
    suspend fun clearExpiredLeases()
}

interface LedgerRepository {
    fun getTimeBankFlow(): Flow<TimeBank?>
    suspend fun syncBalance(): Result<TimeBank>
    suspend fun claimTaskReward(taskId: String, occurrenceDate: String, evidenceUrl: String?): Result<TimeBank>
}

interface ReserveRepository {
    fun getReserveFlow(): Flow<DeviceReserve?>
    suspend fun allocateReserve(seconds: Int): Result<DeviceReserve>
    suspend fun spendOffline(targetType: String, targetIdentifier: String, seconds: Int, isEmergency: Boolean): Result<ActiveLease>
    suspend fun reconcileOutbox(): Result<Unit>
}
