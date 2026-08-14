package com.lastresponder.certificatestickermaker.data.repository

import android.content.Context
import android.net.Uri
import com.lastresponder.certificatestickermaker.data.ProfileUploadManager
import com.lastresponder.certificatestickermaker.data.db.AppDatabase
import com.lastresponder.certificatestickermaker.data.db.FuneralHomeProfileEntity
import com.lastresponder.certificatestickermaker.domain.TextNormalization
import kotlinx.coroutines.flow.Flow
import java.time.Instant
import java.util.UUID

/**
 * Local-only funeral-home profile store. Profiles persist independently of
 * any in-progress case/job (per the "Clear Current Job must not delete
 * profiles" requirement) - they live in Room, not in job-scoped state.
 */
class ProfileRepository(context: Context) {

    private val dao = AppDatabase.get(context).funeralHomeProfileDao()
    private val uploads = ProfileUploadManager(context)

    fun observeAll(): Flow<List<FuneralHomeProfileEntity>> = dao.observeAll()

    fun observeActive(): Flow<List<FuneralHomeProfileEntity>> = dao.observeActive()

    suspend fun findById(id: String): FuneralHomeProfileEntity? = dao.findById(id)

    private fun slug(name: String): String {
        val base = name.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').take(45)
        val safe = base.ifBlank { "funeral-home" }
        return "$safe-${UUID.randomUUID().toString().take(8)}"
    }

    suspend fun createProfile(
        funeralHome: String,
        cityState: String,
        defaultQuantity: Int,
        preface: String,
        disclosure: String,
        logoUri: Uri?,
        designUri: Uri?,
        designFileName: String?
    ): FuneralHomeProfileEntity {
        val name = TextNormalization.cleanText(funeralHome)
        require(name.isNotEmpty()) { "Enter the funeral-home name before saving the profile." }
        require(defaultQuantity in 1..60) { "Default label quantity must be a number from 1 through 60." }
        val id = slug(name)
        val logoPath = logoUri?.let { uploads.saveLogo(id, it) } ?: ""
        val designPath = designUri?.let { uploads.saveDesignReference(id, it, designFileName) } ?: ""
        val profile = FuneralHomeProfileEntity(
            id = id,
            funeralHome = name,
            cityState = TextNormalization.cleanText(cityState),
            defaultQuantity = defaultQuantity,
            preface = TextNormalization.cleanText(preface).ifBlank { "The Cremated Remains of" },
            disclosure = TextNormalization.cleanText(disclosure),
            logoPath = logoPath,
            headerMode = if (logoPath.isNotBlank()) "logo" else "name",
            designReferencePath = designPath,
            createdAt = Instant.now().toString()
        )
        dao.insert(profile)
        return profile
    }

    suspend fun updateProfile(profile: FuneralHomeProfileEntity) = dao.update(profile)

    /** Full edit-screen update: text fields always applied; a new logo/design upload replaces the stored path. */
    suspend fun updateProfileFields(
        id: String,
        funeralHome: String,
        cityState: String,
        defaultQuantity: Int,
        preface: String,
        disclosure: String,
        active: Boolean,
        newLogoUri: Uri?,
        newDesignUri: Uri?,
        newDesignFileName: String?
    ): FuneralHomeProfileEntity {
        val existing = dao.findById(id) ?: throw IllegalArgumentException("Profile not found.")
        val name = TextNormalization.cleanText(funeralHome)
        require(name.isNotEmpty()) { "Enter the funeral-home name before saving the profile." }
        require(defaultQuantity in 1..60) { "Default label quantity must be a number from 1 through 60." }
        val logoPath = newLogoUri?.let { uploads.saveLogo(id, it) } ?: existing.logoPath
        val designPath = newDesignUri?.let { uploads.saveDesignReference(id, it, newDesignFileName) } ?: existing.designReferencePath
        val updated = existing.copy(
            funeralHome = name,
            cityState = TextNormalization.cleanText(cityState),
            defaultQuantity = defaultQuantity,
            preface = TextNormalization.cleanText(preface).ifBlank { "The Cremated Remains of" },
            disclosure = TextNormalization.cleanText(disclosure),
            logoPath = logoPath,
            headerMode = if (existing.headerMode == "text") "text" else if (logoPath.isNotBlank()) "logo" else "name",
            designReferencePath = designPath,
            active = active
        )
        dao.update(updated)
        return updated
    }

    /** Copies a profile under a new id/name - for "only the logo or location changes" cases. */
    suspend fun duplicateProfile(sourceId: String, newFuneralHome: String, newCityState: String): FuneralHomeProfileEntity {
        val source = dao.findById(sourceId) ?: throw IllegalArgumentException("Profile not found.")
        val copy = source.copy(
            id = slug(newFuneralHome.ifBlank { source.funeralHome }),
            funeralHome = TextNormalization.cleanText(newFuneralHome.ifBlank { source.funeralHome }),
            cityState = TextNormalization.cleanText(newCityState.ifBlank { source.cityState }),
            protectedFromDelete = false,
            createdAt = Instant.now().toString()
        )
        dao.insert(copy)
        return copy
    }

    suspend fun setActive(id: String, active: Boolean) {
        val profile = dao.findById(id) ?: return
        dao.update(profile.copy(active = active))
    }

    suspend fun deleteProfile(id: String) {
        val profile = dao.findById(id) ?: return
        require(!profile.protectedFromDelete) { "The built-in All Texas Cremation profile cannot be deleted." }
        uploads.deleteIfInternal(profile.logoPath)
        uploads.deleteIfInternal(profile.designReferencePath)
        profile.alternateDesignReferencePaths.forEach { uploads.deleteIfInternal(it) }
        dao.deleteById(id)
    }
}
