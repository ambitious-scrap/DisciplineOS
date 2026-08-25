package com.disciplineos.security

import android.os.SystemClock
import com.disciplineos.BuildConfig
import com.disciplineos.data.remote.dto.LeasePayloadDto
import com.disciplineos.data.remote.dto.SignedLeaseDto
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.time.Instant
import java.util.Base64

class VerifiedLease(
    val lease: SignedLeaseDto,
    val issuedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    val verifiedAtElapsedRealtime: Long,
    val monotonicDeadlineElapsedRealtime: Long,
)

/** Verifies the exact server payload before any lease is persisted or honored. */
class LeaseVerifier(
    private val wallClockMillis: () -> Long = { System.currentTimeMillis() },
    private val elapsedRealtimeMillis: () -> Long = { SystemClock.elapsedRealtime() },
) {
    fun verify(
        lease: SignedLeaseDto,
        expectedDeviceId: String,
        expectedTargetType: String,
        expectedTargetIdentifier: String,
        expectedSessionId: String? = null,
    ): Result<VerifiedLease> = runCatching {
        require(lease.algorithm == "Ed25519") { "Unsupported lease algorithm" }
        require(lease.keyId == BuildConfig.LEASE_KEY_ID) { "Unknown lease key ID" }
        val payload = lease.payload
        require(payload.version == 1) { "Unsupported lease version" }
        require(payload.deviceId == expectedDeviceId) { "Lease device mismatch" }
        require(payload.targetType == expectedTargetType) { "Lease target type mismatch" }
        require(payload.targetIdentifier == expectedTargetIdentifier) { "Lease target mismatch" }
        if (expectedSessionId != null) require(payload.leaseId == expectedSessionId) { "Lease ID mismatch" }
        require(payload.durationSeconds in 1..14_400) { "Lease duration outside allowed bounds" }

        val canonical = canonicalize(payload)
        require(canonical == lease.canonicalPayload) { "Lease canonical payload mismatch" }
        val issuedAt = Instant.parse(payload.issuedAt).toEpochMilli()
        val expiresAt = Instant.parse(payload.expiresAt).toEpochMilli()
        require(expiresAt > issuedAt) { "Lease expiry is not after issuance" }
        require(expiresAt - issuedAt == payload.durationSeconds * 1_000L) { "Lease duration is inconsistent" }

        val nowWall = wallClockMillis()
        require(issuedAt <= nowWall + CLOCK_SKEW_ALLOWANCE_MS) { "Lease issuance is too far in the future" }
        require(expiresAt > nowWall) { "Lease is already expired" }

        val signature = Base64.getUrlDecoder().decode(lease.signature)
        val publicKey = Base64.getDecoder().decode(BuildConfig.LEASE_PUBLIC_KEY_BASE64)
        require(publicKey.size == 32) { "Lease public key must be 32 bytes" }
        val verifier = Ed25519Signer()
        verifier.init(false, Ed25519PublicKeyParameters(publicKey, 0))
        val message = canonical.toByteArray(Charsets.UTF_8)
        verifier.update(message, 0, message.size)
        require(verifier.verifySignature(signature)) { "Invalid lease signature" }

        val verifiedAtElapsed = elapsedRealtimeMillis()
        val remainingMillis = (expiresAt - nowWall).coerceAtMost(payload.durationSeconds * 1_000L)
        VerifiedLease(
            lease = lease,
            issuedAtEpochMs = issuedAt,
            expiresAtEpochMs = expiresAt,
            verifiedAtElapsedRealtime = verifiedAtElapsed,
            monotonicDeadlineElapsedRealtime = verifiedAtElapsed + remainingMillis,
        )
    }

    private fun canonicalize(payload: LeasePayloadDto): String {
        // Keys are deliberately ordered to match the server's canonical JSON serializer.
        return "{" +
            "\"deviceId\":${quote(payload.deviceId)}," +
            "\"durationSeconds\":${payload.durationSeconds}," +
            "\"expiresAt\":${quote(payload.expiresAt)}," +
            "\"isEmergency\":${payload.isEmergency}," +
            "\"issuedAt\":${quote(payload.issuedAt)}," +
            "\"leaseId\":${quote(payload.leaseId)}," +
            "\"nonce\":${quote(payload.nonce)}," +
            "\"policyVersion\":${payload.policyVersion}," +
            "\"targetIdentifier\":${quote(payload.targetIdentifier)}," +
            "\"targetType\":${quote(payload.targetType)}," +
            "\"userId\":${quote(payload.userId)}," +
            "\"version\":${payload.version}" +
            "}"
    }

    private fun quote(value: String): String {
        val builder = StringBuilder(value.length + 2)
        builder.append('"')
        for (character in value) {
            when (character) {
                '"' -> builder.append("\\\"")
                '\\' -> builder.append("\\\\")
                '\b' -> builder.append("\\b")
                '\u000C' -> builder.append("\\f")
                '\n' -> builder.append("\\n")
                '\r' -> builder.append("\\r")
                '\t' -> builder.append("\\t")
                in '\u0000'..'\u001F' -> builder.append("\\u%04x".format(character.code))
                else -> builder.append(character)
            }
        }
        return builder.append('"').toString()
    }
    private companion object {
        const val CLOCK_SKEW_ALLOWANCE_MS = 5 * 60 * 1_000L
    }
}
