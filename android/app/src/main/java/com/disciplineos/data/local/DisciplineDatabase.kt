package com.disciplineos.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.disciplineos.data.local.dao.*
import com.disciplineos.data.local.entity.*

@Database(
    entities = [
        BlockedAppEntity::class,
        BlockedSiteEntity::class,
        ActiveLeaseEntity::class,
        DeviceReserveEntity::class,
        OfflineSpendEntity::class
    ],
    version = 1,
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
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
