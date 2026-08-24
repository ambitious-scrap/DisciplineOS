package com.disciplineos

import android.app.Application
import com.disciplineos.data.local.DisciplineDatabase
import com.disciplineos.domain.model.ActiveLease
import com.disciplineos.domain.model.BlockedApp
import com.disciplineos.domain.model.BlockedSite
import com.disciplineos.domain.model.DeviceReserve
import com.disciplineos.domain.model.TimeBank
import com.disciplineos.domain.repository.LedgerRepository
import com.disciplineos.domain.repository.PolicyRepository
import com.disciplineos.domain.repository.ReserveRepository
import com.disciplineos.domain.repository.SessionRepository
import com.disciplineos.domain.usecase.CheckIsAppBlockedUseCase
import com.disciplineos.domain.usecase.CheckIsDomainBlockedUseCase
import com.disciplineos.domain.usecase.EmergencyUnlockUseCase
import com.disciplineos.domain.usecase.SpendUnlockUseCase
import com.disciplineos.enforcement.ForegroundAppDetector
import com.disciplineos.service.DisciplineForegroundService
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

class DisciplineApplication : Application() {

    lateinit var database: DisciplineDatabase
        private set

    lateinit var policyRepository: PolicyRepository
        private set

    lateinit var sessionRepository: SessionRepository
        private set

    lateinit var ledgerRepository: LedgerRepository
        private set

    lateinit var reserveRepository: ReserveRepository
        private set

    lateinit var checkIsAppBlockedUseCase: CheckIsAppBlockedUseCase
        private set

    lateinit var checkIsDomainBlockedUseCase: CheckIsDomainBlockedUseCase
        private set

    lateinit var spendUnlockUseCase: SpendUnlockUseCase
        private set

    lateinit var emergencyUnlockUseCase: EmergencyUnlockUseCase
        private set

    lateinit var foregroundAppDetector: ForegroundAppDetector
        private set

    override fun onCreate() {
        super.onCreate()

        database = DisciplineDatabase.getInstance(this)

        // Wire Repositories (In-memory + Room integration)
        policyRepository = object : PolicyRepository {
            override fun getBlockedAppsFlow(): Flow<List<BlockedApp>> = flowOf(emptyList())
            override fun getBlockedSitesFlow(): Flow<List<BlockedSite>> = flowOf(emptyList())
            override suspend fun isAppBlocked(packageName: String): Boolean = database.policyDao().isAppBlocked(packageName)
            override suspend fun isDomainBlocked(domain: String): Boolean = database.policyDao().isDomainBlocked(domain)
            override suspend fun syncPolicy(): Result<Unit> = Result.success(Unit)
        }

        sessionRepository = object : SessionRepository {
            override fun getActiveLeasesFlow(): Flow<List<ActiveLease>> = flowOf(emptyList())
            override suspend fun getActiveLeaseForIdentifier(identifier: String): ActiveLease? {
                val entity = database.leaseDao().getActiveLeaseForIdentifier(identifier, System.currentTimeMillis())
                return entity?.let {
                    ActiveLease(
                        id = it.id,
                        identifier = it.identifier,
                        type = it.type,
                        expiresAtEpochMs = it.expiresAtEpochMs,
                        isEmergency = it.isEmergency,
                        leaseSignature = it.leaseSignature
                    )
                }
            }
            override suspend fun requestUnlock(identifier: String, type: String, seconds: Int): Result<ActiveLease> {
                val lease = ActiveLease(
                    id = java.util.UUID.randomUUID().toString(),
                    identifier = identifier,
                    type = type,
                    expiresAtEpochMs = System.currentTimeMillis() + seconds * 1000L,
                    isEmergency = false,
                    leaseSignature = "sig-local-unlock"
                )
                saveLease(lease)
                return Result.success(lease)
            }
            override suspend fun requestEmergencyUnlock(identifier: String, type: String, seconds: Int): Result<ActiveLease> {
                val lease = ActiveLease(
                    id = java.util.UUID.randomUUID().toString(),
                    identifier = identifier,
                    type = type,
                    expiresAtEpochMs = System.currentTimeMillis() + seconds * 1000L,
                    isEmergency = true,
                    leaseSignature = "sig-emergency-unlock"
                )
                saveLease(lease)
                return Result.success(lease)
            }
            override suspend fun saveLease(lease: ActiveLease) {
                database.leaseDao().insertLease(
                    com.disciplineos.data.local.entity.ActiveLeaseEntity(
                        id = lease.id,
                        identifier = lease.identifier,
                        type = lease.type,
                        expiresAtEpochMs = lease.expiresAtEpochMs,
                        isEmergency = lease.isEmergency,
                        leaseSignature = lease.leaseSignature
                    )
                )
            }
            override suspend fun clearExpiredLeases() {
                database.leaseDao().clearExpired(System.currentTimeMillis())
            }
        }

        ledgerRepository = object : LedgerRepository {
            override fun getTimeBankFlow(): Flow<TimeBank?> = flowOf(null)
            override suspend fun syncBalance(): Result<TimeBank> = Result.success(TimeBank(3600, 3600, 0, 14400))
            override suspend fun claimTaskReward(taskId: String, occurrenceDate: String, evidenceUrl: String?): Result<TimeBank> =
                Result.success(TimeBank(4800, 4800, 0, 14400))
        }

        reserveRepository = object : ReserveRepository {
            override fun getReserveFlow(): Flow<DeviceReserve?> = flowOf(null)
            override suspend fun allocateReserve(seconds: Int): Result<DeviceReserve> =
                Result.success(DeviceReserve("res-1", seconds, seconds, System.currentTimeMillis() + 43200000L))
            override suspend fun spendOffline(targetType: String, targetIdentifier: String, seconds: Int, isEmergency: Boolean): Result<ActiveLease> =
                sessionRepository.requestUnlock(targetIdentifier, targetType, seconds)
            override suspend fun reconcileOutbox(): Result<Unit> = Result.success(Unit)
        }

        // UseCases
        checkIsAppBlockedUseCase = CheckIsAppBlockedUseCase(policyRepository, sessionRepository)
        checkIsDomainBlockedUseCase = CheckIsDomainBlockedUseCase(policyRepository, sessionRepository)
        spendUnlockUseCase = SpendUnlockUseCase(sessionRepository)
        emergencyUnlockUseCase = EmergencyUnlockUseCase(sessionRepository)

        // Foreground monitoring engine
        foregroundAppDetector = ForegroundAppDetector(this, checkIsAppBlockedUseCase)

        // Start background service
        DisciplineForegroundService.start(this)
    }
}
