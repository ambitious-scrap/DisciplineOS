package com.disciplineos.data.auth

import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TokenRefreshManagerTest {
    @Test
    fun simultaneousUnauthorizedRequestsShareOneRefresh() {
        val store = FakeStore(DeviceCredentials("device", "old-access", "old-refresh"))
        val refreshCalls = AtomicInteger(0)
        val manager = DeviceTokenRefreshManager(
            credentialStore = store,
            refresh = { current ->
                refreshCalls.incrementAndGet()
                Thread.sleep(50)
                current.copy(accessToken = "new-access", refreshToken = "new-refresh")
            },
            onRefreshFailure = {},
            onTokensRefreshed = {},
        )
        val executor = Executors.newFixedThreadPool(10)
        val results = (1..10).map {
            executor.submit<DeviceCredentials?> { manager.refreshIfNeeded("old-access") }
        }.map { it.get() }
        executor.shutdown()
        executor.awaitTermination(1, TimeUnit.SECONDS)

        assertEquals(1, refreshCalls.get())
        assertTrue(results.all { it?.accessToken == "new-access" })
        assertEquals("new-refresh", store.read()?.refreshToken)
    }

    @Test
    fun failedRefreshClearsCredentialState() {
        val store = FakeStore(DeviceCredentials("device", "old-access", "old-refresh"))
        val manager = DeviceTokenRefreshManager(
            credentialStore = store,
            refresh = { error("refresh rejected") },
            onRefreshFailure = {},
            onTokensRefreshed = {},
        )

        assertEquals(null, manager.refreshIfNeeded("old-access"))
        assertEquals(null, store.read())
    }

    private class FakeStore(private var credentials: DeviceCredentials?) : CredentialSnapshotStore {
        @Synchronized override fun read(): DeviceCredentials? = credentials
        @Synchronized override fun write(credentials: DeviceCredentials) {
            this.credentials = credentials
        }
        @Synchronized override fun clear() {
            credentials = null
        }
    }
}
