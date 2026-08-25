package com.disciplineos.service

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.disciplineos.DisciplineApplication

class PolicySyncWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? DisciplineApplication ?: return Result.failure()
        return if (app.policySyncCoordinator.syncNow().isSuccess) Result.success() else Result.retry()
    }
}
