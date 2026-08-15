// Ported field-for-field from LRTSCertificateStickerMaker's SeedProfiles.kt,
// which itself was imported from the source package's
// funeral_home_profiles.json / IMPORTED_AVERY_TEMPLATE_NOTES.md. See that
// file's comments for the noted exceptions (Lavon's missing design link,
// the consolidated Sachse alternate reference, Princeton using only its own
// page, Hiett's full-sheet default of 6).
//
// printFuneralHome / printCityState: `null` means "not set, fall back to
// funeralHome/cityState on the label"; `""` means "explicitly blank, print
// nothing" (several profiles' logo art already shows the name).
//
// Golden rule (enforced in pdfgen.js, not just here): every sticker prints
// a disclosure line, with no exceptions - a profile's `disclosure` field
// can be customized, but never removed. If it's ever blank, pdfgen.js
// falls back to STANDARD_DISCLOSURE rather than printing nothing.

const STANDARD_DISCLOSURE =
  "Disclosure: This temporary container is not intended for the permanent storage of cremated remains " +
  "in a niche, crypt, cremation interment container or interment space.";
const PREFACE = "The Cremated Remains of";

const PROFILES = [
  {
    id: "all-texas-cremation",
    funeralHome: "All Texas Cremation",
    cityState: "Plano, Texas",
    defaultQuantity: 3,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "all_texas_logo",
    headerMode: "logo",
  },
  {
    id: "martin-oaks-cemetery-crematory",
    funeralHome: "Martin Oaks Cemetery and Crematory",
    cityState: "Lewisville, Texas",
    defaultQuantity: 4,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    // The "martin_oaks_logo" asset was a leftover data bug from the original
    // migration - it actually contained a duplicate of the Metro logo, not
    // a real Martin Oaks logo (confirmed against the original reference
    // design, which uses the plain Metro header + italic name/city text,
    // same as most other profiles - Martin Oaks never had its own logo art).
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "funeraria-pilar-funeral-home",
    funeralHome: "Funeraria Pilar Funeral Home",
    cityState: "",
    defaultQuantity: 1,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    // Redesigned per the official Avery reference: Metro logo at top,
    // Pilar's own logo prints below the name (same two-logo layout as
    // Mathis/Chamberland), no separate city/state line.
    logo: "metro_logo",
    secondaryLogo: "pilar_logo",
    headerMode: "logo",
    printFuneralHome: "",
    printCityState: "",
  },
  {
    id: "mesquite-funeral-home",
    funeralHome: "Mesquite Funeral Home - Funeral and Cremation Services",
    cityState: "",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    secondaryLogo: "mesquite_logo",
    headerMode: "logo",
    printFuneralHome: "",
    printCityState: "",
  },
  {
    id: "allen-family-funeral-options",
    funeralHome: "Allen Family Funeral Options",
    cityState: "",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    secondaryLogo: "allen_family_logo",
    headerMode: "logo",
    printFuneralHome: "",
    printCityState: "",
  },
  {
    id: "chamberland-funerals-cremations",
    funeralHome: "Chamberland Funerals & Cremations",
    cityState: "",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    // Redesigned per the Avery mock: Metro logo at top, Chamberland's own
    // logo prints below the name instead (same two-logo layout as Mathis),
    // no separate city/state line.
    logo: "metro_logo",
    secondaryLogo: "chamberland_logo",
    // Chamberland's logo art is a very wide, short banner (~5:1) - the
    // shared default box is nearly square by comparison, so it only used
    // part of its space and looked like it was floating. Widen just this
    // profile's box to match the art's own proportions.
    secondaryLogoBoxWidth: 220,
    secondaryLogoBoxHeight: 48,
    headerMode: "logo",
    printFuneralHome: "",
    printCityState: "",
  },
  {
    id: "charles-w-smith-lavon",
    funeralHome: "Charles W Smith & Sons Funeral Home",
    cityState: "Lavon, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "charles-w-smith-sachse",
    funeralHome: "Charles W Smith & Sons Funeral Home",
    cityState: "Sachse, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "williams-funeral-directors-garland",
    funeralHome: "Williams Funeral Directors",
    cityState: "Garland, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "charles-w-smith-mckinney",
    funeralHome: "Charles W. Smith and Sons Funeral Home",
    cityState: "McKinney, Texas",
    defaultQuantity: 4,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "eastgate-funeral-home-garland",
    funeralHome: "Eastgate Funeral Home",
    cityState: "Garland, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "steven-g-hills-plano",
    funeralHome: "Steven G Hill's House of Funerals",
    cityState: "Plano, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "allen-funeral-home-wylie",
    funeralHome: "Allen Funeral Home",
    cityState: "Wylie, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "hietts-lybrand-funeral-home",
    funeralHome: "Hiett's LyBrand Funeral Home",
    cityState: "",
    defaultQuantity: 6, // Full sheet - preserved deliberately, do not shrink.
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    // Redesigned per the official Avery reference: Metro logo at top,
    // Hiett's LyBrand's own logo prints below the name instead.
    logo: "metro_logo",
    secondaryLogo: "hietts_lybrand_logo",
    headerMode: "logo",
    printFuneralHome: "",
    printCityState: "",
  },
  {
    id: "byrum-funeral-home-lancaster",
    funeralHome: "Byrum Funeral Home",
    cityState: "Lancaster, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "temple-and-sons-oklahoma-city",
    funeralHome: "Temple and Sons Funeral Directors",
    cityState: "Oklahoma City, OK",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: null,
    headerMode: "text",
    headerText: "Metro Mortuary & Crematory\nSachse, Texas",
  },
  {
    id: "calvary-memorial-funeral-home",
    funeralHome: "Calvary Memorial Funeral Home",
    cityState: "Dallas, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: null,
    headerMode: "text",
    headerText: "Metro Mortuary & Crematory\nSachse, Texas",
  },
  {
    id: "commerce-funeral-home-cremation-service",
    funeralHome: "Commerce Funeral Home & Cremation Service",
    cityState: "Commerce, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "fry-gibbs-funeral-home-paris",
    funeralHome: "Fry-Gibbs Funeral Home",
    cityState: "Paris, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "charles-smith-sons-princeton",
    funeralHome: "Charles Smith and Sons Funeral Home",
    cityState: "Princeton, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: "metro_logo",
    headerMode: "logo",
  },
  {
    id: "queen-city-funeral-home",
    funeralHome: "Queen City Funeral Home",
    cityState: "Queen City, Texas",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    logo: null,
    headerMode: "text",
    headerText: "Metro Mortuary & Crematory\nSachse, Texas",
  },
  {
    id: "mathis-funeral-home",
    funeralHome: "Mathis Funeral Home",
    cityState: "Dexter, Missouri",
    defaultQuantity: 2,
    preface: PREFACE,
    disclosure: STANDARD_DISCLOSURE,
    // Two-logo sticker: Metro logo at the top header, Mathis's own logo
    // printed where the funeral home's name would otherwise go, with the
    // city/state line beneath it.
    logo: "metro_logo",
    secondaryLogo: "mathis_funeral_home_logo",
    headerMode: "logo",
  },
];

function findProfile(id) {
  return PROFILES.find((p) => p.id === id) || null;
}
