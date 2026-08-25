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

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertApp(app: BlockedAppEntity)

    @Query("DELETE FROM blocked_apps WHERE packageName = :packageName")
    suspend fun deleteApp(packageName: String)

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

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSite(site: BlockedSiteEntity)

    @Query("DELETE FROM blocked_sites WHERE domain = :domain")
    suspend fun deleteSite(domain: String)

    @Query("DELETE FROM blocked_sites")
    suspend fun clearSites()
    @Query("SELECT * FROM policy_metadata WHERE id = 1 LIMIT 1")
    suspend fun getPolicyMetadata(): PolicyMetadataEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPolicyMetadata(metadata: PolicyMetadataEntity)

    @Transaction
    suspend fun replacePolicy(
        apps: List<BlockedAppEntity>,
        sites: List<BlockedSiteEntity>,
        metadata: PolicyMetadataEntity,
    ) {
        clearApps()
        clearSites()
        insertApps(apps)
        insertSites(sites)
        insertPolicyMetadata(metadata)
    }
}

@Dao
interface LeaseDao {
    @Query("SELECT * FROM active_leases WHERE deviceId = :deviceId AND bootId = :bootId AND monotonicDeadlineElapsedRealtime > :currentElapsedRealtime")
    fun getActiveLeasesFlow(deviceId: String, bootId: Long, currentElapsedRealtime: Long): Flow<List<ActiveLeaseEntity>>

    @Query("SELECT * FROM active_leases WHERE deviceId = :deviceId AND bootId = :bootId AND type = :type AND identifier = :identifier AND monotonicDeadlineElapsedRealtime > :currentElapsedRealtime LIMIT 1")
    suspend fun getActiveLeaseForIdentifier(
        deviceId: String,
        bootId: Long,
        type: String,
        identifier: String,
        currentElapsedRealtime: Long,
    ): ActiveLeaseEntity?

    @Query("SELECT MAX(verifiedAtElapsedRealtime) FROM active_leases")
    suspend fun getMaxVerifiedElapsedRealtime(): Long?

    @Query("DELETE FROM active_leases WHERE bootId != :bootId")
    suspend fun clearForBoot(bootId: Long)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLease(lease: ActiveLeaseEntity)

    @Query("DELETE FROM active_leases WHERE monotonicDeadlineElapsedRealtime <= :currentElapsedRealtime")
    suspend fun clearExpired(currentElapsedRealtime: Long)

    @Query("DELETE FROM active_leases")
    suspend fun clearAll()
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

@Dao
interface ProtectionEventDao {
    @Query("SELECT * FROM protection_event_outbox ORDER BY occurredAt ASC")
    suspend fun getPending(): List<ProtectionEventOutboxEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: ProtectionEventOutboxEntity)

    @Query("DELETE FROM protection_event_outbox WHERE eventId IN (:eventIds)")
    suspend fun delete(eventIds: List<String>)
}
