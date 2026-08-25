package com.disciplineos.enforcement

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProtectionStateManagerTest {
    @Test
    fun successfulPolicySyncClearsTransientNetworkDegradation() {
        val manager = ProtectionStateManager()
        manager.markDegraded(ProtectionFlag.SERVER_UNREACHABLE)
        manager.markDegraded(ProtectionFlag.POLICY_STALE)
        manager.markPolicySync(revision = 4, syncedAtEpochMs = 100L)

        assertTrue(ProtectionFlag.ENFORCED in manager.state.value.flags)
        assertFalse(ProtectionFlag.SERVER_UNREACHABLE in manager.state.value.flags)
        assertFalse(ProtectionFlag.POLICY_STALE in manager.state.value.flags)
        assertTrue(manager.state.value.policyRevision == 4)
    }

    @Test
    fun missingDeviceOwnerRemainsDegraded() {
        val manager = ProtectionStateManager()
        manager.markDegraded(ProtectionFlag.DEVICE_OWNER_MISSING)
        assertTrue(ProtectionFlag.DEVICE_OWNER_MISSING in manager.state.value.flags)
        assertTrue(ProtectionFlag.DEGRADED in manager.state.value.flags)
        assertFalse(manager.state.value.isEnforced)
    }
}
