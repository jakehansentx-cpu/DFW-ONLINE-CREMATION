"""
Google Sheets integration for the call log.

Column layout (matches your sheet):
    A = case number
    B = date
    C = time received (first call)
    D = decedent name -- font turns orange while temporarily checked out
        (autopsy, organ/tissue donation, etc.), back to black once
        checked back in (see set_case_checked_out_color())
    E = funeral home
    F = removal type
    G = disposition
    H = removal by
    I = night (Yes/No)
    J = cremation date/time -- filled in by the app when a case is marked
        Cremated (see backfill_cremation()); otherwise blank
    K = cremation disk number -- filled in by the app alongside J when a
        case is marked Cremated; otherwise blank
    L = cooler location + shelf/slot (written back after Assign/Move)
    M = Final Disposition -- the app writes here on both Release
        ("Released to <facility/funeral home/org>") and Cremated
        ("Cremated"); otherwise blank/manual
    N = link to the case's page (has a working QR on it, and a Print
        Tag link) -- NOT a picture in the cell. Google Drive service
        accounts have no storage quota of their own and there's no
        practical way around that on a free (non-Workspace) Google
        account, so the cell holds a clickable link instead. The
        armband tag itself still has a real, scannable QR code either
        way -- this column is just a convenience shortcut from the
        sheet.
    O = INVENTORY (the sheet's real header) -- "NO PROPERTY" (linked to
        the scan app's Inventory panel for the case) until the first
        inventory item (photo and/or description) is logged, then "Yes"
        (linked to the case page instead). Always one or the other,
        never blank -- see backfill_inventory_status(). NOT released-to
        (M's "Released to <X>" already covers that) and NOT column Q.
    P = Documents (the sheet's real header) -- "NO DOCUMENTS" (linked to
        the scan app's Scan Document panel for the case) until the first
        document is scanned, then "Yes" (linked to the case page
        instead). Same always-explicit-never-blank pattern as O -- see
        backfill_documents_status(). Checkout status used to live here
        (see D above for where that moved).
    Q = Notes -- free text for staff's own use. The app never writes
        here.
    R = Days in Storage -- billable time in our care. Starts counting
        the day a case is created (entered into the system), keeps
        running through any temporary checkout/check-in (that doesn't
        pause it), and stops the day the decedent is released or
        cremated. While still in storage this is a live formula that
        recalculates on its own every day the sheet is opened (no daily
        job needed); once released/cremated it's frozen to a fixed
        number so billing stops accruing. See backfill_storage_days().

"Next available case number" = the first row, scanning top to bottom,
where column A has a value but B, D, and E are all still empty. That's
what makes a row "reserved but unclaimed" rather than a completed
historical case.

Every function below takes a sheet_id as its first argument rather than
reading one fixed spreadsheet out of config -- a new call log spreadsheet
gets generated every month, and a case created against last month's sheet
needs to keep reading/writing that same sheet for the rest of its life
even after this month's sheet becomes "current" for new intakes (see
get_current_sheet_id()/set_current_sheet() in app.py, and the
cases.sheet_id column each case remembers this at creation time).
"""
import json
import re

import config
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    # Read-only Drive access (content, not just metadata) -- lets the
    # service account notice a new monthly sheet shared with it (see
    # find_shared_sheet_by_name() below) AND export a sheet's actual
    # content as a file (see backup.py's sheet export), still without
    # ever granting any ability to edit or delete anything in Drive.
    # Requires the Drive API to be enabled on the same Google Cloud
    # project as the Sheets API (see README).
    "https://www.googleapis.com/auth/drive.readonly",
]

# Matches the spreadsheet ID out of any Google Sheets URL shape
# (/d/<id>/edit, /d/<id>/edit#gid=0, /d/<id>, etc).
_SHEET_URL_RE = re.compile(r"/spreadsheets/d/([a-zA-Z0-9-_]+)")
# A bare ID pasted with no URL around it at all.
_BARE_ID_RE = re.compile(r"^[a-zA-Z0-9-_]{20,}$")


