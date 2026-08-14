package com.lastresponder.certificatestickermaker.viewmodel

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lastresponder.certificatestickermaker.data.db.FuneralHomeProfileEntity
import com.lastresponder.certificatestickermaker.data.repository.ProfileRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Backs the funeral-home profile manager and add/edit screens. Profiles live in Room, independent of any job. */
class ProfileViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = ProfileRepository(application)

    val profiles: StateFlow<List<FuneralHomeProfileEntity>> = repository.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val activeProfiles: StateFlow<List<FuneralHomeProfileEntity>> = repository.observeActive()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun createProfile(
        funeralHome: String,
        cityState: String,
        defaultQuantity: Int,
        preface: String,
        disclosure: String,
        logoUri: Uri?,
        designUri: Uri?,
        designFileName: String?,
        onResult: (Result<FuneralHomeProfileEntity>) -> Unit
    ) {
        viewModelScope.launch {
            val result = runCatching {
                repository.createProfile(funeralHome, cityState, defaultQuantity, preface, disclosure, logoUri, designUri, designFileName)
            }
            onResult(result)
        }
    }

    fun updateProfile(profile: FuneralHomeProfileEntity) = viewModelScope.launch { repository.updateProfile(profile) }

    fun updateProfileFields(
        id: String,
        funeralHome: String,
        cityState: String,
        defaultQuantity: Int,
        preface: String,
        disclosure: String,
        active: Boolean,
        newLogoUri: Uri?,
        newDesignUri: Uri?,
        newDesignFileName: String?,
        onResult: (Result<FuneralHomeProfileEntity>) -> Unit
    ) {
        viewModelScope.launch {
            val result = runCatching {
                repository.updateProfileFields(id, funeralHome, cityState, defaultQuantity, preface, disclosure, active, newLogoUri, newDesignUri, newDesignFileName)
            }
            onResult(result)
        }
    }

    fun duplicateProfile(sourceId: String, newFuneralHome: String, newCityState: String, onResult: (Result<FuneralHomeProfileEntity>) -> Unit) {
        viewModelScope.launch {
            onResult(runCatching { repository.duplicateProfile(sourceId, newFuneralHome, newCityState) })
        }
    }

    fun setActive(id: String, active: Boolean) = viewModelScope.launch { repository.setActive(id, active) }

    fun deleteProfile(id: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            onResult(runCatching { repository.deleteProfile(id) })
        }
    }

    suspend fun findById(id: String): FuneralHomeProfileEntity? = repository.findById(id)
}
