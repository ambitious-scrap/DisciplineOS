package com.disciplineos.data.repository

import com.disciplineos.data.local.dao.LeaseDao
import com.disciplineos.data.local.dao.ReserveDao
import com.disciplineos.data.local.entity.DeviceReserveEntity
import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.AllocateReserveRequestDto
import com.disciplineos.data.remote.dto.OfflineSpendEventDto
import com.disciplineos.data.remote.dto.ReconcileReservesRequestDto
import com.disciplineos.domain.model.ActiveLease
import com.disciplineos.domain.model.DeviceReserve
import com.disciplineos.domain.repository.ReserveRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import com.disciplineos.enforcement.OfflineUnlockPolicy
import java.util.UUID

class ReserveRepositoryImpl(
    private val reserveDao: ReserveDao,
    private val leaseDao: LeaseDao,
    private val apiService: DisciplineApiService,
    private val deviceIdProvider: () -> String,
    private val tokenProvider: () -> String?
) : ReserveRepository {

    override fun getReserveFlow(): Flow<DeviceReserve?> {
        return reserveDao.getActiveReserveFlow(System.currentTimeMillis()).map { entity ->
            entity?.let {
                DeviceReserve(
                    id = it.id,
                    totalReservedSeconds = it.totalReservedSeconds,
                    remainingSeconds = it.remainingSeconds,
                    expiresAtEpochMs = it.expiresAtEpochMs
                )
            }
        }
    }

    override suspend fun allocateReserve(seconds: Int): Result<DeviceReserve> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        val deviceId = deviceIdProvider()
        val idempotencyKey = "reserve-${UUID.randomUUID()}"

        return try {
            val response = apiService.allocateReserve(
                token = "Bearer $token",
                request = AllocateReserveRequestDto(
                    deviceId = deviceId,
                    requestedSeconds = seconds,
                    ttlSeconds = 43200,
                    idempotencyKey = idempotencyKey
                )
            )

            if (response.isSuccessful && response.body() != null) {
                val dto = response.body()!!.reserve
                val entity = DeviceReserveEntity(
                    id = dto.id,
                    totalReservedSeconds = dto.reservedSeconds,
                    remainingSeconds = dto.remainingSeconds,
                    expiresAtEpochMs = System.currentTimeMillis() + 43200 * 1000L
                )
                reserveDao.insertReserve(entity)

                Result.success(
                    DeviceReserve(
                        id = entity.id,
                        totalReservedSeconds = entity.totalReservedSeconds,
                        remainingSeconds = entity.remainingSeconds,
                        expiresAtEpochMs = entity.expiresAtEpochMs
                    )
                )
            } else {
                Result.failure(Exception("Failed to allocate reserve: ${response.code()} ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun spendOffline(
        targetType: String,
        targetIdentifier: String,
        seconds: Int,
        isEmergency: Boolean
    ): Result<ActiveLease> {
        return OfflineUnlockPolicy.reject()
    }
    override suspend fun reconcileOutbox(): Result<Unit> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        val pending = reserveDao.getPendingOutbox()
        if (pending.isEmpty()) return Result.success(Unit)

        val activeReserve = reserveDao.getActiveReserve(System.currentTimeMillis())
            ?: return Result.failure(IllegalStateException("No active reserve to reconcile"))

        val dtos = pending.map {
            OfflineSpendEventDto(
                eventId = it.eventId,
                deviceId = deviceIdProvider(),
                targetType = it.targetType,
                targetIdentifier = it.targetIdentifier,
                secondsSpent = it.secondsSpent,
                localTimestamp = java.time.Instant.ofEpochMilli(it.timestamp).toString(),
                isEmergency = it.isEmergency
            )
        }

        return try {
            val response = apiService.reconcileReserves(
                token = "Bearer $token",
                request = ReconcileReservesRequestDto(
                    deviceId = deviceIdProvider(),
                    reserveId = activeReserve.id,
                    events = dtos
                )
            )

            if (response.isSuccessful) {
                reserveDao.markReconciled(pending.map { it.eventId })
                Result.success(Unit)
            } else {
                Result.failure(Exception("Reconciliation failed: ${response.code()} ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
