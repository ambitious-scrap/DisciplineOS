package com.disciplineos.data.repository

import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.CompleteTaskRequestDto
import com.disciplineos.domain.model.TimeBank
import com.disciplineos.domain.repository.LedgerRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

class LedgerRepositoryImpl(
    private val apiService: DisciplineApiService,
    private val tokenProvider: () -> String?
) : LedgerRepository {

    private val _timeBankFlow = MutableStateFlow<TimeBank?>(null)

    override fun getTimeBankFlow(): Flow<TimeBank?> = _timeBankFlow.asStateFlow()

    override suspend fun syncBalance(): Result<TimeBank> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        return try {
            val response = apiService.getBalance("Bearer $token")
            if (response.isSuccessful && response.body() != null) {
                val dto = response.body()!!
                val bank = TimeBank(
                    balanceSeconds = dto.balanceSeconds,
                    availableSeconds = dto.availableSeconds,
                    reservedSeconds = dto.reservedSeconds,
                    maxSeconds = dto.maxSeconds
                )
                _timeBankFlow.value = bank
                Result.success(bank)
            } else {
                Result.failure(Exception("Failed to fetch balance: ${response.code()} ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun claimTaskReward(
        taskId: String,
        occurrenceDate: String,
        evidenceSessionId: String?,
        photoEvidenceId: String?,
    ): Result<TimeBank> {
        val token = tokenProvider() ?: return Result.failure(IllegalStateException("Not authenticated"))
        val idempotencyKey = "task-claim-$taskId-$occurrenceDate-${evidenceSessionId ?: photoEvidenceId ?: "manual"}"

        return try {
            val response = apiService.completeTask(
                token = "Bearer $token",
                taskId = taskId,
                request = CompleteTaskRequestDto(
                    occurrenceDate = occurrenceDate,
                    evidenceSessionId = evidenceSessionId,
                    photoEvidenceId = photoEvidenceId,
                    idempotencyKey = idempotencyKey,
                ),
            )

            if (response.isSuccessful && response.body()?.balance != null) {
                val dto = response.body()!!.balance
                val bank = TimeBank(
                    balanceSeconds = dto.balanceSeconds,
                    availableSeconds = dto.availableSeconds,
                    reservedSeconds = dto.reservedSeconds,
                    maxSeconds = dto.maxSeconds,
                )
                _timeBankFlow.value = bank
                Result.success(bank)
            } else {
                Result.failure(Exception("Failed to claim task reward: ${response.code()} ${response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
