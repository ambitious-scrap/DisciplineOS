package com.disciplineos.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.disciplineos.data.local.dao.*
import com.disciplineos.data.local.entity.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Database(
    entities = [
        BlockedAppEntity::class,
        BlockedSiteEntity::class,
        ActiveLeaseEntity::class,
        DeviceReserveEntity::class,
        OfflineSpendEntity::class,
        PolicyMetadataEntity::class,
        ProtectionEventOutboxEntity::class
    ],
    version = 5,
    exportSchema = false
)
abstract class DisciplineDatabase : RoomDatabase() {
    abstract fun policyDao(): PolicyDao
    abstract fun leaseDao(): LeaseDao
    abstract fun reserveDao(): ReserveDao
    abstract fun protectionEventDao(): ProtectionEventDao

    companion object {
        @Volatile
        private var INSTANCE: DisciplineDatabase? = null

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE active_leases ADD COLUMN deviceId TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE active_leases ADD COLUMN canonicalPayload TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE active_leases ADD COLUMN keyId TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE active_leases ADD COLUMN policyVersion INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE active_leases ADD COLUMN verifiedAtElapsedRealtime INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE active_leases ADD COLUMN monotonicDeadlineElapsedRealtime INTEGER NOT NULL DEFAULT 0")
                // Existing rows were signed only with an unverified HMAC-style marker.
                db.execSQL("DELETE FROM active_leases")
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS policy_metadata (id INTEGER NOT NULL PRIMARY KEY, revision INTEGER NOT NULL, syncedAtEpochMs INTEGER NOT NULL)")
                db.execSQL("CREATE TABLE IF NOT EXISTS protection_event_outbox (eventId TEXT NOT NULL PRIMARY KEY, deviceId TEXT NOT NULL, eventType TEXT NOT NULL, detailsJson TEXT NOT NULL, occurredAt TEXT NOT NULL)")
            }
        }

        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE active_leases ADD COLUMN bootId INTEGER NOT NULL DEFAULT -1")
                db.execSQL("DELETE FROM active_leases")
            }
        }

        fun getInstance(context: Context): DisciplineDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    DisciplineDatabase::class.java,
                    "disciplineos.db"
                )
                .addMigrations(MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5)
                .fallbackToDestructiveMigration()
                .addCallback(object : RoomDatabase.Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        super.onCreate(db)
                        seedDefaultPolicies(getInstance(context))
                    }

                    override fun onOpen(db: SupportSQLiteDatabase) {
                        super.onOpen(db)
                        seedDefaultPolicies(getInstance(context))
                    }
                })
                .build()
                INSTANCE = instance
                instance
            }
        }

        private fun seedDefaultPolicies(db: DisciplineDatabase) {
            CoroutineScope(Dispatchers.IO).launch {
                val existingApps = db.policyDao().getBlockedApps()
                if (existingApps.isEmpty()) {
                    val defaultApps = listOf(
                        BlockedAppEntity("app-1", "com.instagram.android", "Instagram", true),
                        BlockedAppEntity("app-2", "com.google.android.youtube", "YouTube", true),
                        BlockedAppEntity("app-3", "com.zhiliaoapp.musically", "TikTok", true),
                        BlockedAppEntity("app-4", "com.twitter.android", "X (Twitter)", true),
                        BlockedAppEntity("app-5", "com.reddit.frontpage", "Reddit", true),
                        BlockedAppEntity("app-6", "com.facebook.katana", "Facebook", true),
                        BlockedAppEntity("app-7", "com.snapchat.android", "Snapchat", true),
                        BlockedAppEntity("app-8", "com.netflix.mediaclient", "Netflix", true)
                    )
                    db.policyDao().insertApps(defaultApps)
                }

                val existingSites = db.policyDao().getBlockedSites()
                if (existingSites.isEmpty()) {
                    val defaultSites = listOf(
                        BlockedSiteEntity("site-1", "instagram.com", true),
                        BlockedSiteEntity("site-2", "youtube.com", true),
                        BlockedSiteEntity("site-3", "tiktok.com", true),
                        BlockedSiteEntity("site-4", "twitter.com", true),
                        BlockedSiteEntity("site-5", "x.com", true),
                        BlockedSiteEntity("site-6", "reddit.com", true),
                        BlockedSiteEntity("site-7", "facebook.com", true),
                        BlockedSiteEntity("site-8", "netflix.com", true)
                    )
                    db.policyDao().insertSites(defaultSites)
                }
            }
        }
    }
}
