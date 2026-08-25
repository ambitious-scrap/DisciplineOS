package com.disciplineos.enforcement

import com.disciplineos.data.local.dao.ProtectionEventDao
import com.disciplineos.data.local.entity.ProtectionEventOutboxEntity
import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.ReportProtectionEventRequestDto
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.UUID

class ProtectionEventReporter(
    private val eventDao: ProtectionEventDao,
    private val apiService: DisciplineApiService,
    private val deviceIdProvider: () -> String,
    private val tokenProvider: () -> String?,
    private val protectionStateManager: ProtectionStateManager,
) {
    private val gson = Gson()
    suspend fun report(eventType: String, details: Map<String, Any> = emptyMap()) {
        val deviceId = deviceIdProvider()
        if (deviceId.isBlank()) return
        val event = ProtectionEventOutboxEntity(
            eventId = UUID.randomUUID().toString(),
            deviceId = deviceId,
            eventType = eventType,
            detailsJson = gson.toJson(details),
            occurredAt = Instant.now().toString(),
        )
        eventDao.insert(event)
        flush()
    }

    suspend fun flush() = withContext(Dispatchers.IO) {
        val token = tokenProvider()
        if (token == null) {
            protectionStateManager.markDegraded(ProtectionFlag.AUTH_REFRESH_REQUIRED)
            return@withContext
        }
        val pending = eventDao.getPending()
        val delivered = mutableListOf<String>()
        for (event in pending) {
            val details = (gson.fromJson(event.detailsJson, Map::class.java) as? Map<*, *>)
                .orEmpty()
                .entries
                .associate { (key, value) -> key.toString() to (value ?: "") }
            val response = runCatching {
                apiService.reportProtectionEvent(
                    token = "Bearer $token",
                    request = ReportProtectionEventRequestDto(
                        deviceId = event.deviceId,
                        eventType = event.eventType,
                        details = details,
                        occurredAt = event.occurredAt,
                    ),
                )
            }.getOrNull()
            if (response?.isSuccessful == true) {
                delivered += event.eventId
            } else {
                protectionStateManager.markDegraded(ProtectionFlag.SERVER_UNREACHABLE)
                break
            }
        }
        if (delivered.isNotEmpty()) eventDao.delete(delivered)
    }
}
