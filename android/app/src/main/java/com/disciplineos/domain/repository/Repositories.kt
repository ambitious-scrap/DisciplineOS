package com.disciplineos.domain.repository

import com.disciplineos.domain.model.*
import kotlinx.coroutines.flow.Flow

interface PolicyRepository {
    fun getBlockedAppsFlow(): Flow<List<BlockedApp>>
    fun getBlockedSitesFlow(): Flow<List<BlockedSite>>
    suspend fun isAppBlocked(packageName: String): Boolean
    suspend fun isDomainBlocked(domain: String): Boolean
    suspend fun syncPolicy(): Result<Unit>
    suspend fun getPolicyMetadata(): PolicyCacheMetadata
    suspend fun addApp(packageName: String, displayName: String): Result<Unit>
    suspend fun addSite(domain: String): Result<Unit>
    suspend fun requestRemoveApp(id: String): Result<Unit>
    suspend fun requestRemoveSite(id: String): Result<Unit>
}

interface SessionRepository {
    fun getActiveLeasesFlow(): Flow<List<ActiveLease>>
    suspend fun getActiveLeaseForIdentifier(identifier: String, type: String): ActiveLease?
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

interface TaskRepository {
    fun getTasksFlow(): Flow<List<TaskItem>>
    suspend fun createTask(title: String, description: String?, rewardSeconds: Int, evidenceType: String, isRecurring: Boolean): Result<TaskItem>
    suspend fun completeTask(taskId: String, occurrenceDate: String, evidenceUrl: String?): Result<TimeBank>
}

interface ReserveRepository {
    fun getReserveFlow(): Flow<DeviceReserve?>
    suspend fun allocateReserve(seconds: Int): Result<DeviceReserve>
    suspend fun spendOffline(targetType: String, targetIdentifier: String, seconds: Int, isEmergency: Boolean): Result<ActiveLease>
    suspend fun reconcileOutbox(): Result<Unit>
}
