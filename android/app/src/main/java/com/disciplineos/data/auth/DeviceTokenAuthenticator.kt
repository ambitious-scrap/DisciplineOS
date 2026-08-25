package com.disciplineos.data.auth

import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.RefreshResponseDto
import com.disciplineos.data.remote.dto.RefreshTokenRequestDto
import com.google.gson.Gson
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import java.io.IOException

class DeviceTokenAuthenticator(
    credentialStore: CredentialSnapshotStore,
    private val refreshClient: okhttp3.OkHttpClient,
    onRefreshFailure: () -> Unit,
    onTokensRefreshed: (DeviceCredentials) -> Unit,
) : Authenticator {
    private val gson = Gson()
    private val refreshManager = DeviceTokenRefreshManager(
        credentialStore = credentialStore,
        refresh = { current ->
            val refreshed = refresh(current.refreshToken)
            current.copy(
                accessToken = refreshed.tokens.accessToken,
                refreshToken = refreshed.tokens.refreshToken,
            )
        },
        onRefreshFailure = onRefreshFailure,
        onTokensRefreshed = onTokensRefreshed,
    )

    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) > 1 || shouldSkip(response.request)) return null
        val sentToken = response.request.header("Authorization")?.removePrefix("Bearer ")?.trim()
            ?: return null
        val refreshed = refreshManager.refreshIfNeeded(sentToken) ?: return null
        return retry(response.request, refreshed.accessToken)
    }

    private fun refresh(refreshToken: String): RefreshResponseDto {
        val body = gson.toJson(RefreshTokenRequestDto(refreshToken)).toRequestBody(JSON)
        val request = Request.Builder()
            .url("${DisciplineApiService.BASE_URL}api/auth/refresh")
            .post(body)
            .build()
        refreshClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Refresh failed with HTTP ${response.code}")
            return gson.fromJson(response.body?.string(), RefreshResponseDto::class.java)
                ?: throw IOException("Refresh response was empty")
        }
    }

    private fun retry(request: Request, accessToken: String): Request {
        return request.newBuilder()
            .header("Authorization", "Bearer $accessToken")
            .header(RETRY_HEADER, "true")
            .build()
    }

    private fun shouldSkip(request: Request): Boolean {
        if (request.header(RETRY_HEADER) == "true") return true
        return request.url.encodedPath.endsWith("/api/auth/login") ||
            request.url.encodedPath.endsWith("/api/auth/pair") ||
            request.url.encodedPath.endsWith("/api/auth/refresh")
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
        const val RETRY_HEADER = "X-DisciplineOS-Auth-Retry"
    }
}
