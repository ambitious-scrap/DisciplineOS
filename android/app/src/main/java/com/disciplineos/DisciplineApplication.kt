package com.disciplineos

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import com.disciplineos.data.local.DisciplineDatabase
import com.disciplineos.data.remote.DisciplineApiService
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
import com.disciplineos.enforcement.ForegroundAppDetector
import com.disciplineos.service.DisciplineForegroundService
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.UUID
import java.util.concurrent.TimeUnit

class DisciplineApplication : Application() {

    lateinit var database: DisciplineDatabase
        private set

    lateinit var apiService: DisciplineApiService
        private set

    lateinit var prefs: SharedPreferences
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

    var deviceId: String = ""
        private set

    var authToken: String? = null
        private set

    override fun onCreate() {
        super.onCreate()

        prefs = getSharedPreferences("disciplineos_prefs", Context.MODE_PRIVATE)

        // Initialize or retrieve persistent Device ID
        deviceId = prefs.getString("device_id", null) ?: run {
            val newId = UUID.randomUUID().toString()
            prefs.edit().putString("device_id", newId).apply()
            newId
        }

        authToken = prefs.getString("auth_token", null)

        // Initialize Database
        database = DisciplineDatabase.getInstance(this)

        // Initialize Retrofit API Service
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(DisciplineApiService.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        apiService = retrofit.create(DisciplineApiService::class.java)

        // Wire Real Production Repositories (eliminating fake local stubs)
        policyRepository = PolicyRepositoryImpl(
            policyDao = database.policyDao(),
            apiService = apiService,
            tokenProvider = { authToken }
        )

        sessionRepository = SessionRepositoryImpl(
            leaseDao = database.leaseDao(),
            apiService = apiService,
            deviceIdProvider = { deviceId },
            tokenProvider = { authToken }
        )

        ledgerRepository = LedgerRepositoryImpl(
            apiService = apiService,
            tokenProvider = { authToken }
        )

        reserveRepository = ReserveRepositoryImpl(
            reserveDao = database.reserveDao(),
            leaseDao = database.leaseDao(),
            apiService = apiService,
            deviceIdProvider = { deviceId },
            tokenProvider = { authToken }
        )

        taskRepository = TaskRepositoryImpl(
            apiService = apiService,
            ledgerRepository = ledgerRepository,
            tokenProvider = { authToken }
        )

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

    fun updateAuthToken(token: String) {
        authToken = token
        prefs.edit().putString("auth_token", token).apply()
    }
}
