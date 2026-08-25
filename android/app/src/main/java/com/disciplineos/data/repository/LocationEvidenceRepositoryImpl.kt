package com.disciplineos.data.repository

import android.os.SystemClock
import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.LocationEvidenceResponseDto
import com.disciplineos.data.remote.dto.MovementTelemetryDto
import com.disciplineos.data.remote.dto.ReportLocationEventRequestDto
import java.time.Instant
import java.util.UUID

class LocationEvidenceRepositoryImpl(
    private val apiService: DisciplineApiService,
    private val tokenProvider: () -> String?,
) {
    suspend fun report(
        locationType: String,
        placeIdentifier: String,
        eventType: String,
        steps: Int = 0,
        activeSeconds: Int = 0,
        sampleCount: Int = 0,
    ): Result<LocationEvidenceResponseDto> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        return runCatching {
            val response = apiService.reportLocationEvent(
                token = "Bearer $token",
                request = ReportLocationEventRequestDto(
                    locationType = locationType,
                    placeIdentifier = placeIdentifier,
                    eventType = eventType,
                    movement = MovementTelemetryDto(
                        stepDelta = steps,
                        activeSeconds = activeSeconds,
                        sampleCount = sampleCount,
                        monotonicDurationMs = activeSeconds * 1_000L,
                    ),
                    clientOccurredAt = Instant.now().toString(),
                    clientMonotonicMs = SystemClock.elapsedRealtime(),
                    idempotencyKey = "location-$eventType-${UUID.randomUUID()}",
                ),
            )
            response.body() ?: error("Location event rejected with HTTP ${response.code()}")
        }
    }
}
