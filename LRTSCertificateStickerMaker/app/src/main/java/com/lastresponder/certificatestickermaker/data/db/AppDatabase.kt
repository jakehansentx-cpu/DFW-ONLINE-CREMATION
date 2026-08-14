package com.lastresponder.certificatestickermaker.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Database(entities = [FuneralHomeProfileEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun funeralHomeProfileDao(): FuneralHomeProfileDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase {
            instance?.let { return it }
            synchronized(this) {
                instance?.let { return it }
                val db = Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "lrts_profiles.db")
                    .addCallback(object : Callback() {
                        override fun onCreate(db: SupportSQLiteDatabase) {
                            super.onCreate(db)
                            // Local funeral-home profiles persist independently of any in-progress
                            // case, exactly like `data/funeral_home_profiles.json` in the source mock -
                            // seeded once, on first launch, never re-seeded on later opens.
                            CoroutineScope(Dispatchers.IO).launch {
                                get(context).funeralHomeProfileDao().insertAll(SeedProfiles.all)
                            }
                        }
                    })
                    .build()
                instance = db
                return db
            }
        }
    }
}
