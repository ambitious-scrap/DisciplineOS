package com.disciplineos.data.remote

import com.disciplineos.data.remote.dto.*
import retrofit2.Response
import retrofit2.http.*

interface DisciplineApiService {

    @GET("/api/policy")
    suspend fun getPolicy(
        @Header("Authorization") token: String
    ): Response<PolicyProfileDto>

    @GET("/api/bank/balance")
    suspend fun getBalance(
        @Header("Authorization") token: String
    ): Response<TimeBankDto>

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

    companion object {
        const val BASE_URL = "https://server-production-d646.up.railway.app/"
    }
}
