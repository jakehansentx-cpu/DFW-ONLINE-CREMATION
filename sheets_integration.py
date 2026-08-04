"""
Google Sheets integration for the call log.

Column layout (matches your sheet):
    A = case number
    B = date
    D = decedent name
    E = funeral home
    L = cooler location + shelf/slot (written back after Assign/Move)
    M = QR code image (uploaded to Drive, shown inline via =IMAGE())
    N = released to -- who/where the decedent was released to

"Next available case number" = the first row, scanning top to bottom,
where column A has a value but B, D, and E are all still empty. That's
what makes a row "reserved but unclaimed" rather than a completed
historical case.
"""
import io

import config
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

# drive.file: the service account can only see/manage files IT creates,
# not your whole Drive -- the minimum scope needed to upload QR images.
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]


def _get_credentials():
    return service_account.Credentials.from_service_account_file(
        config.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )


def _get_service():
    return build("sheets", "v4", credentials=_get_credentials())


def _get_drive_service():
    return build("drive", "v3", credentials=_get_credentials())


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


def row_has_qr(row_num):
    """True if column M already has anything in it for this row -- lets
    the caller skip re-uploading a QR image to Drive on every re-save."""
    service = _get_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=config.GOOGLE_SHEET_ID, range=_sheet_range(f"M{row_num}"))
        .execute()
    )
    values = result.get("values", [])
    return bool(values and values[0] and str(values[0][0]).strip())


def upload_qr_to_drive(case_code, png_bytes):
    """
    Uploads a case's QR image to Drive (via the service account) and
    makes it link-viewable, so Google Sheets' own =IMAGE() renderer --
    which fetches from Google's servers, not the funeral home's LAN --
    can actually load it. The image only encodes a URL to a
    passcode-gated case page; it doesn't show the decedent's name or
    other details by itself. Returns a direct-view URL for that file.
    """
    drive = _get_drive_service()
    media = MediaIoBaseUpload(io.BytesIO(png_bytes), mimetype="image/png", resumable=False)
    file = (
        drive.files()
        .create(
            body={
                "name": f"case-qr-{case_code}.png",
                "parents": [config.GOOGLE_DRIVE_QR_FOLDER_ID],
            },
            media_body=media,
            fields="id",
        )
        .execute()
    )
    file_id = file["id"]
    drive.permissions().create(
        fileId=file_id, body={"role": "reader", "type": "anyone"}
    ).execute()
    return f"https://drive.google.com/uc?export=view&id={file_id}"


def backfill_qr(row_num, drive_url):
    """Writes an =IMAGE() formula into column M so the QR shows up
    directly in the cell, not just as a link."""
    service = _get_service()
    formula = f'=IMAGE("{drive_url}")'
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=_sheet_range(f"M{row_num}"),
        valueInputOption="USER_ENTERED",
        body={"values": [[formula]]},
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
