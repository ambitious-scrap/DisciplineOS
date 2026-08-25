package com.disciplineos.enforcement

import org.junit.Assert.assertEquals
import org.junit.Test

class EnforcementControllerTest {
    @Test
    fun blockedWithoutVerifiedLeaseIsSuspended() {
        assertEquals(
            true,
            deriveSuspensionPlan(
                blockedPackages = setOf("com.example.blocked"),
                leasedPackages = emptySet(),
                managedPackages = emptySet(),
            )["com.example.blocked"],
        )
    }

    @Test
    fun verifiedLeaseTemporarilyAllowsBlockedPackage() {
        assertEquals(
            false,
            deriveSuspensionPlan(
                blockedPackages = setOf("com.example.blocked"),
                leasedPackages = setOf("com.example.blocked"),
                managedPackages = emptySet(),
            )["com.example.blocked"],
        )
    }

    @Test
    fun removedPolicyUnsuspendsPreviouslyManagedPackage() {
        assertEquals(
            false,
            deriveSuspensionPlan(
                blockedPackages = emptySet(),
                leasedPackages = emptySet(),
                managedPackages = setOf("com.example.formerly-blocked"),
            )["com.example.formerly-blocked"],
        )
    }
}
