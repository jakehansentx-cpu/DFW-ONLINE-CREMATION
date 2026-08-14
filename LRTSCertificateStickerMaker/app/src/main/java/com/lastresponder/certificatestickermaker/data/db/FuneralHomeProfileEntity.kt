package com.lastresponder.certificatestickermaker.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import androidx.room.TypeConverters

/**
 * Local funeral-home sticker profile. Field names track `app.py`'s
 * `data/funeral_home_profiles.json` schema so the imported profiles could be
 * migrated 1:1 (see MIGRATION_MAP.md).
 *
 * Image/PDF paths use a small scheme prefix so both bundled seed assets and
 * later staff uploads can live in the same column:
 *  - "asset://profiles/xxx.png"   -> app/src/main/assets/profiles/xxx.png (seeded, read-only)
 *  - "file:///data/.../xxx.png"   -> internal app storage (staff-uploaded)
 *  - "" / null                    -> not supplied
 */
@Entity(tableName = "funeral_home_profiles")
@TypeConverters(StringListConverter::class)
data class FuneralHomeProfileEntity(
    @PrimaryKey val id: String,
    val funeralHome: String,
    val cityState: String,
    val defaultQuantity: Int,
    val labelType: String = "Avery 8464",
    val preface: String = "The Cremated Remains of",
    val disclosure: String = "",
    val logoPath: String = "",
    val headerMode: String = "logo",
    val headerText: String = "",
    /** null = key absent in the source profile (fall back to funeralHome/cityState). */
    val printFuneralHome: String? = null,
    val printCityState: String? = null,
    val designReferencePath: String = "",
    val alternateDesignReferencePaths: List<String> = emptyList(),
    val sourceStatus: String? = null,
    val active: Boolean = true,
    val protectedFromDelete: Boolean = false,
    val createdAt: String = ""
)

/** Paths never contain "|", so it is a safe plain-text delimiter here. */
class StringListConverter {
    private val delimiter = "|"

    @TypeConverter
    fun fromList(value: List<String>?): String = value.orEmpty().joinToString(delimiter)

    @TypeConverter
    fun toList(value: String?): List<String> =
        if (value.isNullOrEmpty()) emptyList() else value.split(delimiter).filter { it.isNotEmpty() }
}
