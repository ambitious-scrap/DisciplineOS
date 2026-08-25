package com.disciplineos.enforcement

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineUnlockPolicyTest {
    @Test
    fun offlineUnlockFailsClosed() {
        val result = OfflineUnlockPolicy.reject()
        assertTrue(result.isFailure)
        assertEquals(OfflineUnlockPolicy.DISABLED_MESSAGE, result.exceptionOrNull()?.message)
    }
}
