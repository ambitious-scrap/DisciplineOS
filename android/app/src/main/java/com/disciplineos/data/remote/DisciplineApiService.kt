package com.disciplineos.data.remote

import com.disciplineos.data.remote.dto.*
import retrofit2.Response
import retrofit2.http.*

interface DisciplineApiService {
    @POST("/api/auth/login")
    suspend fun login(
        @Body request: LoginRequestDto
    ): Response<AuthResponseDto>

    @POST("/api/auth/pair")
    suspend fun pairDevice(
        @Header("Authorization") token: String,
        @Body request: PairDeviceRequestDto
    ): Response<PairDeviceResponseDto>

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

    @POST("/api/reserves/allocate")
    suspend fun allocateReserve(
        @Header("Authorization") token: String,
        @Body request: AllocateReserveRequestDto
    ): Response<AllocateReserveResponseDto>

    @POST("/api/reserves/reconcile")
    suspend fun reconcileReserves(
        @Header("Authorization") token: String,
        @Body request: ReconcileReservesRequestDto
    ): Response<ReconcileReservesResponseDto>

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