def extract_sheet_id(url_or_id):
    """Pulls the spreadsheet ID out of a pasted Google Sheets link, or
    accepts a bare ID typed/pasted directly. Returns None if it doesn't
    look like either."""
    text = (url_or_id or "").strip()
    if not text:
        return None
    m = _SHEET_URL_RE.search(text)
    if m:
        return m.group(1)
    if _BARE_ID_RE.match(text):
        return text
    return None


def service_account_email():
    """Reads just the client_email out of the service account key file --
    shown to staff so they know exactly who to share each new monthly
    sheet with. Returns None if the key file isn't set up yet."""
    try:
        with open(config.GOOGLE_SERVICE_ACCOUNT_FILE) as f:
            return json.load(f).get("client_email")
    except (OSError, ValueError):
        return None


def _get_service():
    creds = service_account.Credentials.from_service_account_file(
        config.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds)


def _get_drive_service():
    creds = service_account.Credentials.from_service_account_file(
        config.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    return build("drive", "v3", credentials=creds)


def find_shared_sheet_by_name(name):
    """Looks for a spreadsheet with this exact name that's been shared
    with the service account (not created by it -- see the Apps Script
    in apps_script/monthly_sheet_rollover.gs, which creates each new
    monthly sheet under a real Google account with real storage, then
    shares it here) but not yet adopted as a sheet_id anywhere. Returns
    the spreadsheet ID, or None if nothing matches yet.

    If more than one file happens to match (shouldn't normally happen),
    the most recently created one wins."""
    service = _get_drive_service()
    result = (
        service.files()
        .list(
            q=(
                f"name = '{name}' "
                "and mimeType = 'application/vnd.google-apps.spreadsheet' "
                "and sharedWithMe = true "
                "and trashed = false"
            ),
            fields="files(id, createdTime)",
            orderBy="createdTime desc",
            pageSize=1,
        )
        .execute()
    )
    files = result.get("files", [])
    return files[0]["id"] if files else None


def export_sheet_xlsx(sheet_id):
    """Downloads a full .xlsx snapshot of a spreadsheet's current
    content -- used by backup.py to keep an offline copy of every
    monthly call log on the backup drive, independent of Google Drive
    itself (protects against an accidental delete/corruption there,
    on top of Drive's own 30-day Trash + Version History)."""
    service = _get_drive_service()
    return service.files().export(
        fileId=sheet_id,
        mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ).execute()


def get_sheet_title(sheet_id):
    """The spreadsheet's human-readable name (e.g. "AUGUST 2026 CALL
    LOG") -- used to name its backup file sensibly instead of just the
    opaque sheet_id. Returns None if it can't be read for any reason."""
    try:
        service = _get_drive_service()
        meta = service.files().get(fileId=sheet_id, fields="name").execute()
        return meta.get("name")
    except Exception:
        return None


def _sheet_range(a1_range):
    tab = config.GOOGLE_SHEET_TAB
    return f"{tab}!{a1_range}" if tab else a1_range


def verify_access(sheet_id):
    """Raises if this sheet can't be read with the current service
    account credentials -- used when staff set a new monthly sheet, so a
    forgotten "Share with the service account" step gets caught
    immediately instead of silently failing on the next intake."""
    service = _get_service()
    service.spreadsheets().values().get(
        spreadsheetId=sheet_id, range=_sheet_range("A1")
    ).execute()


def find_next_unclaimed_case(sheet_id):
    """
    Returns (row_number, case_number) for the first reserved-but-unclaimed
    row, or (None, None) if none found. row_number is 1-indexed to match
    the sheet's own row numbers (so "row 365" means exactly that).
    """
    service = _get_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=_sheet_range("A:E"))
        .execute()
    )
    values = result.get("values", [])

    for i, row in enumerate(values):
        row_num = i + 1
        if row_num == 1:
            continue  # header row
        col_a = row[0] if len(row) > 0 else ""
        col_b = row[1] if len(row) > 1 else ""
        col_d = row[3] if len(row) > 3 else ""
        col_e = row[4] if len(row) > 4 else ""
        if col_a.strip() and not col_b.strip() and not col_d.strip() and not col_e.strip():
            return row_num, col_a.strip()

    return None, None


