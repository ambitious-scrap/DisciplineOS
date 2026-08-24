package com.disciplineos.data.repository

import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.domain.model.TaskItem
import com.disciplineos.domain.model.TimeBank
import com.disciplineos.domain.repository.LedgerRepository
import com.disciplineos.domain.repository.TaskRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

interface TaskRepository {
    fun getTasksFlow(): Flow<List<TaskItem>>
    suspend fun createTask(title: String, description: String?, rewardSeconds: Int, evidenceType: String, isRecurring: Boolean): Result<TaskItem>
    suspend fun completeTask(taskId: String, occurrenceDate: String, evidenceUrl: String?): Result<TimeBank>
}

class TaskRepositoryImpl(
    private val apiService: DisciplineApiService,
    private val ledgerRepository: LedgerRepository,
    private val tokenProvider: () -> String?
) : TaskRepository {

    private val _tasksFlow = MutableStateFlow<List<TaskItem>>(emptyList())

    override fun getTasksFlow(): Flow<List<TaskItem>> = _tasksFlow.asStateFlow()

    override suspend fun createTask(
        title: String,
        description: String?,
        rewardSeconds: Int,
        evidenceType: String,
        isRecurring: Boolean
    ): Result<TaskItem> {
        val task = TaskItem(
            id = UUID.randomUUID().toString(),
            title = title,
            description = description,
            rewardSeconds = rewardSeconds,
            evidenceType = evidenceType,
            isRecurring = isRecurring
        )
        _tasksFlow.value = _tasksFlow.value + task
        return Result.success(task)
    }

    override suspend fun completeTask(
        taskId: String,
        occurrenceDate: String,
        evidenceUrl: String?
    ): Result<TimeBank> {
        return ledgerRepository.claimTaskReward(taskId, occurrenceDate, evidenceUrl)
    }
}
