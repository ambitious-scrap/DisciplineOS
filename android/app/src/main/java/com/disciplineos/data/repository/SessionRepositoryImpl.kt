package com.disciplineos.data.repository

import com.disciplineos.data.local.dao.LeaseDao
import com.disciplineos.data.local.entity.ActiveLeaseEntity
import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.EmergencyUnlockRequestDto
import com.disciplineos.data.remote.dto.SpendPointsRequestDto
import com.disciplineos.domain.model.ActiveLease
import com.disciplineos.domain.repository.SessionRepository
import com.disciplineos.security.LeaseVerifier
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

class SessionRepositoryImpl(
    private val leaseDao: LeaseDao,
    private val apiService: DisciplineApiService,
    private val deviceIdProvider: () -> String,
    private val tokenProvider: () -> String?,
    private val leaseVerifier: LeaseVerifier,
    private val onLeaseVerificationFailure: suspend (eventType: String, details: Map<String, Any>) -> Unit = { _, _ -> },
    private val bootIdProvider: () -> Long = { -1L },
    private val policyRevisionProvider: suspend () -> Int = { 0 },
) : SessionRepository {
    private val bootChecked = AtomicBoolean(false)
    override fun getActiveLeasesFlow(): Flow<List<ActiveLease>> {
        return flow {
            ensureBootContinuity()
            val policyRevision = policyRevisionProvider()
            emitAll(
                leaseDao.getActiveLeasesFlow(
                    deviceIdProvider(),
                    bootIdProvider(),
                    android.os.SystemClock.elapsedRealtime(),
                ).map { entities ->
                    entities.filter { it.policyVersion >= policyRevision }.map(::toDomain)
                },
            )
        }
    }

    override suspend fun getActiveLeaseForIdentifier(identifier: String, type: String): ActiveLease? {
        ensureBootContinuity()
        val entity = leaseDao.getActiveLeaseForIdentifier(
            deviceId = deviceIdProvider(),
            bootId = bootIdProvider(),
            type = type,
            identifier = identifier,
            currentElapsedRealtime = android.os.SystemClock.elapsedRealtime(),
        ) ?: return null
        return if (entity.policyVersion >= policyRevisionProvider()) toDomain(entity) else null
    }

    override suspend fun requestUnlock(identifier: String, type: String, seconds: Int): Result<ActiveLease> {
        return requestSignedLease(
            identifier = identifier,
            type = type,
            seconds = seconds,
            emergency = false,
        ) { token, deviceId, idempotencyKey ->
            apiService.requestUnlock(
                token = "Bearer $token",
                request = SpendPointsRequestDto(seconds, type, identifier, deviceId, idempotencyKey),
            )
        }
    }

    override suspend fun requestEmergencyUnlock(identifier: String, type: String, seconds: Int): Result<ActiveLease> {
        return requestSignedLease(
            identifier = identifier,
            type = type,
            seconds = seconds,
            emergency = true,
        ) { token, deviceId, idempotencyKey ->
            apiService.requestEmergencyUnlock(
                token = "Bearer $token",
                request = EmergencyUnlockRequestDto(seconds, type, identifier, deviceId, idempotencyKey),
            )
        }
    }

    private suspend fun requestSignedLease(
        identifier: String,
        type: String,
        seconds: Int,
        emergency: Boolean,
        request: suspend (
            token: String,
            deviceId: String,
            idempotencyKey: String,
        ) -> retrofit2.Response<com.disciplineos.data.remote.dto.SessionResponseDto>,
    ): Result<ActiveLease> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        val deviceId = deviceIdProvider()
        val idempotencyKey = (if (emergency) "emergency-" else "spend-") + UUID.randomUUID()
        return runCatching {
            val response = request(token, deviceId, idempotencyKey)
            val dto = response.body()?.session
                ?: error("Failed to unlock: ${response.code()} ${response.message()}")
            if (dto.lease == null) {
                onLeaseVerificationFailure("invalid_lease_signature", mapOf("reason" to "missing lease", "leaseId" to dto.id))
                error("Server returned no verifiable lease")
            }
            val signedLease = dto.lease
            val verificationResult = leaseVerifier.verify(
                lease = signedLease,
                expectedDeviceId = deviceId,
                expectedTargetType = type,
                expectedTargetIdentifier = identifier,
                expectedSessionId = dto.id,
            )
            if (verificationResult.isFailure) {
                val failure = verificationResult.exceptionOrNull() ?: IllegalStateException("Lease verification failed")
                val message = failure.message.orEmpty()
                val eventType = when {
                    "device" in message.lowercase() -> "lease_device_mismatch"
                    "target" in message.lowercase() -> "lease_target_mismatch"
                    else -> "invalid_lease_signature"
                }
                onLeaseVerificationFailure(eventType, mapOf("reason" to message, "leaseId" to dto.id))
                throw failure
            }
            val verified = verificationResult.getOrThrow()
            val currentPolicyRevision = policyRevisionProvider()
            if (signedLease.payload.policyVersion < currentPolicyRevision) {
                onLeaseVerificationFailure(
                    "policy_stale",
                    mapOf(
                        "leaseId" to dto.id,
                        "leasePolicyVersion" to signedLease.payload.policyVersion,
                        "cachedPolicyVersion" to currentPolicyRevision,
                    ),
                )
                error("Lease was issued under stale policy revision")
            }
            val lease = ActiveLease(
                id = dto.id,
                deviceId = deviceId,
                identifier = identifier,
                type = type,
                expiresAtEpochMs = verified.expiresAtEpochMs,
                isEmergency = signedLease.payload.isEmergency,
                leaseSignature = signedLease.signature,
                canonicalPayload = signedLease.canonicalPayload,
                keyId = signedLease.keyId,
                policyVersion = signedLease.payload.policyVersion,
                verifiedAtElapsedRealtime = verified.verifiedAtElapsedRealtime,
                monotonicDeadlineElapsedRealtime = verified.monotonicDeadlineElapsedRealtime,
            )
            saveLease(lease)
            lease
        }
    }

    override suspend fun saveLease(lease: ActiveLease) {
        require(lease.canonicalPayload.isNotBlank()) { "Only verified leases may be persisted" }
        require(lease.monotonicDeadlineElapsedRealtime > android.os.SystemClock.elapsedRealtime()) {
            "Expired lease cannot be persisted"
        }
        leaseDao.insertLease(
            ActiveLeaseEntity(
                id = lease.id,
                deviceId = lease.deviceId,
                identifier = lease.identifier,
                type = lease.type,
                expiresAtEpochMs = lease.expiresAtEpochMs,
                isEmergency = lease.isEmergency,
                leaseSignature = lease.leaseSignature,
                canonicalPayload = lease.canonicalPayload,
                keyId = lease.keyId,
                policyVersion = lease.policyVersion,
                verifiedAtElapsedRealtime = lease.verifiedAtElapsedRealtime,
                monotonicDeadlineElapsedRealtime = lease.monotonicDeadlineElapsedRealtime,
                bootId = bootIdProvider(),
            ),
        )
    }

    override suspend fun clearExpiredLeases() {
        leaseDao.clearExpired(android.os.SystemClock.elapsedRealtime())
    }
    private suspend fun ensureBootContinuity() {
        if (!bootChecked.compareAndSet(false, true)) return
        val bootId = bootIdProvider()
        if (bootId != -1L) {
            leaseDao.clearForBoot(bootId)
        } else {
            // Without a stable boot counter, restoring a lease is unsafe; fail closed.
            leaseDao.clearAll()
        }
    }

    private fun toDomain(entity: ActiveLeaseEntity): ActiveLease {
        return ActiveLease(
            id = entity.id,
            deviceId = entity.deviceId,
            identifier = entity.identifier,
            type = entity.type,
            expiresAtEpochMs = entity.expiresAtEpochMs,
            isEmergency = entity.isEmergency,
            leaseSignature = entity.leaseSignature,
            canonicalPayload = entity.canonicalPayload,
            keyId = entity.keyId,
            policyVersion = entity.policyVersion,
            verifiedAtElapsedRealtime = entity.verifiedAtElapsedRealtime,
            monotonicDeadlineElapsedRealtime = entity.monotonicDeadlineElapsedRealtime,
        )
    }
}
