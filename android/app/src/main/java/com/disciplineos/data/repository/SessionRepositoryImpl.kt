package com.disciplineos.data.repository

import com.disciplineos.data.local.dao.LeaseDao
import com.disciplineos.data.local.entity.ActiveLeaseEntity
import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.EmergencyUnlockRequestDto
import com.disciplineos.data.remote.dto.SpendPointsRequestDto
import com.disciplineos.domain.model.ActiveLease
import com.disciplineos.domain.repository.SessionRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

class SessionRepositoryImpl(
    private val leaseDao: LeaseDao,
    private val apiService: DisciplineApiService,
    private val deviceIdProvider: () -> String,
    private val tokenProvider: () -> String?
) : SessionRepository {

    override fun getActiveLeasesFlow(): Flow<List<ActiveLease>> {
        return leaseDao.getActiveLeasesFlow(System.currentTimeMillis()).map { entities ->
            entities.map {
                ActiveLease(
                    id = it.id,
                    identifier = it.identifier,
                    type = it.type,
                    expiresAtEpochMs = it.expiresAtEpochMs,
                    isEmergency = it.isEmergency,
                    leaseSignature = it.leaseSignature
                )
            }
        }
    }

    override suspend fun getActiveLeaseForIdentifier(identifier: String): ActiveLease? {
        val entity = leaseDao.getActiveLeaseForIdentifier(identifier, System.currentTimeMillis())
        return entity?.let {
            ActiveLease(
                id = it.id,
                identifier = it.identifier,
                type = it.type,
                expiresAtEpochMs = it.expiresAtEpochMs,
                isEmergency = it.isEmergency,
                leaseSignature = it.leaseSignature
            )
        }
    }

    override suspend fun requestUnlock(identifier: String, type: String, seconds: Int): Result<ActiveLease> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        val deviceId = deviceIdProvider()
        val idempotencyKey = "spend-${UUID.randomUUID()}"

        return try {
            val response = apiService.requestUnlock(
                token = "Bearer $token",
                request = SpendPointsRequestDto(
                    seconds = seconds,
                    targetType = type,
                    targetIdentifier = identifier,
                    deviceId = deviceId,
                    idempotencyKey = idempotencyKey
                )
            )

            if (response.isSuccessful && response.body()?.session != null) {
                val dto = response.body()!!.session!!
                val lease = ActiveLease(
                    id = dto.id,
                    identifier = dto.identifier,
                    type = dto.unlockType,
                    expiresAtEpochMs = System.currentTimeMillis() + dto.durationSeconds * 1000L,
                    isEmergency = dto.isEmergency,
                    leaseSignature = dto.leaseSignature
                )
                saveLease(lease)
                Result.success(lease)
            } else {
                Result.failure(Exception("Failed to unlock: ${response.code()} ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun requestEmergencyUnlock(identifier: String, type: String, seconds: Int): Result<ActiveLease> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        val deviceId = deviceIdProvider()
        val idempotencyKey = "emergency-${UUID.randomUUID()}"

        return try {
            val response = apiService.requestEmergencyUnlock(
                token = "Bearer $token",
                request = EmergencyUnlockRequestDto(
                    seconds = seconds,
                    targetType = type,
                    targetIdentifier = identifier,
                    deviceId = deviceId,
                    idempotencyKey = idempotencyKey
                )
            )

            if (response.isSuccessful && response.body()?.session != null) {
                val dto = response.body()!!.session!!
                val lease = ActiveLease(
                    id = dto.id,
                    identifier = dto.identifier,
                    type = dto.unlockType,
                    expiresAtEpochMs = System.currentTimeMillis() + dto.durationSeconds * 1000L,
                    isEmergency = dto.isEmergency,
                    leaseSignature = dto.leaseSignature
                )
                saveLease(lease)
                Result.success(lease)
            } else {
                Result.failure(Exception("Failed emergency unlock: ${response.code()} ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun saveLease(lease: ActiveLease) {
        leaseDao.insertLease(
            ActiveLeaseEntity(
                id = lease.id,
                identifier = lease.identifier,
                type = lease.type,
                expiresAtEpochMs = lease.expiresAtEpochMs,
                isEmergency = lease.isEmergency,
                leaseSignature = lease.leaseSignature
            )
        )
    }

    override suspend fun clearExpiredLeases() {
        leaseDao.clearExpired(System.currentTimeMillis())
    }
}