def read_rows(sheet_id):
    """Returns (row_num, [A, B, C, ... N]) for every row that has a case
    number in column A -- used by the manual-entry sync to find rows
    staff typed straight into the sheet (name, date, funeral home,
    disposition, night, etc.) instead of going through the app. Reads
    through column N (the case link) in the same request so the sync
    can tell which rows already have a link without a separate API call
    per row -- checking hundreds of rows one-by-one was slow enough to
    time out client-side. Each row is padded out to 14 columns so index
    access is always safe even when trailing cells are blank."""
    service = _get_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=_sheet_range("A:N"))
        .execute()
    )
    values = result.get("values", [])
    rows = []
    for i, row in enumerate(values):
        row_num = i + 1
        if row_num == 1:
            continue  # header row
        col_a = row[0] if len(row) > 0 else ""
        if col_a.strip():
            padded = row + [""] * (14 - len(row))
            rows.append((row_num, padded[:14]))
    return rows


def backfill_intake(sheet_id, row_num, date_str, name, funeral_home):
    """Writes date/name/funeral home into columns B, D, E for a given row."""
    service = _get_service()
    body = {
        "valueInputOption": "USER_ENTERED",
        "data": [
            {"range": _sheet_range(f"B{row_num}"), "values": [[date_str]]},
            {"range": _sheet_range(f"D{row_num}"), "values": [[name]]},
            {"range": _sheet_range(f"E{row_num}"), "values": [[funeral_home]]},
        ],
    }
    service.spreadsheets().values().batchUpdate(
        spreadsheetId=sheet_id, body=body
    ).execute()


def backfill_removal_details(sheet_id, row_num, time_received, removal_type, disposition, removal_by, night):
    """Writes time received/removal type/disposition/removal by/night into
    columns C, F, G, H, I for a given row."""
    service = _get_service()
    body = {
        "valueInputOption": "USER_ENTERED",
        "data": [
            {"range": _sheet_range(f"C{row_num}"), "values": [[time_received]]},
            {"range": _sheet_range(f"F{row_num}"), "values": [[removal_type]]},
            {"range": _sheet_range(f"G{row_num}"), "values": [[disposition]]},
            {"range": _sheet_range(f"H{row_num}"), "values": [[removal_by]]},
            {"range": _sheet_range(f"I{row_num}"), "values": [[night]]},
        ],
    }
    service.spreadsheets().values().batchUpdate(
        spreadsheetId=sheet_id, body=body
    ).execute()


def backfill_location(sheet_id, row_num, location_text):
    """Writes the cooler + shelf/slot location into column L for a given row."""
    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=_sheet_range(f"L{row_num}"),
        valueInputOption="USER_ENTERED",
        body={"values": [[location_text]]},
    ).execute()


def find_row_for_case(sheet_id, case_number):
    """Looks up which row a given case number is on (needed before writing
    to column L, since we only know the case number at that point, not the
    row). Returns row_number or None."""
    service = _get_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=_sheet_range("A:A"))
        .execute()
    )
    values = result.get("values", [])
    for i, row in enumerate(values):
        if row and row[0].strip() == case_number.strip():
            return i + 1
    return None


def row_has_case_link(sheet_id, row_num):
    """True if column N already has anything in it for this row -- lets
    the caller skip re-writing it on every re-save."""
    service = _get_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=_sheet_range(f"N{row_num}"))
        .execute()
    )
    values = result.get("values", [])
    return bool(values and values[0] and str(values[0][0]).strip())


