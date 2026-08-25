package com.disciplineos

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.disciplineos.data.auth.DeviceCredentialStore
import com.disciplineos.data.auth.DeviceCredentials
import com.disciplineos.data.auth.DeviceTokenAuthenticator
import com.disciplineos.data.local.DisciplineDatabase
import com.disciplineos.data.remote.DisciplineApiService
import com.disciplineos.data.remote.dto.LoginRequestDto
import com.disciplineos.data.remote.dto.PairDeviceRequestDto
import com.disciplineos.data.repository.LedgerRepositoryImpl
import com.disciplineos.data.repository.PolicyRepositoryImpl
import com.disciplineos.data.repository.ReserveRepositoryImpl
import com.disciplineos.data.repository.SessionRepositoryImpl
import com.disciplineos.data.repository.TaskRepositoryImpl
import com.disciplineos.domain.repository.LedgerRepository
import com.disciplineos.domain.repository.PolicyRepository
import com.disciplineos.domain.repository.ReserveRepository
import com.disciplineos.domain.repository.SessionRepository
import com.disciplineos.domain.repository.TaskRepository
import com.disciplineos.domain.usecase.CheckIsAppBlockedUseCase
import com.disciplineos.domain.usecase.CheckIsDomainBlockedUseCase
import com.disciplineos.domain.usecase.EmergencyUnlockUseCase
import com.disciplineos.domain.usecase.SpendUnlockUseCase
import com.disciplineos.enforcement.ClockIntegrityMonitor
import com.disciplineos.enforcement.DeviceOwnerEnforcer
import com.disciplineos.enforcement.EnforcementController
import com.disciplineos.enforcement.ForegroundAppDetector
import com.disciplineos.enforcement.ModeAwareEnforcer
import com.disciplineos.enforcement.NormalModeEnforcer
import com.disciplineos.enforcement.PolicySyncCoordinator
import com.disciplineos.enforcement.ProtectionEventReporter
import com.disciplineos.enforcement.ProtectionFlag
import com.disciplineos.enforcement.ProtectionStateManager
import com.disciplineos.security.BootIdentity
import com.disciplineos.security.LeaseVerifier
import com.disciplineos.service.DisciplineForegroundService
import com.disciplineos.service.PolicySyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class DisciplineApplication : Application() {
    lateinit var database: DisciplineDatabase
        private set

    lateinit var apiService: DisciplineApiService
        private set

    lateinit var prefs: SharedPreferences
        private set

    lateinit var credentialStore: DeviceCredentialStore
        private set

    lateinit var policyRepository: PolicyRepository
        private set

    lateinit var sessionRepository: SessionRepository
        private set

    lateinit var ledgerRepository: LedgerRepository
        private set

    lateinit var reserveRepository: ReserveRepository
        private set

    lateinit var taskRepository: TaskRepository
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

    lateinit var protectionStateManager: ProtectionStateManager
        private set

    lateinit var policySyncCoordinator: PolicySyncCoordinator
        private set

    lateinit var enforcementController: EnforcementController
        private set

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var deviceId: String = ""
    private var authToken: String? = null

    val hasDeviceCredentials: Boolean
        get() = credentialStore.read() != null

    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences("disciplineos", Context.MODE_PRIVATE)
        credentialStore = DeviceCredentialStore(this)
        val credentials = credentialStore.read()
        deviceId = credentials?.deviceId.orEmpty()
        authToken = credentials?.accessToken
        // Invalidate the old plaintext token fields; they are never used as authority now.
        prefs.edit()
            .remove("server_device_id")
            .remove("device_access_token")
            .remove("device_refresh_token")
            .remove("auth_token")
            .remove("device_paired")
            .apply()

        protectionStateManager = ProtectionStateManager()
        val clockIntegrityMonitor = ClockIntegrityMonitor(this)
        val clockAnomaly = clockIntegrityMonitor.check()
        if (clockAnomaly) protectionStateManager.markDegraded(ProtectionFlag.CLOCK_ANOMALY)

        database = DisciplineDatabase.getInstance(this)
        val refreshClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
        val tokenAuthenticator = DeviceTokenAuthenticator(
            credentialStore = credentialStore,
            refreshClient = refreshClient,
            onRefreshFailure = {
                clearInvalidCredentials()
                protectionStateManager.markDegraded(ProtectionFlag.AUTH_REFRESH_REQUIRED)
            },
            onTokensRefreshed = { refreshed ->
                deviceId = refreshed.deviceId
                authToken = refreshed.accessToken
            },
        )
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        val okHttpClient = OkHttpClient.Builder()
            .authenticator(tokenAuthenticator)
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
        apiService = Retrofit.Builder()
            .baseUrl(DisciplineApiService.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(DisciplineApiService::class.java)

        val eventReporter = ProtectionEventReporter(
            eventDao = database.protectionEventDao(),
            apiService = apiService,
            deviceIdProvider = { deviceId },
            tokenProvider = { credentialStore.read()?.accessToken },
            protectionStateManager = protectionStateManager,
        )

        val leaseVerifier = LeaseVerifier()
        policyRepository = PolicyRepositoryImpl(
            policyDao = database.policyDao(),
            apiService = apiService,
            tokenProvider = { credentialStore.read()?.accessToken },
        )
        sessionRepository = SessionRepositoryImpl(
            leaseDao = database.leaseDao(),
            apiService = apiService,
            deviceIdProvider = { deviceId },
            tokenProvider = { credentialStore.read()?.accessToken },
            leaseVerifier = leaseVerifier,
            onLeaseVerificationFailure = { eventType, details ->
                protectionStateManager.markDegraded(ProtectionFlag.LEASE_VERIFICATION_FAILED)
                eventReporter.report(eventType, details)
            },
            bootIdProvider = { BootIdentity.current(this) },
            policyRevisionProvider = { policyRepository.getPolicyMetadata().revision },
        )
        ledgerRepository = LedgerRepositoryImpl(
            apiService = apiService,
            tokenProvider = { credentialStore.read()?.accessToken },
        )
        reserveRepository = ReserveRepositoryImpl(
            reserveDao = database.reserveDao(),
            leaseDao = database.leaseDao(),
            apiService = apiService,
            deviceIdProvider = { deviceId },
            tokenProvider = { credentialStore.read()?.accessToken },
        )
        taskRepository = TaskRepositoryImpl(
            apiService = apiService,
            ledgerRepository = ledgerRepository,
            tokenProvider = { credentialStore.read()?.accessToken },
        )

        policySyncCoordinator = PolicySyncCoordinator(
            policyRepository = policyRepository,
            protectionStateManager = protectionStateManager,
            eventReporter = eventReporter,
            clockIntegrityMonitor = clockIntegrityMonitor,
        )
        val deviceOwnerEnforcer = DeviceOwnerEnforcer(this, protectionStateManager)
        enforcementController = ModeAwareEnforcer(
            this,
            NormalModeEnforcer(),
            deviceOwnerEnforcer,
            protectionStateManager,
        )

        checkIsAppBlockedUseCase = CheckIsAppBlockedUseCase(policyRepository, sessionRepository)
        checkIsDomainBlockedUseCase = CheckIsDomainBlockedUseCase(policyRepository, sessionRepository)
        spendUnlockUseCase = SpendUnlockUseCase(sessionRepository)
        emergencyUnlockUseCase = EmergencyUnlockUseCase(sessionRepository)
        foregroundAppDetector = ForegroundAppDetector(
            context = this,
            checkIsAppBlockedUseCase = checkIsAppBlockedUseCase,
            policyRepository = policyRepository,
            sessionRepository = sessionRepository,
            enforcementController = enforcementController,
            protectionStateManager = protectionStateManager,
        )

        applicationScope.launch {
            if (clockAnomaly) eventReporter.report("clock_changed")
            policySyncCoordinator.syncNow()
        }
        policySyncCoordinator.start(applicationScope)
        schedulePolicyWorker()
        DisciplineForegroundService.start(this)
    }

    suspend fun authenticateAndPair(
        email: String,
        password: String,
        deviceName: String,
    ): Result<Unit> = runCatching {
        val loginResponse = apiService.login(LoginRequestDto(email, password))
        val loginBody = loginResponse.body()
            ?: error("Login failed with HTTP ${loginResponse.code()}")
        val pairResponse = apiService.pairDevice(
            token = "Bearer ${loginBody.tokens.accessToken}",
            request = PairDeviceRequestDto(name = deviceName, platform = "android"),
        )
        val pairBody = pairResponse.body()
            ?: error("Device pairing failed with HTTP ${pairResponse.code()}")
        val paired = DeviceCredentials(
            deviceId = pairBody.device.id,
            accessToken = pairBody.tokens.accessToken,
            refreshToken = pairBody.tokens.refreshToken,
        )
        credentialStore.write(paired)
        deviceId = paired.deviceId
        authToken = paired.accessToken
        policySyncCoordinator.syncNow().getOrThrow()
    }

    fun updateAuthToken(token: String) {
        authToken = token
        credentialStore.read()?.let { credentialStore.write(it.copy(accessToken = token)) }
    }

    private fun clearInvalidCredentials() {
        credentialStore.clear()
        deviceId = ""
        authToken = null
    }

    private fun schedulePolicyWorker() {
        val request = PeriodicWorkRequestBuilder<PolicySyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            POLICY_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    private companion object {
        const val POLICY_WORK_NAME = "disciplineos-policy-sync"
    }
}
