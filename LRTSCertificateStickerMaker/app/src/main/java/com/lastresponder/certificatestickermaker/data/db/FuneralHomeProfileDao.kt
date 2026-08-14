package com.lastresponder.certificatestickermaker.data.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface FuneralHomeProfileDao {

    @Query("SELECT * FROM funeral_home_profiles ORDER BY funeralHome ASC")
    fun observeAll(): Flow<List<FuneralHomeProfileEntity>>

    @Query("SELECT * FROM funeral_home_profiles WHERE active = 1 ORDER BY funeralHome ASC")
    fun observeActive(): Flow<List<FuneralHomeProfileEntity>>

    @Query("SELECT * FROM funeral_home_profiles WHERE id = :id LIMIT 1")
    suspend fun findById(id: String): FuneralHomeProfileEntity?

    @Query("SELECT COUNT(*) FROM funeral_home_profiles")
    suspend fun count(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(profiles: List<FuneralHomeProfileEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(profile: FuneralHomeProfileEntity)

    @Update
    suspend fun update(profile: FuneralHomeProfileEntity)

    @Delete
    suspend fun delete(profile: FuneralHomeProfileEntity)

    @Query("DELETE FROM funeral_home_profiles WHERE id = :id AND protectedFromDelete = 0")
    suspend fun deleteById(id: String)
}
