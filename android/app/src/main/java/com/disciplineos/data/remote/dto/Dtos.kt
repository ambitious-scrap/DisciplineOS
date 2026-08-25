package com.disciplineos.data.remote.dto

import com.google.gson.annotations.SerializedName

data class AuthResponseDto(
    @SerializedName("user") val user: UserDto,
    @SerializedName("tokens") val tokens: TokensDto
)

data class UserDto(
    @SerializedName("id") val id: String,
    @SerializedName("email") val email: String,
    @SerializedName("createdAt") val createdAt: String
)

data class TokensDto(
    @SerializedName("accessToken") val accessToken: String,
    @SerializedName("refreshToken") val refreshToken: String,
    @SerializedName("expiresInSeconds") val expiresInSeconds: Int
)

data class RefreshTokenRequestDto(
    @SerializedName("refreshToken") val refreshToken: String
)

data class RefreshResponseDto(
    @SerializedName("tokens") val tokens: TokensDto
)
data class LoginRequestDto(
    @SerializedName("email") val email: String,
    @SerializedName("password") val password: String
)

data class PairDeviceRequestDto(
    @SerializedName("name") val name: String,
    @SerializedName("platform") val platform: String,
    @SerializedName("pushToken") val pushToken: String? = null
)

data class PairDeviceResponseDto(
    @SerializedName("device") val device: DeviceDto,
    @SerializedName("tokens") val tokens: TokensDto
)

data class DeviceDto(
    @SerializedName("id") val id: String,
    @SerializedName("userId") val userId: String,
    @SerializedName("name") val name: String,
    @SerializedName("platform") val platform: String,
    @SerializedName("pushToken") val pushToken: String?,
    @SerializedName("lastSeenAt") val lastSeenAt: String,
    @SerializedName("isEnforced") val isEnforced: Boolean,
    @SerializedName("createdAt") val createdAt: String
)

data class ReportProtectionEventRequestDto(
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("eventType") val eventType: String,
    @SerializedName("details") val details: Map<String, Any> = emptyMap(),
    @SerializedName("occurredAt") val occurredAt: String,
)

data class TimeBankDto(
    @SerializedName("userId") val userId: String,
    @SerializedName("balanceSeconds") val balanceSeconds: Int,
    @SerializedName("maxSeconds") val maxSeconds: Int,
    @SerializedName("reservedSeconds") val reservedSeconds: Int,
    @SerializedName("availableSeconds") val availableSeconds: Int,
    @SerializedName("lastDecayAt") val lastDecayAt: String,
    @SerializedName("updatedAt") val updatedAt: String
)

data class PolicyProfileDto(
    @SerializedName("version") val version: Int,
    @SerializedName("updatedAt") val updatedAt: String,
    @SerializedName("blockedApps") val blockedApps: List<BlockedAppDto>,
    @SerializedName("blockedSites") val blockedSites: List<BlockedSiteDto>
)
data class PendingPolicyChangeResponseDto(
    @SerializedName("status") val status: String,
    @SerializedName("pendingChange") val pendingChange: PendingPolicyChangeDto
)

data class PendingPolicyChangeDto(
    @SerializedName("id") val id: String,
    @SerializedName("userId") val userId: String,
    @SerializedName("action") val action: String,
    @SerializedName("targetId") val targetId: String,
    @SerializedName("targetDescription") val targetDescription: String,
    @SerializedName("requestedAt") val requestedAt: String,
    @SerializedName("effectiveAt") val effectiveAt: String,
    @SerializedName("isCancelled") val isCancelled: Boolean,
    @SerializedName("isExecuted") val isExecuted: Boolean
)
data class CreateBlockedAppRequestDto(
    @SerializedName("platform") val platform: String = "android",
    @SerializedName("identifier") val identifier: String,
    @SerializedName("displayName") val displayName: String
)

data class CreateBlockedSiteRequestDto(
    @SerializedName("domain") val domain: String
)

data class BlockedAppResponseDto(
    @SerializedName("app") val app: BlockedAppDto
)

data class BlockedSiteResponseDto(
    @SerializedName("site") val site: BlockedSiteDto
)

data class BlockedAppDto(
    @SerializedName("id") val id: String,
    @SerializedName("userId") val userId: String,
    @SerializedName("platform") val platform: String,
    @SerializedName("identifier") val identifier: String,
    @SerializedName("displayName") val displayName: String,
    @SerializedName("isActive") val isActive: Boolean,
    @SerializedName("createdAt") val createdAt: String
)

