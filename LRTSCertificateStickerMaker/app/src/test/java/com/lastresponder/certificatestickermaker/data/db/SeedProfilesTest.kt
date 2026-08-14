package com.lastresponder.certificatestickermaker.data.db

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies every imported funeral-home profile's default quantity and the
 * documented source exceptions (see MIGRATION_MAP.md /
 * IMPORTED_AVERY_TEMPLATE_NOTES.md in the source package).
 */
class SeedProfilesTest {

    private fun byId(id: String) = SeedProfiles.all.first { it.id == id }

    @Test
    fun `exactly 20 imported profiles`() {
        assertEquals(20, SeedProfiles.all.size)
        assertEquals(20, SeedProfiles.all.map { it.id }.toSet().size) // all ids unique
    }

    @Test
    fun `default quantities match the imported source notes`() {
        assertEquals(4, byId("martin-oaks-cemetery-crematory").defaultQuantity)
        assertEquals(1, byId("funeraria-pilar-funeral-home").defaultQuantity)
        assertEquals(3, byId("all-texas-cremation").defaultQuantity)
        assertEquals(2, byId("mesquite-funeral-home").defaultQuantity)
        assertEquals(2, byId("allen-family-funeral-options").defaultQuantity)
        assertEquals(2, byId("chamberland-funerals-cremations").defaultQuantity)
        assertEquals(2, byId("charles-w-smith-lavon").defaultQuantity)
        assertEquals(2, byId("charles-w-smith-sachse").defaultQuantity)
        assertEquals(2, byId("williams-funeral-directors-garland").defaultQuantity)
        assertEquals(4, byId("charles-w-smith-mckinney").defaultQuantity)
        assertEquals(2, byId("eastgate-funeral-home-garland").defaultQuantity)
        assertEquals(2, byId("steven-g-hills-plano").defaultQuantity)
        assertEquals(2, byId("allen-funeral-home-wylie").defaultQuantity)
        assertEquals(6, byId("hietts-lybrand-funeral-home").defaultQuantity)
        assertEquals(2, byId("byrum-funeral-home-lancaster").defaultQuantity)
        assertEquals(2, byId("temple-and-sons-oklahoma-city").defaultQuantity)
        assertEquals(2, byId("commerce-funeral-home-cremation-service").defaultQuantity)
        assertEquals(2, byId("fry-gibbs-funeral-home-paris").defaultQuantity)
        assertEquals(2, byId("charles-smith-sons-princeton").defaultQuantity)
        assertEquals(2, byId("queen-city-funeral-home").defaultQuantity)
    }

    @Test
    fun `Hiett's keeps its full-sheet default of 6, not shrunk to match the others`() {
        assertEquals(6, byId("hietts-lybrand-funeral-home").defaultQuantity)
    }

    @Test
    fun `Lavon is flagged as needing its own design and does not reuse Chamberland's`() {
        val lavon = byId("charles-w-smith-lavon")
        val chamberland = byId("chamberland-funerals-cremations")
        assertEquals("needs-correct-avery-link", lavon.sourceStatus)
        assertTrue("Lavon must not silently reuse Chamberland's design reference", lavon.designReferencePath.isBlank())
        assertNotEquals(chamberland.designReferencePath, lavon.designReferencePath)
    }

    @Test
    fun `Sachse's duplicate reference is consolidated into one profile with an alternate, not two profiles`() {
        val sachseProfiles = SeedProfiles.all.filter { it.funeralHome.contains("Sachse") || it.cityState.contains("Sachse") }
        assertEquals(1, sachseProfiles.size)
        val sachse = byId("charles-w-smith-sachse")
        assertTrue(sachse.designReferencePath.isNotBlank())
        assertEquals(1, sachse.alternateDesignReferencePaths.size)
    }

    @Test
    fun `Princeton uses only its own reference, not the unrelated McKinney page`() {
        val princeton = byId("charles-smith-sons-princeton")
        assertTrue(princeton.designReferencePath.contains("princeton"))
        assertFalse(princeton.designReferencePath.contains("mckinney"))
    }

    @Test
    fun `Commerce has no standard disclosure`() {
        assertEquals("", byId("commerce-funeral-home-cremation-service").disclosure)
    }

    @Test
    fun `every other profile keeps the standard disclosure`() {
        val nonCommerce = SeedProfiles.all.filterNot { it.id == "commerce-funeral-home-cremation-service" }
        nonCommerce.forEach { profile ->
            assertTrue("${profile.id} should carry the standard disclosure", profile.disclosure.startsWith("Disclosure:"))
        }
    }

    @Test
    fun `profiles that suppress the printed funeral-home text carry an explicit blank, not a missing key`() {
        // Pilar, Mesquite, Allen Family, Chamberland, Hiett's - their logo art already
        // shows the name, so print_funeral_home/print_city_state are explicit blanks.
        listOf(
            "funeraria-pilar-funeral-home",
            "mesquite-funeral-home",
            "allen-family-funeral-options",
            "chamberland-funerals-cremations",
            "hietts-lybrand-funeral-home"
        ).forEach { id ->
            val profile = byId(id)
            assertEquals("", profile.printFuneralHome)
            assertEquals("", profile.printCityState)
        }
    }

    @Test
    fun `profiles without that suppression fall back to funeralHome-cityState (key absent, not blank)`() {
        val martinOaks = byId("martin-oaks-cemetery-crematory")
        assertEquals(null, martinOaks.printFuneralHome)
        assertEquals(null, martinOaks.printCityState)
    }

    @Test
    fun `All Texas Cremation is the protected built-in default and cannot be deleted`() {
        assertTrue(byId("all-texas-cremation").protectedFromDelete)
        SeedProfiles.all.filterNot { it.id == "all-texas-cremation" }.forEach {
            assertFalse("${it.id} should be deletable", it.protectedFromDelete)
        }
    }
}
