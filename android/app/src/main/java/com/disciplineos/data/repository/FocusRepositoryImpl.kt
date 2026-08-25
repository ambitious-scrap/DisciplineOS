package com.disciplineos.data.repository

import android.os.SystemClock
import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.AbandonFocusSessionRequestDto
import com.disciplineos.data.remote.dto.CompleteFocusSessionRequestDto
import com.disciplineos.data.remote.dto.FocusHeartbeatRequestDto
import com.disciplineos.data.remote.dto.FocusSessionDto
import com.disciplineos.data.remote.dto.StartFocusSessionRequestDto
import com.disciplineos.domain.model.FocusSession
import com.disciplineos.domain.repository.FocusRepository
import java.util.UUID

class FocusRepositoryImpl(
    private val apiService: DisciplineApiService,
    private val deviceIdProvider: () -> String,
    private val tokenProvider: () -> String?,
) : FocusRepository {
    override suspend fun start(plannedDurationSeconds: Int, associatedTaskId: String?): Result<FocusSession> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        return request {
            apiService.startFocusSession(
                token = "Bearer $token",
                request = StartFocusSessionRequestDto(
                    plannedDurationSeconds = plannedDurationSeconds,
                    associatedTaskId = associatedTaskId,
                    clientStartedMonotonicMs = SystemClock.elapsedRealtime(),
                    idempotencyKey = "focus-start-${UUID.randomUUID()}",
                ),
            )
        }
    }

    override suspend fun heartbeat(sessionId: String): Result<FocusSession> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        return request {
            apiService.heartbeatFocusSession(
                token = "Bearer $token",
                sessionId = sessionId,
                request = FocusHeartbeatRequestDto(
                    clientMonotonicMs = SystemClock.elapsedRealtime(),
                    idempotencyKey = "focus-heartbeat-${UUID.randomUUID()}",
                ),
            )
        }
    }

    override suspend fun complete(sessionId: String): Result<FocusSession> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        return request {
            apiService.completeFocusSession(
                token = "Bearer $token",
                sessionId = sessionId,
                request = CompleteFocusSessionRequestDto("focus-complete-${UUID.randomUUID()}"),
            )
        }
    }

    override suspend fun abandon(sessionId: String): Result<FocusSession> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        return request {
            apiService.abandonFocusSession(
                token = "Bearer $token",
                sessionId = sessionId,
                request = AbandonFocusSessionRequestDto("focus-abandon-${UUID.randomUUID()}"),
            )
        }
    }

    private suspend fun request(
        call: suspend () -> retrofit2.Response<com.disciplineos.data.remote.dto.FocusSessionResponseDto>,
    ): Result<FocusSession> = runCatching {
        val response = call()
        val dto = response.body()?.session
            ?: error("Focus request failed: ${response.code()} ${response.message()}")
        dto.toDomain()
    }

    private fun FocusSessionDto.toDomain() = FocusSession(
        id = id,
        plannedDurationSeconds = plannedDurationSeconds,
        serverStartedAt = serverStartedAt,
        status = status,
        observedDurationSeconds = observedDurationSeconds,
        rewardSeconds = rewardSeconds,
        rewardClaimed = rewardClaimed,
    )
}
