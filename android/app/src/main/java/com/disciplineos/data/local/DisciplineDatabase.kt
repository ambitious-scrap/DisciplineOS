package com.disciplineos.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
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
        OfflineSpendEntity::class
    ],
    version = 2,
    exportSchema = false
)
abstract class DisciplineDatabase : RoomDatabase() {
    abstract fun policyDao(): PolicyDao
    abstract fun leaseDao(): LeaseDao
    abstract fun reserveDao(): ReserveDao

    companion object {
        @Volatile
        private var INSTANCE: DisciplineDatabase? = null

        fun getInstance(context: Context): DisciplineDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    DisciplineDatabase::class.java,
                    "disciplineos.db"
                )
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
