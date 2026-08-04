"""
Google Sheets integration for the call log.

Column layout (matches your sheet):
    A = case number
    B = date
    D = decedent name
    E = funeral home
    L = cooler location + shelf/slot (written back after Assign/Move)
    M = link to the case's page (has a working QR on it, and a Print
        Tag link) -- NOT a picture in the cell. Google Drive service
        accounts have no storage quota of their own and there's no
        practical way around that on a free (non-Workspace) Google
        account, so the cell holds a clickable link instead. The
        armband tag itself still has a real, scannable QR code either
        way -- this column is just a convenience shortcut from the
        sheet.
    N = released to -- who/where the decedent was released to

"Next available case number" = the first row, scanning top to bottom,
where column A has a value but B, D, and E are all still empty. That's
what makes a row "reserved but unclaimed" rather than a completed
historical case.
"""
import config
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def _get_service():
    creds = service_account.Credentials.from_service_account_file(
        config.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds)


def _sheet_range(a1_range):
    tab = config.GOOGLE_SHEET_TAB
    return f"{tab}!{a1_range}" if tab else a1_range


def find_next_unclaimed_case():
    """
    Returns (row_number, case_number) for the first reserved-but-unclaimed
    row, or (None, None) if none found. row_number is 1-indexed to match
    the sheet's own row numbers (so "row 365" means exactly that).
    """
    service = _get_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=config.GOOGLE_SHEET_ID, range=_sheet_range("A:E"))
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


def backfill_intake(row_num, date_str, name, funeral_home):
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
        spreadsheetId=config.GOOGLE_SHEET_ID, body=body
    ).execute()


def backfill_location(row_num, location_text):
    """Writes the cooler + shelf/slot location into column L for a given row."""
    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=_sheet_range(f"L{row_num}"),
        valueInputOption="USER_ENTERED",
        body={"values": [[location_text]]},
    ).execute()


def find_row_for_case(case_number):
    """Looks up which row a given case number is on (needed before writing
    to column L, since we only know the case number at that point, not the
    row). Returns row_number or None."""
    service = _get_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=config.GOOGLE_SHEET_ID, range=_sheet_range("A:A"))
        .execute()
    )
    values = result.get("values", [])
    for i, row in enumerate(values):
        if row and row[0].strip() == case_number.strip():
            return i + 1
    return None


def row_has_case_link(row_num):
    """True if column M already has anything in it for this row -- lets
    the caller skip re-writing it on every re-save."""
    service = _get_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=config.GOOGLE_SHEET_ID, range=_sheet_range(f"M{row_num}"))
        .execute()
    )
    values = result.get("values", [])
    return bool(values and values[0] and str(values[0][0]).strip())


def backfill_case_link(row_num, case_url):
    """Writes a clickable link to the case's page (QR + info) into
    column M."""
    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=_sheet_range(f"M{row_num}"),
        valueInputOption="USER_ENTERED",
        body={"values": [[case_url]]},
    ).execute()


def backfill_released_to(row_num, released_to):
    """Writes who/where a decedent was released to into column N."""
    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=_sheet_range(f"N{row_num}"),
        valueInputOption="USER_ENTERED",
        body={"values": [[released_to]]},
    ).execute()
