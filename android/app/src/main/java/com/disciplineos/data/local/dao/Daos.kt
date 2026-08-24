package com.disciplineos.data.local.dao

import androidx.room.*
import com.disciplineos.data.local.entity.*
import kotlinx.coroutines.flow.Flow

@Dao
interface PolicyDao {
    @Query("SELECT * FROM blocked_apps WHERE isActive = 1")
    fun getBlockedAppsFlow(): Flow<List<BlockedAppEntity>>

    @Query("SELECT * FROM blocked_apps WHERE isActive = 1")
    suspend fun getBlockedApps(): List<BlockedAppEntity>

    @Query("SELECT COUNT(*) > 0 FROM blocked_apps WHERE packageName = :packageName AND isActive = 1")
    suspend fun isAppBlocked(packageName: String): Boolean

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertApps(apps: List<BlockedAppEntity>)

    @Query("DELETE FROM blocked_apps")
    suspend fun clearApps()

    @Query("SELECT * FROM blocked_sites WHERE isActive = 1")
    fun getBlockedSitesFlow(): Flow<List<BlockedSiteEntity>>

    @Query("SELECT * FROM blocked_sites WHERE isActive = 1")
    suspend fun getBlockedSites(): List<BlockedSiteEntity>

    @Query("SELECT COUNT(*) > 0 FROM blocked_sites WHERE domain = :domain AND isActive = 1")
    suspend fun isDomainBlocked(domain: String): Boolean

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSites(sites: List<BlockedSiteEntity>)

    @Query("DELETE FROM blocked_sites")
    suspend fun clearSites()
}

@Dao
interface LeaseDao {
    @Query("SELECT * FROM active_leases WHERE expiresAtEpochMs > :currentTimeMs")
    fun getActiveLeasesFlow(currentTimeMs: Long): Flow<List<ActiveLeaseEntity>>

    @Query("SELECT * FROM active_leases WHERE identifier = :identifier AND expiresAtEpochMs > :currentTimeMs LIMIT 1")
    suspend fun getActiveLeaseForIdentifier(identifier: String, currentTimeMs: Long): ActiveLeaseEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLease(lease: ActiveLeaseEntity)

    @Query("DELETE FROM active_leases WHERE expiresAtEpochMs <= :currentTimeMs")
    suspend fun clearExpired(currentTimeMs: Long)
}

@Dao
interface ReserveDao {
    @Query("SELECT * FROM device_reserves WHERE expiresAtEpochMs > :currentTimeMs ORDER BY expiresAtEpochMs DESC LIMIT 1")
    fun getActiveReserveFlow(currentTimeMs: Long): Flow<DeviceReserveEntity?>

    @Query("SELECT * FROM device_reserves WHERE expiresAtEpochMs > :currentTimeMs ORDER BY expiresAtEpochMs DESC LIMIT 1")
    suspend fun getActiveReserve(currentTimeMs: Long): DeviceReserveEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReserve(reserve: DeviceReserveEntity)

    @Query("UPDATE device_reserves SET remainingSeconds = remainingSeconds - :spentSeconds WHERE id = :reserveId")
    suspend fun deductFromReserve(reserveId: String, spentSeconds: Int)

    @Query("SELECT * FROM offline_spend_outbox WHERE isReconciled = 0")
    suspend fun getPendingOutbox(): List<OfflineSpendEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOfflineSpend(event: OfflineSpendEntity)

    @Query("UPDATE offline_spend_outbox SET isReconciled = 1 WHERE eventId IN (:eventIds)")
    suspend fun markReconciled(eventIds: List<String>)
}