def backfill_case_link(sheet_id, row_num, case_url):
    """Writes a clickable link to the case's page (QR + info) into
    column N."""
    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=_sheet_range(f"N{row_num}"),
        valueInputOption="USER_ENTERED",
        body={"values": [[case_url]]},
    ).execute()


def _tab_properties(sheet_id):
    """Resolves config.GOOGLE_SHEET_TAB (or the first/only tab, if unset)
    to its full properties dict -- cell-formatting and grid-resize
    requests (unlike the values API used everywhere else in this file)
    address a sheet by numeric sheetId rather than by tab name, and need
    to know its current grid size too."""
    service = _get_service()
    meta = service.spreadsheets().get(
        spreadsheetId=sheet_id, fields="sheets.properties(sheetId,title,gridProperties)"
    ).execute()
    sheets = meta.get("sheets", [])
    tab = config.GOOGLE_SHEET_TAB
    if tab:
        for s in sheets:
            if s["properties"]["title"] == tab:
                return s["properties"]
    return sheets[0]["properties"]


def _tab_grid_id(sheet_id):
    """Just the numeric sheetId -- see _tab_properties()."""
    return _tab_properties(sheet_id)["sheetId"]


# Sheets rejects writes past a tab's current grid boundary outright
# (HttpError 400 "exceeds grid limits") rather than auto-expanding it --
# some monthly sheets get created narrower than this file's column
# layout eventually needs (see module docstring), so anything writing
# past column O should widen the grid first. Checked once per sheet per
# process lifetime rather than before every single write.
_grid_width_confirmed = set()


def _ensure_grid_width(sheet_id, needed_columns):
    if sheet_id in _grid_width_confirmed:
        return
    service = _get_service()
    props = _tab_properties(sheet_id)
    current_width = props.get("gridProperties", {}).get("columnCount", 0)
    if current_width < needed_columns:
        service.spreadsheets().batchUpdate(
            spreadsheetId=sheet_id,
            body={
                "requests": [
                    {
                        "updateSheetProperties": {
                            "properties": {
                                "sheetId": props["sheetId"],
                                "gridProperties": {"columnCount": needed_columns},
                            },
                            "fields": "gridProperties.columnCount",
                        }
                    }
                ]
            },
        ).execute()
    _grid_width_confirmed.add(sheet_id)


def set_case_link_dead(sheet_id, row_num):
    """Turns column N's case link red once a decedent is released or
    cremated -- a quick visual cue, from the sheet alone, that they're
    no longer in our care, without having to click through to check."""
    service = _get_service()
    grid_id = _tab_grid_id(sheet_id)
    body = {
        "requests": [
            {
                "repeatCell": {
                    "range": {
                        "sheetId": grid_id,
                        "startRowIndex": row_num - 1,
                        "endRowIndex": row_num,
                        "startColumnIndex": 13,  # column N
                        "endColumnIndex": 14,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {"foregroundColor": {"red": 0.71, "green": 0.11, "blue": 0.11}}
                        }
                    },
                    "fields": "userEnteredFormat.textFormat.foregroundColor",
                }
            }
        ]
    }
    service.spreadsheets().batchUpdate(spreadsheetId=sheet_id, body=body).execute()


def row_has_inventory_flag(sheet_id, row_num):
    """True only if column O (the sheet's real INVENTORY column) is
    already showing "Yes" for this row -- lets the caller skip
    re-writing it on every subsequent inventory item. A "NO PROPERTY"
    cell (see backfill_inventory_status) does NOT count as already
    flagged -- that still needs to flip to "Yes" the first time an item
    actually gets added."""
    service = _get_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=_sheet_range(f"O{row_num}"))
        .execute()
    )
    values = result.get("values", [])
    return bool(values and values[0] and str(values[0][0]).strip().lower() == "yes")