data class BlockedSiteDto(
    @SerializedName("id") val id: String,
    @SerializedName("userId") val userId: String,
    @SerializedName("domain") val domain: String,
    @SerializedName("isActive") val isActive: Boolean,
    @SerializedName("createdAt") val createdAt: String,
)

data class LeasePayloadDto(
    @SerializedName("version") val version: Int,
    @SerializedName("leaseId") val leaseId: String,
    @SerializedName("userId") val userId: String,
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("targetType") val targetType: String,
    @SerializedName("targetIdentifier") val targetIdentifier: String,
    @SerializedName("issuedAt") val issuedAt: String,
    @SerializedName("expiresAt") val expiresAt: String,
    @SerializedName("durationSeconds") val durationSeconds: Int,
    @SerializedName("isEmergency") val isEmergency: Boolean,
    @SerializedName("policyVersion") val policyVersion: Int,
    @SerializedName("nonce") val nonce: String,
)

data class SignedLeaseDto(
    @SerializedName("payload") val payload: LeasePayloadDto,
    @SerializedName("canonicalPayload") val canonicalPayload: String,
    @SerializedName("signature") val signature: String,
    @SerializedName("algorithm") val algorithm: String,
    @SerializedName("keyId") val keyId: String,
)

data class ActiveUnlockSessionDto(
    @SerializedName("id") val id: String,
    @SerializedName("userId") val userId: String,
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("unlockType") val unlockType: String,
    @SerializedName("identifier") val identifier: String,
    @SerializedName("durationSeconds") val durationSeconds: Int,
    @SerializedName("startedAt") val startedAt: String,
    @SerializedName("expiresAt") val expiresAt: String,
    @SerializedName("isEmergency") val isEmergency: Boolean,
    @SerializedName("leaseSignature") val leaseSignature: String,
    @SerializedName("lease") val lease: SignedLeaseDto?,
)

data class SessionResponseDto(
    @SerializedName("session") val session: ActiveUnlockSessionDto?
)

data class SpendPointsRequestDto(
    @SerializedName("seconds") val seconds: Int,
    @SerializedName("targetType") val targetType: String,
    @SerializedName("targetIdentifier") val targetIdentifier: String,
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("idempotencyKey") val idempotencyKey: String
)

data class EmergencyUnlockRequestDto(
    @SerializedName("seconds") val seconds: Int,
    @SerializedName("targetType") val targetType: String,
    @SerializedName("targetIdentifier") val targetIdentifier: String,
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("idempotencyKey") val idempotencyKey: String
)

data class DeviceReserveDto(
    @SerializedName("id") val id: String,
    @SerializedName("userId") val userId: String,
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("reservedSeconds") val reservedSeconds: Int,
    @SerializedName("remainingSeconds") val remainingSeconds: Int,
    @SerializedName("expiresAt") val expiresAt: String,
    @SerializedName("createdAt") val createdAt: String
)

data class AllocateReserveRequestDto(
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("requestedSeconds") val requestedSeconds: Int,
    @SerializedName("ttlSeconds") val ttlSeconds: Int = 43200,
    @SerializedName("idempotencyKey") val idempotencyKey: String
)

data class AllocateReserveResponseDto(
    @SerializedName("reserve") val reserve: DeviceReserveDto
)

data class OfflineSpendEventDto(
    @SerializedName("eventId") val eventId: String,
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("targetType") val targetType: String,
    @SerializedName("targetIdentifier") val targetIdentifier: String,
    @SerializedName("secondsSpent") val secondsSpent: Int,
    @SerializedName("localTimestamp") val localTimestamp: String,
    @SerializedName("isEmergency") val isEmergency: Boolean = false
)

data class ReconcileReservesRequestDto(
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("reserveId") val reserveId: String,
    @SerializedName("events") val events: List<OfflineSpendEventDto>
)

data class ReconcileReservesResponseDto(
    @SerializedName("reconciledCount") val reconciledCount: Int,
    @SerializedName("acceptedSeconds") val acceptedSeconds: Int,
    @SerializedName("releasedUnusedSeconds") val releasedUnusedSeconds: Int,
    @SerializedName("newBalanceSeconds") val newBalanceSeconds: Int
)

data class CompleteTaskRequestDto(
    @SerializedName("occurrenceDate") val occurrenceDate: String,
    @SerializedName("evidenceUrl") val evidenceUrl: String? = null,
    @SerializedName("evidenceSha256") val evidenceSha256: String? = null,
    @SerializedName("idempotencyKey") val idempotencyKey: String
)

data class CompleteTaskResponseDto(
    @SerializedName("balance") val balance: TimeBankDto
)

