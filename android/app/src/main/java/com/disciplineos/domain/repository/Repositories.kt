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

interface FocusRepository {
    suspend fun start(plannedDurationSeconds: Int, associatedTaskId: String? = null): Result<FocusSession>
    suspend fun heartbeat(sessionId: String): Result<FocusSession>
    suspend fun complete(sessionId: String): Result<FocusSession>
    suspend fun abandon(sessionId: String): Result<FocusSession>
}

interface LedgerRepository {
    fun getTimeBankFlow(): Flow<TimeBank?>
    suspend fun syncBalance(): Result<TimeBank>
    suspend fun claimTaskReward(
        taskId: String,
        occurrenceDate: String,
        evidenceSessionId: String? = null,
        photoEvidenceId: String? = null,
    ): Result<TimeBank>
}
interface TaskRepository {
    fun getTasksFlow(): Flow<List<TaskItem>>
    suspend fun syncTasks(): Result<Unit>
    suspend fun submitPhotoEvidence(taskId: String, occurrenceDate: String, sha256: String): Result<String>
    suspend fun createTask(title: String, description: String?, evidenceType: String, isRecurring: Boolean): Result<TaskItem>
    suspend fun completeTask(taskId: String, occurrenceDate: String, evidenceSessionId: String? = null, photoEvidenceId: String? = null): Result<TimeBank>
}

interface ReserveRepository {
    fun getReserveFlow(): Flow<DeviceReserve?>
    suspend fun allocateReserve(seconds: Int): Result<DeviceReserve>
    suspend fun spendOffline(targetType: String, targetIdentifier: String, seconds: Int, isEmergency: Boolean): Result<ActiveLease>
    suspend fun reconcileOutbox(): Result<Unit>
}