def backfill_inventory_status(sheet_id, row_num, has_inventory, view_url, add_url):
    """Writes column O's (the sheet's real INVENTORY column -- NOT Q,
    which is a free-text Notes column staff use for their own
    purposes) inventory-status link: "Yes" (linked to the case page)
    once at least one inventory item has been logged for the case,
    otherwise "NO PROPERTY" (linked straight to the scan app's
    Inventory panel for this case, so staff can add one directly from
    the sheet). Always writes an explicit value rather than leaving the
    cell blank while inventory is empty -- a blank cell sitting under an
    already-"Yes" column is exactly what invites Google Sheets' own
    "fill down" autocomplete suggestion to silently copy the wrong row's
    link into it (see app.py's admin repair action for cleaning up rows
    that already got hit by that)."""
    _ensure_grid_width(sheet_id, 20)
    service = _get_service()
    if has_inventory:
        formula = f'=HYPERLINK("{view_url}", "Yes")'
    else:
        formula = f'=HYPERLINK("{add_url}", "NO PROPERTY")'
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=_sheet_range(f"O{row_num}"),
        valueInputOption="USER_ENTERED",
        body={"values": [[formula]]},
    ).execute()


def backfill_cremation(sheet_id, row_num, timestamp_str, disk_number=None):
    """Writes "Cremated" into column M (Final Disposition -- otherwise
    filled in manually by staff, this is the one case where the app
    writes to it), the cremation date/time into column J, and the
    cremation disk number (if given) into column K."""
    service = _get_service()
    data = [
        {"range": _sheet_range(f"M{row_num}"), "values": [["Cremated"]]},
        {"range": _sheet_range(f"J{row_num}"), "values": [[timestamp_str]]},
    ]
    if disk_number:
        data.append({"range": _sheet_range(f"K{row_num}"), "values": [[disk_number]]})
    body = {"valueInputOption": "USER_ENTERED", "data": data}
    service.spreadsheets().values().batchUpdate(
        spreadsheetId=sheet_id, body=body
    ).execute()


def backfill_released_to(sheet_id, row_num, released_to):
    """Writes who/where a decedent was released to into column M (Final
    Disposition, as "Released to <X>") -- a normal release is itself a
    final disposition, same as a cremation is. Used to also duplicate
    this into column O, but that's the real sheet's INVENTORY column
    (see backfill_inventory_status), not a spare -- M alone already
    captures who it was released to in readable form."""
    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=_sheet_range(f"M{row_num}"),
        valueInputOption="USER_ENTERED",
        body={"values": [[f"Released to {released_to}"]]},
    ).execute()


def set_case_checked_out_color(sheet_id, row_num, checked_out):
    """Colors column D's (decedent name) font orange while a decedent is
    temporarily checked out (autopsy, organ/tissue donation, etc.),
    clearing it back to the default black once checked back in.
    Replaces the old column P text summary (used to be
    backfill_checkout) -- checkout is infrequent enough that a color
    cue on the name itself is plenty, and it frees column P for
    Documents status instead (see backfill_documents_status)."""
    service = _get_service()
    grid_id = _tab_grid_id(sheet_id)
    color = {"red": 0.90, "green": 0.49, "blue": 0.13} if checked_out else {"red": 0, "green": 0, "blue": 0}
    body = {
        "requests": [
            {
                "repeatCell": {
                    "range": {
                        "sheetId": grid_id,
                        "startRowIndex": row_num - 1,
                        "endRowIndex": row_num,
                        "startColumnIndex": 3,  # column D
                        "endColumnIndex": 4,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {"foregroundColor": color}
                        }
                    },
                    "fields": "userEnteredFormat.textFormat.foregroundColor",
                }
            }
        ]
    }
    service.spreadsheets().batchUpdate(spreadsheetId=sheet_id, body=body).execute()


