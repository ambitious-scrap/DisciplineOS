package com.disciplineos.data.auth

interface CredentialSnapshotStore {
    fun read(): DeviceCredentials?
    fun write(credentials: DeviceCredentials)
    fun clear()
}
class DeviceTokenRefreshManager(
    private val credentialStore: CredentialSnapshotStore,
    private val refresh: (current: DeviceCredentials) -> DeviceCredentials,
    private val onRefreshFailure: () -> Unit,
    private val onTokensRefreshed: (DeviceCredentials) -> Unit,
) {
    private val refreshLock = Any()

    fun refreshIfNeeded(sentAccessToken: String): DeviceCredentials? = synchronized(refreshLock) {
        val current = credentialStore.read() ?: return@synchronized null
        if (current.accessToken != sentAccessToken) return@synchronized current

        val refreshed = runCatching { refresh(current) }.getOrElse {
            credentialStore.clear()
            onRefreshFailure()
            return@synchronized null
        }
        credentialStore.write(refreshed)
        onTokensRefreshed(refreshed)
        refreshed
    }
}
