package com.disciplineos.security

import com.disciplineos.data.remote.dto.LeasePayloadDto
import com.disciplineos.data.remote.dto.SignedLeaseDto
import com.disciplineos.domain.model.ActiveLease
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LeaseVerifierTest {
    private val deviceId = "33333333-3333-4333-8333-333333333333"
    private val payload = LeasePayloadDto(
        version = 1,
        leaseId = "11111111-1111-4111-8111-111111111111",
        userId = "22222222-2222-4222-8222-222222222222",
        deviceId = deviceId,
        targetType = "app",
        targetIdentifier = "com.example.app",
        issuedAt = "2030-01-01T00:00:00.000Z",
        expiresAt = "2030-01-01T00:10:00.000Z",
        durationSeconds = 600,
        isEmergency = false,
        policyVersion = 7,
        nonce = "44444444-4444-4444-8444-444444444444",
    )

    @Test
    fun validLeaseVerifiesAndUsesElapsedRealtimeDeadline() {
        val result = verifier().verify(lease(), deviceId, "app", "com.example.app", payload.leaseId)
        assertTrue(result.isSuccess)
        val verified = result.getOrThrow()
        assertEquals(301_000L, verified.monotonicDeadlineElapsedRealtime)

        val active = ActiveLease(
            id = payload.leaseId,
            deviceId = deviceId,
            identifier = payload.targetIdentifier,
            type = payload.targetType,
            expiresAtEpochMs = verified.expiresAtEpochMs,
            isEmergency = false,
            leaseSignature = lease().signature,
            canonicalPayload = lease().canonicalPayload,
            keyId = lease().keyId,
            policyVersion = payload.policyVersion,
            verifiedAtElapsedRealtime = 1_000L,
            monotonicDeadlineElapsedRealtime = verified.monotonicDeadlineElapsedRealtime,
        )
        assertFalse(active.isExpiredAt(300_999L))
        assertTrue(active.isExpiredAt(301_000L))
    }

    @Test
    fun alteredTargetAndDeviceFailVerification() {
        assertTrue(verifier().verify(lease(), deviceId, "app", "com.other.app", payload.leaseId).isFailure)
        assertTrue(verifier().verify(lease(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "app", payload.targetIdentifier, payload.leaseId).isFailure)
    }

    @Test
    fun alteredCanonicalPayloadAndSignatureFailVerification() {
        val alteredPayload = lease().copy(canonicalPayload = lease().canonicalPayload.replace("com.example.app", "com.example.other"))
        assertTrue(verifier().verify(alteredPayload, deviceId, "app", payload.targetIdentifier, payload.leaseId).isFailure)
        val malformed = lease().copy(signature = "not-a-signature")
        assertTrue(verifier().verify(malformed, deviceId, "app", payload.targetIdentifier, payload.leaseId).isFailure)
    }


    @Test
    fun unknownKeyIdFailsClosed() {
        assertTrue(
            verifier().verify(
                lease().copy(keyId = "unknown-key"),
                deviceId,
                "app",
                payload.targetIdentifier,
                payload.leaseId,
            ).isFailure,
        )
    }

    @Test
    fun wallClockRollbackCannotExtendMonotonicLease() {
        val result = LeaseVerifier(
            wallClockMillis = { 1_893_455_940_000L },
            elapsedRealtimeMillis = { 1_000L },
        ).verify(lease(), deviceId, "app", payload.targetIdentifier, payload.leaseId)

        assertEquals(601_000L, result.getOrThrow().monotonicDeadlineElapsedRealtime)
    }
    @Test
    fun expiredLeaseFailsClosed() {
        val result = LeaseVerifier(
            wallClockMillis = { 1_893_456_600_001L },
            elapsedRealtimeMillis = { 2_000L },
        ).verify(lease(), deviceId, "app", payload.targetIdentifier, payload.leaseId)
        assertTrue(result.isFailure)
    }

    private fun verifier() = LeaseVerifier(
        wallClockMillis = { 1_893_456_300_000L },
        elapsedRealtimeMillis = { 1_000L },
    )

    private fun lease() = SignedLeaseDto(
        payload = payload,
        canonicalPayload = "{\"deviceId\":\"$deviceId\",\"durationSeconds\":600,\"expiresAt\":\"2030-01-01T00:10:00.000Z\",\"isEmergency\":false,\"issuedAt\":\"2030-01-01T00:00:00.000Z\",\"leaseId\":\"${payload.leaseId}\",\"nonce\":\"${payload.nonce}\",\"policyVersion\":7,\"targetIdentifier\":\"com.example.app\",\"targetType\":\"app\",\"userId\":\"${payload.userId}\",\"version\":1}",
        signature = "fpeuZ2WPfL0Po6My8vzd65nyG9SnSF0tVmgU2Z8M5cEhAUsZnOZyVxaXml1LCdQFPvLsW-VQ8NecRzBrjtcQDg",
        algorithm = "Ed25519",
        keyId = "server-lease-v1",
    )
}
