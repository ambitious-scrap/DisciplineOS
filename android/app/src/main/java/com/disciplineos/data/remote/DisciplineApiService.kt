package com.disciplineos.data.remote

import com.disciplineos.data.remote.dto.*
import retrofit2.Response
import retrofit2.http.*

interface DisciplineApiService {
    @POST("/api/auth/login")
    suspend fun login(
        @Body request: LoginRequestDto
    ): Response<AuthResponseDto>

    @POST("/api/auth/refresh")
    suspend fun refresh(
        @Body request: RefreshTokenRequestDto
    ): Response<RefreshResponseDto>

    @POST("/api/auth/pair")
    suspend fun pairDevice(
        @Header("Authorization") token: String,
        @Body request: PairDeviceRequestDto
    ): Response<PairDeviceResponseDto>

    @POST("/api/focus/start")
    suspend fun startFocusSession(
        @Header("Authorization") token: String,
        @Body request: StartFocusSessionRequestDto,
    ): Response<FocusSessionResponseDto>

    @POST("/api/focus/{id}/heartbeat")
    suspend fun heartbeatFocusSession(
        @Header("Authorization") token: String,
        @Path("id") sessionId: String,
        @Body request: FocusHeartbeatRequestDto,
    ): Response<FocusSessionResponseDto>

    @POST("/api/focus/{id}/complete")
    suspend fun completeFocusSession(
        @Header("Authorization") token: String,
        @Path("id") sessionId: String,
        @Body request: CompleteFocusSessionRequestDto,
    ): Response<FocusSessionResponseDto>

    @POST("/api/focus/{id}/abandon")
    suspend fun abandonFocusSession(
        @Header("Authorization") token: String,
        @Path("id") sessionId: String,
        @Body request: AbandonFocusSessionRequestDto,
    ): Response<FocusSessionResponseDto>

    @GET("/api/policy")
    suspend fun getPolicy(
        @Header("Authorization") token: String
    ): Response<PolicyProfileDto>
    @POST("/api/policy/apps")
    suspend fun addBlockedApp(
        @Header("Authorization") token: String,
        @Body request: CreateBlockedAppRequestDto
    ): Response<BlockedAppResponseDto>

    @POST("/api/policy/sites")
    suspend fun addBlockedSite(
        @Header("Authorization") token: String,
        @Body request: CreateBlockedSiteRequestDto
    ): Response<BlockedSiteResponseDto>

    @GET("/api/bank/balance")
    suspend fun getBalance(
        @Header("Authorization") token: String
    ): Response<TimeBankDto>

    @GET("/api/tasks")
    suspend fun getTasks(
        @Header("Authorization") token: String,
    ): Response<TaskListResponseDto>

    @POST("/api/tasks")
    suspend fun createTask(
        @Header("Authorization") token: String,
        @Body request: CreateTaskRequestDto,
    ): Response<TaskResponseDto>

    @DELETE("/api/policy/apps/{id}")
    suspend fun requestRemoveBlockedApp(
        @Header("Authorization") token: String,
        @Path("id") id: String
    ): Response<PendingPolicyChangeResponseDto>

    @DELETE("/api/policy/sites/{id}")
    suspend fun requestRemoveBlockedSite(
        @Header("Authorization") token: String,
        @Path("id") id: String
    ): Response<PendingPolicyChangeResponseDto>

    @POST("/api/sessions/unlock")
    suspend fun requestUnlock(
        @Header("Authorization") token: String,
        @Body request: SpendPointsRequestDto
    ): Response<SessionResponseDto>

    @POST("/api/sessions/emergency")
    suspend fun requestEmergencyUnlock(
        @Header("Authorization") token: String,
        @Body request: EmergencyUnlockRequestDto
    ): Response<SessionResponseDto>

    @POST("/api/tasks/{id}/evidence/photo")
    suspend fun submitPhotoEvidence(
        @Header("Authorization") token: String,
        @Path("id") taskId: String,
        @Body request: SubmitPhotoEvidenceRequestDto,
    ): Response<PhotoEvidenceResponseDto>

    @POST("/api/reserves/allocate")
    suspend fun allocateReserve(
        @Header("Authorization") token: String,
        @Body request: AllocateReserveRequestDto
    ): Response<AllocateReserveResponseDto>

    @POST("/api/events/location")
    suspend fun reportLocationEvent(
        @Header("Authorization") token: String,
        @Body request: ReportLocationEventRequestDto,
    ): Response<LocationEvidenceResponseDto>

    @POST("/api/reserves/reconcile")
    suspend fun reconcileReserves(
        @Header("Authorization") token: String,
        @Body request: ReconcileReservesRequestDto
    ): Response<ReconcileReservesResponseDto>

    @POST("/api/events/protection")
    suspend fun reportProtectionEvent(
        @Header("Authorization") token: String,
        @Body request: ReportProtectionEventRequestDto,
    ): Response<Unit>

    @POST("/api/tasks/{id}/complete")
    suspend fun completeTask(
        @Header("Authorization") token: String,
        @Path("id") taskId: String,
        @Body request: CompleteTaskRequestDto
    ): Response<CompleteTaskResponseDto>

    companion object {
        const val BASE_URL = "https://server-production-d646.up.railway.app/"
    }
}
