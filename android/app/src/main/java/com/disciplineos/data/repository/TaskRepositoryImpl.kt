package com.disciplineos.data.repository

import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.CreateTaskRequestDto
import com.disciplineos.data.remote.dto.SubmitPhotoEvidenceRequestDto
import com.disciplineos.data.remote.dto.TaskDto
import com.disciplineos.domain.model.TaskItem
import com.disciplineos.domain.model.TimeBank
import com.disciplineos.domain.repository.LedgerRepository
import com.disciplineos.domain.repository.TaskRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class TaskRepositoryImpl(
    private val apiService: DisciplineApiService,
    private val ledgerRepository: LedgerRepository,
    private val tokenProvider: () -> String?,
) : TaskRepository {
    private val tasksFlow = MutableStateFlow<List<TaskItem>>(emptyList())

    override fun getTasksFlow(): Flow<List<TaskItem>> = tasksFlow.asStateFlow()

    override suspend fun syncTasks(): Result<Unit> = runCatching {
        val token = tokenProvider() ?: error("Not authenticated")
        val response = apiService.getTasks("Bearer $token")
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            error("Task sync failed: ${response.code()} ${response.message()}")
        }
        tasksFlow.value = body.tasks.map { it.toDomain() }
    }

    override suspend fun submitPhotoEvidence(
        taskId: String,
        occurrenceDate: String,
        sha256: String,
    ): Result<String> = runCatching {
        val token = tokenProvider() ?: error("Not authenticated")
        val response = apiService.submitPhotoEvidence(
            token = "Bearer $token",
            taskId = taskId,
            request = SubmitPhotoEvidenceRequestDto(
                occurrenceDate = occurrenceDate,
                sha256 = sha256,
                idempotencyKey = "photo-evidence-$taskId-$occurrenceDate-$sha256",
            ),
        )
        val evidence = response.body()?.evidence
        if (!response.isSuccessful || evidence == null) {
            error("Photo evidence rejected: ${response.code()} ${response.message()}")
        }
        evidence.id
    }

    override suspend fun createTask(
        title: String,
        description: String?,
        evidenceType: String,
        isRecurring: Boolean,
    ): Result<TaskItem> = runCatching {
        val token = tokenProvider() ?: error("Not authenticated")
        val response = apiService.createTask(
            token = "Bearer $token",
            request = CreateTaskRequestDto(
                title = title,
                description = description,
                evidenceType = evidenceType,
                isRecurring = isRecurring,
            ),
        )
        val task = response.body()?.task
        if (!response.isSuccessful || task == null) {
            error("Task creation failed: ${response.code()} ${response.message()}")
        }
        val domainTask = task.toDomain()
        tasksFlow.value = tasksFlow.value + domainTask
        domainTask
    }

    override suspend fun completeTask(
        taskId: String,
        occurrenceDate: String,
        evidenceSessionId: String?,
        photoEvidenceId: String?,
    ): Result<TimeBank> {
        return ledgerRepository.claimTaskReward(taskId, occurrenceDate, evidenceSessionId, photoEvidenceId)
    }
    private fun TaskDto.toDomain() = TaskItem(
        id = id,
        title = title,
        description = description,
        rewardSeconds = rewardSeconds,
        evidenceType = evidenceType,
        isRecurring = isRecurring,
    )
}