def row_has_documents_flag(sheet_id, row_num):
    """True only if column P (Documents) is already showing "Yes" for
    this row -- mirrors row_has_inventory_flag."""
    service = _get_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=_sheet_range(f"P{row_num}"))
        .execute()
    )
    values = result.get("values", [])
    return bool(values and values[0] and str(values[0][0]).strip().lower() == "yes")


def backfill_documents_status(sheet_id, row_num, has_documents, view_url, add_url):
    """Writes column P's (Documents) status link -- "Yes" (linked to
    the case page) once at least one document has been scanned for the
    case, otherwise "NO DOCUMENTS" (linked straight to the scan app's
    Scan Document panel for this case). Mirrors
    backfill_inventory_status -- see that for why this always writes
    an explicit value rather than ever leaving the cell blank."""
    _ensure_grid_width(sheet_id, 20)
    service = _get_service()
    if has_documents:
        formula = f'=HYPERLINK("{view_url}", "Yes")'
    else:
        formula = f'=HYPERLINK("{add_url}", "NO DOCUMENTS")'
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=_sheet_range(f"P{row_num}"),
        valueInputOption="USER_ENTERED",
        body={"values": [[formula]]},
    ).execute()


def ensure_column_headers(sheet_id):
    """Fills in row 1 (header) labels for O, P, and R if -- and only if
    -- that header cell is currently blank. Google Sheets shows a
    generic placeholder like "Column 16" in filter views/etc. whenever
    a header cell has no text of its own; the app never writes to row 1
    on its own (only data rows), so a brand-new or duplicated monthly
    sheet can end up with these three data columns unlabeled even
    though the app is writing correct data underneath. Never touches a
    header cell that already has real text in it, in case staff typed
    something different on purpose."""
    _ensure_grid_width(sheet_id, 20)
    service = _get_service()
    existing = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=_sheet_range("O1:R1"))
        .execute()
        .get("values", [[]])
    )
    row = existing[0] if existing else []
    row += [""] * (4 - len(row))  # O, P, Q, R
    labels = {"O1": "INVENTORY", "P1": "Documents", "R1": "Days in Storage"}
    updates = []
    for col, idx in (("O1", 0), ("P1", 1), ("R1", 3)):
        if not row[idx].strip():
            updates.append({"range": _sheet_range(col), "values": [[labels[col]]]})
    if updates:
        service.spreadsheets().values().batchUpdate(
            spreadsheetId=sheet_id,
            body={"valueInputOption": "USER_ENTERED", "data": updates},
        ).execute()
    return [u["range"] for u in updates]


def backfill_storage_days(sheet_id, row_num, start_date, end_date=None):
    """Writes column R (Days in Storage -- billable time in our care).
    start_date/end_date are datetime.date (or datetime) objects.

    While still in storage (end_date is None), writes a live formula
    -- =TODAY()-DATE(y,m,d) -- so it keeps counting up on its own every
    day the sheet is opened, no daily job needed on our end. Once
    released or cremated (end_date given), writes a fixed number
    instead so the count freezes there even if the sheet is reopened
    weeks later -- billing has already stopped by then. Checkout/
    check-in never call this -- the clock only starts at intake and
    stops at release/cremation, matching how billing actually works,
    so a temporary checkout doesn't pause or reset it."""
    _ensure_grid_width(sheet_id, 20)
    service = _get_service()
    start = start_date.date() if hasattr(start_date, "date") else start_date
    if end_date is None:
        # DATEDIF (not plain subtraction) so the cell reliably holds a
        # plain integer -- subtracting two dates directly sometimes gets
        # auto-formatted by Sheets as a date/duration instead of a number.
        value = f'=DATEDIF(DATE({start.year},{start.month},{start.day}), TODAY(), "D")'
    else:
        end = end_date.date() if hasattr(end_date, "date") else end_date
        value = (end - start).days
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=_sheet_range(f"R{row_num}"),
        valueInputOption="USER_ENTERED",
        body={"values": [[value]]},
    ).execute()
