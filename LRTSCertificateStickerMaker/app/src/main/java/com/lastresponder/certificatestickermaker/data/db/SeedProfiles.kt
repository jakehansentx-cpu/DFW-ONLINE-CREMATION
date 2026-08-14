package com.lastresponder.certificatestickermaker.data.db

/**
 * The 20 funeral-home profiles imported from the source package's
 * `data/funeral_home_profiles.json` and `IMPORTED_AVERY_TEMPLATE_NOTES.md`,
 * carried over field-for-field (see MIGRATION_MAP.md for the full mapping
 * and the noted exceptions: Lavon's missing design link, the consolidated
 * Sachse alternate reference, Princeton using only its own page, Commerce's
 * blank disclosure, and Hiett's full-sheet default of 6).
 */
object SeedProfiles {

    private const val STANDARD_DISCLOSURE =
        "Disclosure: This temporary container is not intended for the permanent storage of cremated remains " +
            "in a niche, crypt, cremation interment container or interment space."
    private const val PREFACE = "The Cremated Remains of"
    private const val IMPORTED_AT = "imported-2026-08-13"
    private fun asset(name: String) = "asset://profiles/$name"
    private fun designRef(name: String) = "asset://profiles/design_refs/$name"

    val all: List<FuneralHomeProfileEntity> = listOf(
        FuneralHomeProfileEntity(
            id = "all-texas-cremation",
            funeralHome = "All Texas Cremation",
            cityState = "Plano, Texas",
            defaultQuantity = 3,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("all_texas_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("03_all_texas_cremations.pdf"),
            protectedFromDelete = true,
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "martin-oaks-cemetery-crematory",
            funeralHome = "Martin Oaks Cemetery and Crematory",
            cityState = "Lewisville, Texas",
            defaultQuantity = 4,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("martin_oaks_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("01_martin_oaks.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "funeraria-pilar-funeral-home",
            funeralHome = "Funeraria Pilar Funeral Home",
            cityState = "",
            defaultQuantity = 1,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("pilar_logo.png"),
            headerMode = "logo",
            printFuneralHome = "",
            printCityState = "",
            designReferencePath = designRef("02_pilar.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "mesquite-funeral-home",
            funeralHome = "Mesquite Funeral Home - Funeral and Cremation Services",
            cityState = "",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("mesquite_logo.png"),
            headerMode = "logo",
            printFuneralHome = "",
            printCityState = "",
            designReferencePath = designRef("04_mesquite_funeral_home.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "allen-family-funeral-options",
            funeralHome = "Allen Family Funeral Options",
            cityState = "",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("allen_family_logo.png"),
            headerMode = "logo",
            printFuneralHome = "",
            printCityState = "",
            designReferencePath = designRef("05_allen_family_funeral_options.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "chamberland-funerals-cremations",
            funeralHome = "Chamberland Funerals & Cremations",
            cityState = "",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("chamberland_logo.png"),
            headerMode = "logo",
            printFuneralHome = "",
            printCityState = "",
            designReferencePath = designRef("06_shared_chamberland_lavon.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "charles-w-smith-lavon",
            funeralHome = "Charles W Smith & Sons Funeral Home",
            cityState = "Lavon, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = "", // Supplied link duplicated Chamberland's design; withheld rather than reused. See MIGRATION_MAP.md.
            sourceStatus = "needs-correct-avery-link",
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "charles-w-smith-sachse",
            funeralHome = "Charles W Smith & Sons Funeral Home",
            cityState = "Sachse, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("07_charles_smith_sachse_a.pdf"),
            alternateDesignReferencePaths = listOf(designRef("14_charles_smith_sachse_b.pdf")),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "williams-funeral-directors-garland",
            funeralHome = "Williams Funeral Directors",
            cityState = "Garland, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("08_williams_funeral_directors.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "charles-w-smith-mckinney",
            funeralHome = "Charles W. Smith and Sons Funeral Home",
            cityState = "McKinney, Texas",
            defaultQuantity = 4,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("09_charles_smith_mckinney.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "eastgate-funeral-home-garland",
            funeralHome = "Eastgate Funeral Home",
            cityState = "Garland, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("10_eastgate_funeral_home.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "steven-g-hills-plano",
            funeralHome = "Steven G Hill's House of Funerals",
            cityState = "Plano, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("11_steven_g_hills.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "allen-funeral-home-wylie",
            funeralHome = "Allen Funeral Home",
            cityState = "Wylie, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("12_allen_funeral_home_wylie.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "hietts-lybrand-funeral-home",
            funeralHome = "Hiett's LyBrand Funeral Home",
            cityState = "",
            defaultQuantity = 6, // Full sheet - preserved deliberately, do not shrink.
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("hietts_lybrand_logo.png"),
            headerMode = "logo",
            printFuneralHome = "",
            printCityState = "",
            designReferencePath = designRef("13_unnamed.pdf"),
            sourceStatus = "identified-from-logo",
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "byrum-funeral-home-lancaster",
            funeralHome = "Byrum Funeral Home",
            cityState = "Lancaster, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("15_byrum_funeral_home.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "temple-and-sons-oklahoma-city",
            funeralHome = "Temple and Sons Funeral Directors",
            cityState = "Oklahoma City, OK",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = "",
            headerMode = "text",
            headerText = "Metro Mortuary & Crematory\nSachse, Texas",
            designReferencePath = designRef("16_temple_and_sons.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "commerce-funeral-home-cremation-service",
            funeralHome = "Commerce Funeral Home & Cremation Service",
            cityState = "Commerce, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = "", // Source design has no standard disclosure - preserved as blank, not defaulted.
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("17_commerce_funeral_home.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "fry-gibbs-funeral-home-paris",
            funeralHome = "Fry-Gibbs Funeral Home",
            cityState = "Paris, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("18_fry_gibbs_funeral_home.pdf"),
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "charles-smith-sons-princeton",
            funeralHome = "Charles Smith and Sons Funeral Home",
            cityState = "Princeton, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = asset("metro_logo.png"),
            headerMode = "logo",
            designReferencePath = designRef("19_charles_smith_princeton.pdf"), // Page 1 only; page 2 (unrelated McKinney labels) intentionally excluded.
            createdAt = IMPORTED_AT
        ),
        FuneralHomeProfileEntity(
            id = "queen-city-funeral-home",
            funeralHome = "Queen City Funeral Home",
            cityState = "Queen City, Texas",
            defaultQuantity = 2,
            preface = PREFACE,
            disclosure = STANDARD_DISCLOSURE,
            logoPath = "",
            headerMode = "text",
            headerText = "Metro Mortuary & Crematory\nSachse, Texas",
            designReferencePath = designRef("20_queen_city_funeral_home.pdf"),
            createdAt = IMPORTED_AT
        )
    )
}
