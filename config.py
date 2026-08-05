# Physical layout of your cooler system, now organized by named cooler
# instead of generic numbered racks.
#
# Edit this list to match reality: rename coolers, add/remove coolers, and
# set each cooler's actual shelf count and slot pattern. After editing,
# delete cooler.db and restart the app once to reseed the location table
# with the new layout. (Do NOT delete cooler.db once you have real case
# data in it -- that wipes history. Back it up first if you ever need to
# re-seed a live system.)
#
# For each cooler:
#   "name"    -- the full name shown on the board and printed on labels
#   "code"    -- a SHORT unique code used inside the QR text itself
#                (keep it short; it doesn't need to be pretty, just unique)
#   "shelves" -- a list of (shelf_number, slots) pairs:
#                  slots = ["A", "B"]  -> shelf splits into two spots
#                  slots = [None]      -> shelf holds one decedent, no letter
#   "shared"  -- optional, defaults to False. If True, every location in
#                this cooler can hold MULTIPLE decedents at once under one
#                QR code, instead of the normal one-location-one-occupant
#                rule. Scanning still works exactly the same (scan the
#                decedent's Case ID tag, then scan the location QR) --
#                shared just means the location never shows as "full."
#   "screen"  -- which tab this cooler shows up under on the /board display.
#                Coolers sharing a "screen" value are grouped onto the same
#                tab; the board shows one tab at a time, switched manually.
#
# You can mix both patterns within the same cooler (see ATC Back Cooler
# below for an example: shelves 1-2 have A/B, shelf 3 does not).

# Shared passcode required to view the board or use the scan station from
# any device. Change this to something only your team knows -- anyone with
# this passcode AND network access (LAN or Tailscale) can see decedent
# names/funeral homes, so treat it like a real password, not a formality.
ACCESS_PASSCODE = "Metro2026"

# Pre-printed placeholder field tags (see gen_field_tags.py) all start with
# this prefix (e.g. FIELD-001). The first time one is scanned, it gets
# claimed against a real, sequential case number from the sheet -- see
# api_case_lookup() in app.py.
FIELD_TAG_PREFIX = "FIELD-"

# Google Sheets integration for intake. Set GOOGLE_SHEETS_ENABLED to True
# once you've done the service account setup (see README) and dropped the
# downloaded JSON key file in this folder.
GOOGLE_SHEETS_ENABLED = True
GOOGLE_SERVICE_ACCOUNT_FILE = "service_account.json"
GOOGLE_SHEET_ID = "1QzFHSraw7OTfJKp-UrP0nSpZJB5WxgLUPadiWiNLVbE"  # "JULY CALL LOG"
GOOGLE_SHEET_TAB = ""  # leave blank unless you have multiple tabs and need a specific one

COOLERS = [
    {
        "name": "Metro Large Cooler",
        "code": "METRO-LG",
        "screen": "Metro Coolers",
        # Shelves 1-12: A/B slots. Shelves 13-35: single slot, no letter.
        # Shelves 36-59: back to A/B slots. 59 shelves, 95 locations total.
        "shelves": (
            [(i, ["A", "B"]) for i in range(1, 13)]
            + [(i, [None]) for i in range(13, 36)]
            + [(i, ["A", "B"]) for i in range(36, 60)]
        ),
    },
    {
        "name": "Metro Small Cooler",
        "code": "METRO-SM",
        "screen": "Metro Coolers",
        # 8 shelves, single slot each, no A/B letter.
        "shelves": [(i, [None]) for i in range(1, 9)],
    },
    {
        "name": "Metro Babies",
        "code": "METRO-BABY",
        "screen": "Metro Coolers",
        # ONE shared location, ONE QR code -- holds multiple decedents at
        # once. Each is still scanned in individually via their own Case
        # ID tag; this location just never shows as "full."
        "shared": True,
        "shelves": [(1, [None])],
    },
    {
        "name": "Metro Prep Room",
        "code": "METRO-PREP",
        "screen": "Metro Prep Room",
        # Confirmed: 8 slots, single (no A/B), separate from the walk-in cooler.
        "shelves": [(i, [None]) for i in range(1, 9)],
    },
    {
        "name": "Eastgate Cooler",
        "code": "EASTGATE",
        "screen": "Eastgate Cooler",
        # Shelves 1-10, all A/B, per the reference photo.
        "shelves": [(i, ["A", "B"]) for i in range(1, 11)],
    },
    {
        "name": "ATC Front Cooler",
        "code": "ATC-FRONT",
        "screen": "ATC Coolers",
        # Corrected: shelves 1-10, all A/B (was 16, that was wrong).
        "shelves": [(i, ["A", "B"]) for i in range(1, 11)],
    },
    {
        # Overflow area, separate from the numbered A/B shelves above --
        # matches the "Cots/Biers" section seen on the physical whiteboard.
        "name": "ATC Front Cots/Biers",
        "code": "ATC-FRONT-COTS",
        "screen": "ATC Coolers",
        "shelves": [(i, [None]) for i in range(1, 11)],
    },
    {
        "name": "ATC Back Cooler",
        "code": "ATC-BACK",
        "screen": "ATC Coolers",
        # Shelves 1-16, all A/B, per the reference photo.
        "shelves": [(i, ["A", "B"]) for i in range(1, 17)],
    },
    {
        # Overflow area, separate from the numbered A/B shelves above --
        # matches the "Cots/Biers" section seen on the physical whiteboard.
        "name": "ATC Back Cots/Biers",
        "code": "ATC-BACK-COTS",
        "screen": "ATC Coolers",
        "shelves": [(i, [None]) for i in range(1, 11)],
    },
    {
        "name": "Cremation Staging",
        "code": "CREM-STAGE",
        "screen": "Cremation Staging",
        # Transitional holding area for decedents remaining in-house for
        # cremation, moved here (via Move, same as any other location)
        # once they leave a cooler shelf/slot. 12 individual shelves,
        # one decedent each -- no A/B letter.
        "shelves": [(i, [None]) for i in range(1, 13)],
    },
    {
        # Biers, same pattern as the ATC Cots/Biers overflow areas --
        # separate from the 12 numbered shelves above.
        "name": "Cremation Staging Biers",
        "code": "CREM-STAGE-BIERS",
        "screen": "Cremation Staging",
        "shelves": [(i, [None]) for i in range(1, 6)],
    },
]

# The fixed order/order of tabs on the /board display. Every distinct
# "screen" value used above must appear here, or that cooler's occupants
# won't show up anywhere on the board.
BOARD_SCREENS = [
    "Metro Coolers",
    "Metro Prep Room",
    "Eastgate Cooler",
    "ATC Coolers",
    "Cremation Staging",
]
