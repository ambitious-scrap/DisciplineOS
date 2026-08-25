package com.disciplineos.enforcement

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class ProtectionFlag {
    ENFORCED,
    DEGRADED,
    OFFLINE_PROTECTED,
    POLICY_STALE,
    AUTH_REFRESH_REQUIRED,
    DEVICE_OWNER_MISSING,
    VPN_DISABLED,
    ACCESSIBILITY_DISABLED,
    CLOCK_ANOMALY,
    LEASE_VERIFICATION_FAILED,
    SERVER_UNREACHABLE,
    ENFORCEMENT_RECONCILIATION_FAILED,
}

data class ProtectionState(
    val flags: Set<ProtectionFlag> = setOf(ProtectionFlag.DEGRADED),
    val policyRevision: Int = 0,
    val lastPolicySyncAtEpochMs: Long? = null,
) {
    val isEnforced: Boolean
        get() = ProtectionFlag.ENFORCED in flags && ProtectionFlag.DEGRADED !in flags
}

class ProtectionStateManager {
    private val mutableState = MutableStateFlow(ProtectionState())
    val state: StateFlow<ProtectionState> = mutableState.asStateFlow()

    fun setFlag(flag: ProtectionFlag, enabled: Boolean) {
        updateFlags { flags -> deriveFlags(if (enabled) flags + flag else flags - flag) }
    }

    fun clearFlag(flag: ProtectionFlag) {
        updateFlags { flags -> deriveFlags(flags - flag) }
    }

    fun markPolicySync(revision: Int, syncedAtEpochMs: Long) {
        val next = mutableState.value.flags - ProtectionFlag.POLICY_STALE -
            ProtectionFlag.SERVER_UNREACHABLE - ProtectionFlag.OFFLINE_PROTECTED -
            ProtectionFlag.AUTH_REFRESH_REQUIRED - ProtectionFlag.DEGRADED
        mutableState.value = mutableState.value.copy(
            flags = deriveFlags(next),
            policyRevision = revision,
            lastPolicySyncAtEpochMs = syncedAtEpochMs,
        )
    }

    fun markEnforced() {
        updateFlags { flags -> deriveFlags(flags - ProtectionFlag.DEVICE_OWNER_MISSING - ProtectionFlag.DEGRADED + ProtectionFlag.ENFORCED) }
    }

    fun markOfflineProtected() {
        updateFlags { flags -> flags + ProtectionFlag.OFFLINE_PROTECTED }
    }

    fun markDegraded(flag: ProtectionFlag) {
        updateFlags { flags -> deriveFlags(flags - ProtectionFlag.ENFORCED + ProtectionFlag.DEGRADED + flag) }
    }

    private fun updateFlags(transform: (Set<ProtectionFlag>) -> Set<ProtectionFlag>) {
        mutableState.value = mutableState.value.copy(flags = transform(mutableState.value.flags))
    }

    private fun deriveFlags(flags: Set<ProtectionFlag>): Set<ProtectionFlag> {
        val issues = flags.intersect(DEGRADING_FLAGS)
        return if (issues.isEmpty()) {
            flags - ProtectionFlag.DEGRADED + ProtectionFlag.ENFORCED
        } else {
            flags - ProtectionFlag.ENFORCED + ProtectionFlag.DEGRADED
        }
    }

    private companion object {
        val DEGRADING_FLAGS = setOf(
            ProtectionFlag.POLICY_STALE,
            ProtectionFlag.AUTH_REFRESH_REQUIRED,
            ProtectionFlag.DEVICE_OWNER_MISSING,
            ProtectionFlag.VPN_DISABLED,
            ProtectionFlag.ACCESSIBILITY_DISABLED,
            ProtectionFlag.CLOCK_ANOMALY,
            ProtectionFlag.LEASE_VERIFICATION_FAILED,
            ProtectionFlag.SERVER_UNREACHABLE,
            ProtectionFlag.ENFORCEMENT_RECONCILIATION_FAILED,
            ProtectionFlag.DEGRADED,
        )
    }
}
