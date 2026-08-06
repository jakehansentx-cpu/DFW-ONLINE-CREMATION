"""
Cooler Tracking Whiteboard
---------------------------
Fully local Flask + SQLite app. No internet calls anywhere in this code.
Run it on any machine on your local network (Raspberry Pi, mini PC, old
laptop). Point the TV-side browser at /board and the tablet at /scan.

    pip install -r requirements.txt
    python app.py
    # then on the LAN:
    #   TV / mirrored tablet browser -> http://<this-machine-ip>:5000/board
    #   Tablet input browser         -> http://<this-machine-ip>:5000/scan
"""
import csv
import io
import sqlite3
import secrets
from datetime import datetime
from functools import wraps
from pathlib import Path
from flask import Flask, g, jsonify, render_template, request, session, redirect, url_for

import qrcode
from PIL import Image, ImageDraw, ImageFont

import config

app = Flask(__name__)
DB_PATH = "cooler.db"
INVENTORY_PHOTOS_PATH = Path(config.INVENTORY_PHOTOS_DIR)
INVENTORY_PHOTOS_PATH.mkdir(exist_ok=True)


def _sheets():
    """Lazy import so the app still runs fine before Sheets is set up."""
    import sheets_integration
    return sheets_integration

# Persist the session signing key across restarts so people don't get
# logged out every time the server restarts (e.g. after a reboot).
SECRET_KEY_PATH = Path("secret_key.txt")
if SECRET_KEY_PATH.exists():
    app.secret_key = SECRET_KEY_PATH.read_text().strip()
else:
    key = secrets.token_hex(32)
    SECRET_KEY_PATH.write_text(key)
    app.secret_key = key
app.config["SESSION_COOKIE_SECURE"] = False  # allow plain-http LAN use too
app.permanent_session_lifetime = 60 * 60 * 24 * 365  # ~1 year


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("authed"):
            if request.path.startswith("/api/"):
                return jsonify(error="Not logged in. Reload the page and enter the passcode."), 401
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        if request.form.get("passcode") == config.ACCESS_PASSCODE:
            session.permanent = True
            session["authed"] = True
            return redirect(request.args.get("next") or url_for("board_page"))
        error = "Wrong passcode."
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ---------------------------------------------------------------- database --
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def _ensure_column(db, table, column, coltype):
    """Add a column to an existing table if it's not already there --
    lets a live cooler.db with real placement history pick up new
    fields (like the "screen" grouping or released_to) without ever
    needing to be deleted and reseeded."""
    existing = {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")


def get_setting(db, key, default=None):
    row = db.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row is not None and row["value"] is not None else default


def set_setting(db, key, value):
    db.execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def current_sheet_id(db):
    """The spreadsheet new intakes should be pulled from/written to --
    NOT necessarily the right sheet for an already-existing case (see
    case_sheet_id below), since last month's cases still live on last
    month's sheet even after this month's becomes current."""
    return get_setting(db, "current_sheet_id", config.GOOGLE_SHEET_ID)


def case_sheet_id(db, case_row):
    """The specific spreadsheet a given case actually lives on, set once
    at intake and never changed afterward -- this is what every
    Move/Release/Cremate/Checkout sheet write should target, so a case
    started last month keeps syncing to last month's sheet even after
    this month's sheet becomes current for new intakes."""
    return case_row["sheet_id"] or current_sheet_id(db)


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            cooler_name TEXT NOT NULL,
            cooler_code TEXT NOT NULL,
            shelf INTEGER NOT NULL,
            slot TEXT,  -- NULL means this shelf has no A/B letter
            shared INTEGER NOT NULL DEFAULT 0,  -- 1 = allows multiple occupants
            screen TEXT  -- which /board tab this location's cooler shows under
        );

        CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY,
            case_code TEXT UNIQUE NOT NULL,
            name TEXT,
            funeral_home TEXT,
            pickup_date TEXT,
            status TEXT NOT NULL DEFAULT 'pending_info',
                -- pending_info -> pending_location -> placed -> released
                -- placed <-> checked_out (temporary custody transfer --
                -- autopsy, organ/tissue donation -- QR stays active)
            location_id INTEGER REFERENCES locations(id),
            created_at TEXT NOT NULL,
            released_at TEXT,
            released_to TEXT,  -- who/where a released decedent went
            checkout_org TEXT,  -- who a checked-out decedent is currently with
            checkout_reason TEXT,  -- Autopsy / Organ Donation / Tissue Donation / Other
            checked_out_at TEXT
        );

        CREATE TABLE IF NOT EXISTS moves (
            id INTEGER PRIMARY KEY,
            case_id INTEGER NOT NULL REFERENCES cases(id),
            from_location_id INTEGER REFERENCES locations(id),
            to_location_id INTEGER REFERENCES locations(id),
            action TEXT NOT NULL, -- placed / moved / released / checked_out / checked_in
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_log (
            client_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tag_aliases (
            placeholder_code TEXT UNIQUE NOT NULL,
            real_case_code TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS case_events (
            id INTEGER PRIMARY KEY,
            case_id INTEGER NOT NULL REFERENCES cases(id),
            flag TEXT NOT NULL,     -- e.g. "Prepped", "Witness Cremation" -- see config.CASE_FLAGS
            value INTEGER NOT NULL, -- 1 = Yes, 0 = No
            timestamp TEXT NOT NULL,
            staff TEXT
        );

        CREATE TABLE IF NOT EXISTS inventory_items (
            id INTEGER PRIMARY KEY,
            case_id INTEGER NOT NULL REFERENCES cases(id),
            description TEXT,
            photo_filename TEXT,  -- filename under config.INVENTORY_PHOTOS_DIR, or NULL
            created_at TEXT NOT NULL,
            staff TEXT
        );
        """
    )
    # Migrate DBs created before these columns existed.
    _ensure_column(db, "locations", "screen", "TEXT")
    _ensure_column(db, "cases", "released_to", "TEXT")
    _ensure_column(db, "cases", "checkout_org", "TEXT")
    _ensure_column(db, "cases", "checkout_reason", "TEXT")
    _ensure_column(db, "cases", "checked_out_at", "TEXT")
    _ensure_column(db, "locations", "cooler_order", "INTEGER DEFAULT 0")
    _ensure_column(db, "cases", "time_received", "TEXT")
    _ensure_column(db, "cases", "removal_type", "TEXT")
    _ensure_column(db, "cases", "disposition", "TEXT")
    _ensure_column(db, "cases", "removal_by", "TEXT")
    _ensure_column(db, "cases", "night", "TEXT")
    _ensure_column(db, "moves", "staff", "TEXT")
    _ensure_column(db, "cases", "release_signed_name", "TEXT")
    _ensure_column(db, "cases", "release_signature", "TEXT")
    _ensure_column(db, "cases", "disk_number", "TEXT")
    _ensure_column(db, "moves", "disk_number", "TEXT")
    _ensure_column(db, "cases", "sheet_id", "TEXT")
    db.commit()

    # Every case created before the monthly-sheet feature existed really
    # was created against the one sheet config.py used to hardcode --
    # backfill that explicitly rather than leaving it NULL, so old cases
    # keep resolving to the sheet they actually live in.
    db.execute(
        "UPDATE cases SET sheet_id = ? WHERE sheet_id IS NULL",
        (config.GOOGLE_SHEET_ID,),
    )
    # Likewise, treat that same hardcoded sheet as "this month's sheet"
    # the first time this runs, seeded to the CURRENT month so upgrading
    # doesn't immediately nag for a new one -- only once an actual new
    # month rolls around will it ask.
    existing_sheet = db.execute(
        "SELECT value FROM app_settings WHERE key = 'current_sheet_id'"
    ).fetchone()
    if existing_sheet is None:
        db.execute(
            "INSERT INTO app_settings (key, value) VALUES ('current_sheet_id', ?)",
            (config.GOOGLE_SHEET_ID,),
        )
        db.execute(
            "INSERT INTO app_settings (key, value) VALUES ('current_sheet_month', ?)",
            (datetime.now().strftime("%Y-%m"),),
        )
    db.commit()

    # Ensure every location in config.py exists in the DB, WITHOUT ever
    # touching rows that are already there -- a live system's placement
    # history depends on those rows' ids staying put. This means adding a
    # new cooler (like Cremation Staging) to config.py just adds the new
    # rows in place on the next restart; nothing gets wiped or reseeded.
    added = 0
    for order, cooler in enumerate(config.COOLERS):
        shared = 1 if cooler.get("shared") else 0
        screen = cooler.get("screen") or cooler["name"]
        db.execute(
            "UPDATE locations SET cooler_name = ?, shared = ?, screen = ?, cooler_order = ? WHERE cooler_code = ?",
            (cooler["name"], shared, screen, order, cooler["code"]),
        )
        for shelf_num, slots in cooler["shelves"]:
            for slot in slots:
                code = (
                    f"LOC|{cooler['code']}|S{shelf_num:02d}|{slot}"
                    if slot
                    else f"LOC|{cooler['code']}|S{shelf_num:02d}"
                )
                exists = db.execute("SELECT 1 FROM locations WHERE code = ?", (code,)).fetchone()
                if exists is None:
                    db.execute(
                        """INSERT INTO locations
                           (code, cooler_name, cooler_code, shelf, slot, shared, screen, cooler_order)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (code, cooler["name"], cooler["code"], shelf_num, slot, shared, screen, order),
                    )
                    added += 1
    db.commit()
    if added:
        print(f"Added {added} new location(s) from config.py.")
    db.close()


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def format_date_for_sheet(iso_date):
    """
    The date picker always sends YYYY-MM-DD internally. The sheet's
    existing dates read like 7/31/26 (no leading zeros) -- match that
    style for anything the app writes back, so it doesn't look out of
    place next to entries already there. Not using %-m/%-d since that
    flag doesn't work on Windows.
    """
    if not iso_date:
        return iso_date
    try:
        dt = datetime.strptime(iso_date, "%Y-%m-%d")
        return f"{dt.month}/{dt.day}/{dt.strftime('%y')}"
    except ValueError:
        return iso_date  # unexpected format -- write it through as-is rather than crash


def parse_date_from_sheet(sheet_date):
    """Best-effort inverse of format_date_for_sheet -- staff typing a
    date straight into the sheet (see the manual-entry sync) might write
    it as 8/6/26 or 8/06/2026 depending on habit, so try both rather than
    force one exact format. Returns None (not a crash) for anything that
    doesn't parse, since a messy date cell shouldn't block the rest of
    a sync."""
    text = (sheet_date or "").strip()
    if not text:
        return None
    for fmt in ("%m/%d/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _resolve_field_tag(db, case_code):
    """Resolves a pre-printed placeholder field tag (case codes starting
    with config.FIELD_TAG_PREFIX -- see gen_field_tags.py) to its real,
    sheet-issued case code, claiming one for it on first use if it hasn't
    been claimed yet. Any other case code is returned unchanged.

    Returns (resolved_code, error). error is None on success, or an
    (message, http_status) tuple when a claim was needed but couldn't be
    completed (e.g. the sheet is unreachable) -- resolved_code is None
    in that case."""
    alias = db.execute(
        "SELECT real_case_code FROM tag_aliases WHERE placeholder_code = ?", (case_code,)
    ).fetchone()
    if alias:
        return alias["real_case_code"], None

    if not case_code.startswith(config.FIELD_TAG_PREFIX):
        return case_code, None

    already_used_directly = db.execute(
        "SELECT 1 FROM cases WHERE case_code = ?", (case_code,)
    ).fetchone()
    if already_used_directly is not None:
        return case_code, None

    if not config.GOOGLE_SHEETS_ENABLED:
        return None, ("Can't claim a case number for a field tag -- Google Sheets is disabled", 503)
    try:
        _sheet_row, real_case_code = _sheets().find_next_unclaimed_case(current_sheet_id(db))
    except Exception as e:
        return None, (f"Could not reach the sheet to claim a case number: {e}", 503)
    if not real_case_code:
        return None, ("No unclaimed case numbers left in the sheet", 409)

    db.execute(
        "INSERT INTO tag_aliases (placeholder_code, real_case_code, created_at) VALUES (?, ?, ?)",
        (case_code, real_case_code, now()),
    )
    db.commit()
    return real_case_code, None


def get_case_with_location(db, case_code):
    """Case info plus its CURRENT shelf/slot via a live join -- never bakes
    a location into anything printed/cached, since a decedent can move
    after a tag is printed."""
    return db.execute(
        """
        SELECT c.*, l.cooler_name, l.shelf, l.slot
        FROM cases c
        LEFT JOIN locations l ON l.id = c.location_id
        WHERE c.case_code = ?
        """,
        (case_code,),
    ).fetchone()


def location_text(row):
    if row is None or row["location_id"] is None or row["status"] != "placed":
        return None
    return f"{row['cooler_name']} - Shelf {row['shelf']}{row['slot'] or ''}"


def _move_location_text(cooler, shelf, slot):
    if cooler is None:
        return None
    return f"{cooler} - Shelf {shelf}{slot or ''}"


def _format_when(timestamp):
    try:
        dt = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
        return f"{dt.month}/{dt.day}/{dt.year} {dt.strftime('%I:%M %p').lstrip('0')}"
    except ValueError:
        return timestamp


def get_case_history(db, case_id):
    """Full chronological chain of custody for a case -- every
    placed/moved/released/checked_out/checked_in action from the moves
    table, merged with every Prepped/Witness Cremation/ID Viewing/etc.
    status change logged in case_events (see config.CASE_FLAGS), so the
    History view is one combined timeline instead of two separate ones."""
    move_rows = db.execute(
        """
        SELECT m.action, m.timestamp, m.staff, m.disk_number,
               fl.cooler_name AS from_cooler, fl.shelf AS from_shelf, fl.slot AS from_slot,
               tl.cooler_name AS to_cooler, tl.shelf AS to_shelf, tl.slot AS to_slot
        FROM moves m
        LEFT JOIN locations fl ON fl.id = m.from_location_id
        LEFT JOIN locations tl ON tl.id = m.to_location_id
        WHERE m.case_id = ?
        ORDER BY m.timestamp ASC, m.id ASC
        """,
        (case_id,),
    ).fetchall()

    def _describe_released(m):
        from_text = _move_location_text(m["from_cooler"], m["from_shelf"], m["from_slot"])
        if m["disk_number"]:
            return f"Cremated from {from_text} — Disk #{m['disk_number']}"
        return f"Released from {from_text}"

    descriptions = {
        "placed": lambda m: f"Placed at {_move_location_text(m['to_cooler'], m['to_shelf'], m['to_slot'])}",
        "moved": lambda m: (
            f"Moved from {_move_location_text(m['from_cooler'], m['from_shelf'], m['from_slot'])} "
            f"to {_move_location_text(m['to_cooler'], m['to_shelf'], m['to_slot'])}"
        ),
        "released": _describe_released,
        "checked_out": lambda m: f"Checked out from {_move_location_text(m['from_cooler'], m['from_shelf'], m['from_slot'])}",
        "checked_in": lambda m: "Checked in",
    }

    entries = []
    for m in move_rows:
        describe = descriptions.get(m["action"])
        description = describe(m) if describe else m["action"]
        if m["staff"]:
            description += f" — {m['staff']}"
        entries.append((m["timestamp"], description))

    event_rows = db.execute(
        "SELECT flag, value, timestamp, staff FROM case_events WHERE case_id = ? ORDER BY id ASC",
        (case_id,),
    ).fetchall()
    for e in event_rows:
        description = f"{e['flag']}: {'Yes' if e['value'] else 'No'}"
        if e["staff"]:
            description += f" — {e['staff']}"
        entries.append((e["timestamp"], description))

    entries.sort(key=lambda entry: entry[0])
    return [{"when": _format_when(ts), "description": desc} for ts, desc in entries]


def get_case_flags(db, case_id):
    """Current Yes/No state of each configured decedent status flag
    (config.CASE_FLAGS), in config order -- a plain dict would work
    locally, but jsonify() sorts dict keys alphabetically by default,
    which would silently scramble the display order away from what
    config.py defines. A list preserves it. Value is whichever was
    logged most recently in case_events, or None if never set."""
    flags = []
    for flag in config.CASE_FLAGS:
        row = db.execute(
            "SELECT value FROM case_events WHERE case_id = ? AND flag = ? ORDER BY id DESC LIMIT 1",
            (case_id, flag),
        ).fetchone()
        flags.append({"flag": flag, "value": bool(row["value"]) if row is not None else None})
    return flags


def get_inventory_items(db, case_id):
    """Personal-effects inventory (jewelry, clothing, phone, paperwork,
    etc.) logged for a decedent -- oldest first, same order staff added
    them in."""
    rows = db.execute(
        "SELECT id, description, photo_filename, created_at, staff FROM inventory_items "
        "WHERE case_id = ? ORDER BY id ASC",
        (case_id,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "description": r["description"],
            "has_photo": bool(r["photo_filename"]),
            "when": _format_when(r["created_at"]),
            "staff": r["staff"],
        }
        for r in rows
    ]


def _stamp_inventory_caption(img, case_code, name):
    """Burns the case number (and decedent name, if known) into the
    bottom of an inventory photo -- so the photo is still self-
    identifying even if it ever leaves the app entirely (copied off the
    Pi, emailed, printed), not just tagged in the database. Shrinks the
    caption down (and drops the name first, then truncates it) rather
    than letting it overflow, for unusually long names/case codes."""
    draw = ImageDraw.Draw(img)
    font_size = max(16, img.width // 40)
    max_width = img.width - 16

    def build(with_name, chars):
        if with_name and name:
            trimmed = name if chars is None or len(name) <= chars else name[:chars].rstrip() + "..."
            return f"Case: {case_code}  —  {trimmed}"
        return f"Case: {case_code}"

    font = _load_font(True, font_size)
    caption = build(True, None)
    if draw.textbbox((0, 0), caption, font=font)[2] > max_width:
        # Try progressively shorter versions of the name before dropping
        # it entirely -- always keeping the case number intact, since
        # that's the one piece that must never be cut off.
        fit = None
        for chars in (40, 25, 15, 8):
            candidate = build(True, chars)
            if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
                fit = candidate
                break
        caption = fit or build(False, None)

    padding = 8
    text_bbox = draw.textbbox((0, 0), caption, font=font)
    bar_h = (text_bbox[3] - text_bbox[1]) + padding * 2
    draw.rectangle([0, img.height - bar_h, img.width, img.height], fill=(0, 0, 0))
    draw.text((padding, img.height - bar_h + padding - text_bbox[1]), caption, font=font, fill=(255, 255, 255))
    return img


def _save_inventory_photo(file_storage, case_code, name):
    """Resizes/re-encodes an uploaded inventory photo to a reasonable
    size before saving -- a raw phone camera photo can be several MB,
    which adds up fast across many items on a Pi's limited storage.
    Always re-encoded as JPEG under a random filename (never the
    original name/extension), which also strips EXIF metadata and
    sidesteps format quirks (HEIC, odd orientation, etc). Returns the
    saved filename, or None (with an error message) if the upload
    couldn't be read as an image at all."""
    try:
        img = Image.open(file_storage.stream)
        img = img.convert("RGB")
    except Exception:
        return None, "That doesn't look like a photo the app can read -- try again."

    img.thumbnail((1600, 1600))
    img = _stamp_inventory_caption(img, case_code, name)
    filename = f"{secrets.token_hex(12)}.jpg"
    img.save(INVENTORY_PHOTOS_PATH / filename, format="JPEG", quality=82)
    return filename, None


def generate_qr_png(data):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _load_font(bold, size):
    """Tries common system font locations (Windows/Mac/Linux) before
    falling back to Pillow's own built-in font, so label generation
    never crashes just because a particular font file isn't installed."""
    names = (
        ["arialbd.ttf", "Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "DejaVuSans-Bold.ttf"]
        if bold
        else ["arial.ttf", "Arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf", "DejaVuSans.ttf"]
    )
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def generate_label_image(case_code, name, funeral_home, pickup_date, target_url):
    """
    Composites the full armband tag -- QR on the left, name/funeral
    home/date stacked on the right -- into a single flat PNG at 300dpi,
    matching the printable page's layout exactly. Meant for label
    printers/apps that expect a plain image rather than a browser print
    dialog.
    """
    dpi = 300
    width, height = round(3.2 * dpi), round(1.1 * dpi)
    margin = round(0.1 * dpi)
    qr_size = height - 2 * margin

    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    draw.rectangle([(0, 0), (width - 1, height - 1)], outline=(102, 102, 119), width=2)

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(target_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    qr_img = qr_img.resize((qr_size, qr_size))
    img.paste(qr_img, (margin, margin))

    line_x = margin + qr_size + round(0.07 * dpi)
    draw.line([(line_x, margin), (line_x, height - margin)], fill=(228, 225, 217), width=2)

    text_x = line_x + round(0.14 * dpi)
    draw.text(
        (text_x, round(0.16 * dpi)), name or case_code, font=_load_font(True, 46), fill=(20, 21, 26)
    )
    draw.text(
        (text_x, round(0.48 * dpi)), funeral_home or "", font=_load_font(False, 30), fill=(51, 54, 61)
    )
    draw.text(
        (text_x, round(0.74 * dpi)), pickup_date or "", font=_load_font(False, 26), fill=(74, 77, 84)
    )

    buf = io.BytesIO()
    img.save(buf, format="PNG", dpi=(dpi, dpi))
    return buf.getvalue()


# ------------------------------------------------------------------- pages --
@app.route("/")
@login_required
def index():
    return render_template("board.html", screens=config.BOARD_SCREENS, staff_names=config.STAFF_NAMES)


@app.route("/board")
@login_required
def board_page():
    return render_template("board.html", screens=config.BOARD_SCREENS, staff_names=config.STAFF_NAMES)


@app.route("/scan")
@login_required
def scan_page():
    return render_template("scan.html", staff_names=config.STAFF_NAMES)


def expected_sheet_name(dt):
    """The exact spreadsheet name the app looks for when trying to
    auto-adopt a new monthly sheet -- MUST match the naming the Apps
    Script (apps_script/monthly_sheet_rollover.gs) uses when it creates
    one, e.g. "SEPTEMBER 2026 CALL LOG"."""
    return f"{dt.strftime('%B').upper()} {dt.year} CALL LOG"


def _adopt_sheet(db, sheet_id, label):
    set_setting(db, "current_sheet_id", sheet_id)
    set_setting(db, "current_sheet_label", label)
    set_setting(db, "current_sheet_month", datetime.now().strftime("%Y-%m"))
    db.commit()


@app.route("/api/settings/sheet-status")
@login_required
def api_sheet_status():
    """Whether it's time to nag for a new monthly spreadsheet -- compares
    the real calendar month against the month the current sheet was set
    for. Only pulling a NEW case number (Decedent Information / sheet
    intake) actually needs this; every other action keeps working fine
    off whichever sheet each existing case already remembers.

    Before falling back to the manual "paste a link" prompt, this first
    checks whether a new sheet has already been auto-created and shared
    with the service account (see apps_script/monthly_sheet_rollover.gs)
    and, if so, adopts it automatically -- no staff action needed most
    months. The manual panel is still there as a fallback in case that
    automation didn't run or the share step failed for some reason.
    """
    db = get_db()
    real_month = datetime.now().strftime("%Y-%m")
    stored_month = get_setting(db, "current_sheet_month")
    needs_new_sheet = stored_month != real_month
    auto_adopted_label = None

    if needs_new_sheet and config.GOOGLE_SHEETS_ENABLED:
        try:
            expected_name = expected_sheet_name(datetime.now())
            found_id = _sheets().find_shared_sheet_by_name(expected_name)
            if found_id:
                _sheets().verify_access(found_id)
                _adopt_sheet(db, found_id, expected_name.title())
                needs_new_sheet = False
                auto_adopted_label = expected_name.title()
        except Exception:
            pass  # Drive lookup hiccup -- the manual panel still covers this

    return jsonify(
        needs_new_sheet=needs_new_sheet,
        current_sheet_id=current_sheet_id(db),
        current_sheet_label=get_setting(db, "current_sheet_label"),
        current_month=real_month,
        auto_adopted_label=auto_adopted_label,
    )


@app.route("/api/settings/sheet", methods=["POST"])
@login_required
def api_set_sheet():
    """Points new intakes at a newly-generated monthly spreadsheet. Cases
    already created against a previous sheet are unaffected -- they keep
    resolving to whatever sheet_id they were stamped with at intake."""
    if not config.GOOGLE_SHEETS_ENABLED:
        return jsonify(error="Google Sheets isn't turned on yet (see config.py)"), 400

    data = request.get_json(force=True)
    url = (data.get("url") or "").strip()
    sheet_id = _sheets().extract_sheet_id(url)
    if not sheet_id:
        return jsonify(error="That doesn't look like a Google Sheets link -- paste the full URL from your browser's address bar."), 400

    try:
        _sheets().verify_access(sheet_id)
    except Exception as e:
        email = _sheets().service_account_email() or "the service account"
        return jsonify(
            error=f"Couldn't open that sheet ({e}). Make sure it's shared with {email}."
        ), 400

    db = get_db()
    label = datetime.now().strftime("%B %Y")
    _adopt_sheet(db, sheet_id, label)
    return jsonify(ok=True, sheet_id=sheet_id, label=label)


@app.route("/api/sheet-sync", methods=["POST"])
@login_required
def api_sheet_sync():
    """
    Picks up decedents staff typed straight into the spreadsheet instead
    of going through the app. Some staff prefer entering name/date/
    funeral home/disposition/night directly in the sheet rather than
    using the scan station -- that's fine, but a case only gets a local
    record (and therefore an armband tag/QR and board tracking) once the
    app knows about it. This scans the current sheet for rows that have
    a case number AND look filled-in, but have no matching local case
    yet, creates one for each, and writes the case link back to column N
    so it behaves exactly like an app-driven intake from here on. Safe
    to run repeatedly -- already-tracked rows are skipped every time.
    """
    if not config.GOOGLE_SHEETS_ENABLED:
        return jsonify(error="Google Sheets isn't turned on yet (see config.py)"), 400

    db = get_db()
    sid = current_sheet_id(db)
    try:
        rows = _sheets().read_rows(sid)
    except Exception as e:
        return jsonify(error=f"Couldn't reach the spreadsheet: {e}"), 502

    synced = []
    for row_num, cols in rows:
        case_code = cols[0].strip()
        date_str, time_received, name, funeral_home, removal_type, disposition, removal_by, night = (
            cols[1].strip(), cols[2].strip(), cols[3].strip(), cols[4].strip(),
            cols[5].strip(), cols[6].strip(), cols[7].strip(), cols[8].strip(),
        )
        if not name and not funeral_home and not date_str:
            continue  # still genuinely unclaimed -- normal intake already handles this case

        existing = db.execute("SELECT 1 FROM cases WHERE case_code = ?", (case_code,)).fetchone()
        if existing is not None:
            continue  # already tracked locally, whether via the app or an earlier sync

        pickup_date = parse_date_from_sheet(date_str)
        db.execute(
            """INSERT INTO cases
               (case_code, name, funeral_home, pickup_date, status, created_at, sheet_id,
                time_received, removal_type, disposition, removal_by, night)
               VALUES (?, ?, ?, ?, 'pending_location', ?, ?, ?, ?, ?, ?, ?)""",
            (
                case_code, name or None, funeral_home or None, pickup_date, now(), sid,
                time_received or None, removal_type or None, disposition or None,
                removal_by or None, night or None,
            ),
        )
        db.commit()

        try:
            if not _sheets().row_has_case_link(sid, row_num):
                target_url = request.host_url.rstrip("/") + url_for("case_detail_page", case_code=case_code)
                _sheets().backfill_case_link(sid, row_num, target_url)
        except Exception:
            pass  # the local record is what matters -- the sheet link is a convenience shortcut

        synced.append({"case_code": case_code, "name": name or None})

    return jsonify(ok=True, synced=synced)


@app.route("/case/<case_code>")
@login_required
def case_detail_page(case_code):
    """
    What a printed armband QR code opens to -- any phone's default camera
    app can scan it straight into this page (after the usual passcode
    gate). Shows name, funeral home, pickup date, and the CURRENT
    shelf/slot, looked up live so it's never stale if the decedent moves.

    Once released/cremated, the tag is treated as deactivated: instead
    of ongoing operational details, scanning it just confirms the case
    is closed -- so a tag that ends up somewhere it shouldn't (or gets
    scanned after the fact) doesn't keep exposing live case info.
    """
    db = get_db()
    # A placeholder field tag opened directly (e.g. a random phone's camera
    # app, not the scan station) claims a real case number the same way
    # scanning it at the scan station would. If the claim can't complete
    # right now (e.g. no signal to the sheet), fall back to the raw code --
    # worst case this just shows as "not found" until it's tried again.
    resolved_code, err = _resolve_field_tag(db, case_code)
    if not err:
        case_code = resolved_code
    row = get_case_with_location(db, case_code)
    released_date = None
    checked_out_date = None
    if row is not None and row["status"] == "released" and row["released_at"]:
        released_date = format_date_for_sheet(row["released_at"].split(" ")[0])
    if row is not None and row["status"] == "checked_out" and row["checked_out_at"]:
        checked_out_date = format_date_for_sheet(row["checked_out_at"].split(" ")[0])
    history = get_case_history(db, row["id"]) if row is not None else []
    flags = get_case_flags(db, row["id"]) if row is not None else {}
    inventory = get_inventory_items(db, row["id"]) if row is not None else []
    return render_template(
        "case_detail.html",
        case=row,
        case_code=case_code,
        loc_text=location_text(row),
        released_date=released_date,
        checked_out_date=checked_out_date,
        history=history,
        flags=flags,
        inventory=inventory,
    )


@app.route("/api/case/<case_code>/history")
@login_required
def api_case_history(case_code):
    """Combined chronological history + current status flags for one
    decedent -- backs the board's History popup (see board.js)."""
    db = get_db()
    row = get_case_with_location(db, case_code)
    if row is None:
        return jsonify(error="Unknown case code"), 404
    return jsonify(
        case_code=row["case_code"],
        name=row["name"],
        funeral_home=row["funeral_home"],
        status=row["status"],
        location_text=location_text(row),
        history=get_case_history(db, row["id"]),
        flags=get_case_flags(db, row["id"]),
    )


@app.route("/api/case/<case_code>/flag", methods=["POST"])
@login_required
def api_set_case_flag(case_code):
    """Logs a Yes/No status flag change (Prepped, Witness Cremation, ID
    Viewing, ... -- see config.CASE_FLAGS) for a decedent. Each change is
    its own timestamped, staff-attributed case_events row rather than an
    overwrite, so the full history of when it changed (and who changed
    it) is never lost."""
    data = request.get_json(force=True)
    flag = (data.get("flag") or "").strip()
    value = bool(data.get("value"))
    staff = (data.get("staff") or "").strip()

    if flag not in config.CASE_FLAGS:
        return jsonify(error="Unknown status flag"), 400

    db = get_db()
    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None:
        return jsonify(error="Unknown case code"), 404

    db.execute(
        "INSERT INTO case_events (case_id, flag, value, timestamp, staff) VALUES (?, ?, ?, ?, ?)",
        (case["id"], flag, int(value), now(), staff),
    )
    db.commit()

    return jsonify(
        ok=True,
        history=get_case_history(db, case["id"]),
        flags=get_case_flags(db, case["id"]),
    )


@app.route("/api/case/<case_code>/inventory")
@login_required
def api_list_inventory(case_code):
    """Personal-effects inventory (jewelry, clothing, phone, paperwork,
    etc.) logged for a decedent -- backs the scan station's Inventory
    mode and the read-only list on a case's own page."""
    db = get_db()
    case = db.execute("SELECT id FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None:
        return jsonify(error="Unknown case code"), 404
    return jsonify(items=get_inventory_items(db, case["id"]))


@app.route("/api/case/<case_code>/inventory", methods=["POST"])
@login_required
def api_add_inventory(case_code):
    """Adds one inventory line item: a description, an optional photo
    (attached as multipart form data, not JSON, since it's a file
    upload), and whoever logged it. One photo per line item -- multiple
    angles of the same item are just multiple lines."""
    db = get_db()
    case = db.execute("SELECT id, name FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None:
        return jsonify(error="Unknown case code"), 404

    description = (request.form.get("description") or "").strip()
    staff = (request.form.get("staff") or "").strip()
    photo = request.files.get("photo")

    if not description and not (photo and photo.filename):
        return jsonify(error="Enter a description or attach a photo"), 400

    photo_filename = None
    if photo and photo.filename:
        photo_filename, err = _save_inventory_photo(photo, case_code, case["name"])
        if err:
            return jsonify(error=err), 400

    db.execute(
        "INSERT INTO inventory_items (case_id, description, photo_filename, created_at, staff) "
        "VALUES (?, ?, ?, ?, ?)",
        (case["id"], description or None, photo_filename, now(), staff),
    )
    db.commit()

    return jsonify(ok=True, items=get_inventory_items(db, case["id"]))


@app.route("/api/inventory/<int:item_id>/delete", methods=["POST"])
@login_required
def api_delete_inventory(item_id):
    """Removes one inventory line item (and its photo file, if any) --
    for correcting a mis-typed or duplicate entry."""
    db = get_db()
    item = db.execute("SELECT * FROM inventory_items WHERE id = ?", (item_id,)).fetchone()
    if item is None:
        return jsonify(error="Unknown inventory item"), 404

    if item["photo_filename"]:
        photo_path = INVENTORY_PHOTOS_PATH / item["photo_filename"]
        photo_path.unlink(missing_ok=True)

    db.execute("DELETE FROM inventory_items WHERE id = ?", (item_id,))
    db.commit()

    return jsonify(ok=True, items=get_inventory_items(db, item["case_id"]))


@app.route("/api/inventory/<int:item_id>/photo")
@login_required
def inventory_photo(item_id):
    """Serves one inventory item's photo, looked up by item id rather
    than a raw filename in the URL -- a real route (not static/) so it
    stays behind the same passcode gate as everything else, since these
    can show personal effects like ID cards or documents."""
    db = get_db()
    item = db.execute(
        "SELECT photo_filename FROM inventory_items WHERE id = ?", (item_id,)
    ).fetchone()
    if item is None or not item["photo_filename"]:
        return jsonify(error="No photo for this item"), 404
    photo_path = INVENTORY_PHOTOS_PATH / item["photo_filename"]
    if not photo_path.is_file():
        return jsonify(error="Photo file missing"), 404
    return app.response_class(photo_path.read_bytes(), mimetype="image/jpeg")


@app.route("/case/<case_code>/print")
@login_required
def case_print_page(case_code):
    """Printable armband tag: QR code + human-readable case/name text."""
    db = get_db()
    row = get_case_with_location(db, case_code)
    if row is None:
        return jsonify(error="Unknown case code -- start intake first"), 404
    return render_template(
        "case_print.html",
        case=row,
        case_code=case_code,
        pickup_date=format_date_for_sheet(row["pickup_date"]),
    )


@app.route("/case/<case_code>/release-form")
@login_required
def case_release_form_page(case_code):
    """Printable release / chain-of-custody form: who the decedent was
    released to, when, from where, who processed it, and the receiving
    party's printed name + signature."""
    db = get_db()
    row = get_case_with_location(db, case_code)
    if row is None or row["status"] != "released":
        return jsonify(error="This case hasn't been released"), 404

    released_date = None
    if row["released_at"]:
        try:
            dt = datetime.strptime(row["released_at"], "%Y-%m-%d %H:%M:%S")
            released_date = f"{dt.month}/{dt.day}/{dt.year} {dt.strftime('%I:%M %p').lstrip('0')}"
        except ValueError:
            released_date = row["released_at"]

    staff_row = db.execute(
        "SELECT staff FROM moves WHERE case_id = ? AND action = 'released' ORDER BY id DESC LIMIT 1",
        (row["id"],),
    ).fetchone()

    return render_template(
        "release_form.html",
        case=row,
        case_code=case_code,
        released_date=released_date,
        from_location=_move_location_text(row["cooler_name"], row["shelf"], row["slot"]),
        staff=staff_row["staff"] if staff_row and staff_row["staff"] else None,
    )


@app.route("/case/<case_code>/qr.png")
@login_required
def case_qr_image(case_code):
    """The QR image itself, encoding the full URL to this case's detail
    page -- scanning it with ANY phone camera (not just this app) opens
    that page directly."""
    target_url = request.host_url.rstrip("/") + url_for("case_detail_page", case_code=case_code)
    png_bytes = generate_qr_png(target_url)
    resp = app.response_class(png_bytes, mimetype="image/png")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route("/case/<case_code>/label.png")
@login_required
def case_label_image(case_code):
    """Downloadable flat image of the whole armband tag -- for label
    printer apps that need a plain image file instead of a browser
    print dialog."""
    db = get_db()
    row = get_case_with_location(db, case_code)
    if row is None:
        return jsonify(error="Unknown case code"), 404
    target_url = request.host_url.rstrip("/") + url_for("case_detail_page", case_code=case_code)
    png_bytes = generate_label_image(
        case_code,
        row["name"],
        row["funeral_home"],
        format_date_for_sheet(row["pickup_date"]),
        target_url,
    )
    resp = app.response_class(png_bytes, mimetype="image/png")
    resp.headers["Content-Disposition"] = f"attachment; filename=armband-{case_code}.png"
    return resp


@app.route("/camera-test")
def camera_test_page():
    # Deliberately NOT login-gated -- this page sends nothing anywhere and
    # touches no case data, so it's fine to reach without the passcode.
    return render_template("camera_test.html")


@app.route("/sw.js")
def service_worker():
    # Served from root (not /static/sw.js) so its default scope covers
    # /scan, not just files under /static/.
    resp = app.send_static_file("sw.js")
    resp.headers["Content-Type"] = "application/javascript"
    # Critical: without this, browsers cache sw.js itself and may not even
    # check for a newer version for a long time, meaning app updates never
    # reach already-installed phones. Force a fresh check every load.
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


# --------------------------------------------------------------------- api --
@app.route("/api/board")
@login_required
def api_board():
    db = get_db()
    rows = db.execute(
        """
        SELECT l.code AS location_code, l.cooler_name, l.cooler_code, l.shelf, l.slot, l.shared,
               l.screen, c.case_code, c.name, c.funeral_home, c.pickup_date, c.status, c.created_at
        FROM locations l
        LEFT JOIN cases c ON c.location_id = l.id AND c.status = 'placed'
        ORDER BY l.cooler_order, l.shelf, l.slot
        """
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/checked-out")
@login_required
def api_checked_out():
    """Decedents currently checked out (temporary custody transfer) --
    these hold no shelf/slot, so they never show up on the board grid
    itself. Listed separately so a Check In has somewhere to start from."""
    db = get_db()
    rows = db.execute(
        """SELECT case_code, name, funeral_home, checkout_org, checkout_reason, checked_out_at
           FROM cases WHERE status = 'checked_out' ORDER BY checked_out_at ASC"""
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/board/export.csv")
@login_required
def api_board_export():
    """Current placement table, exportable/printable as a spreadsheet."""
    db = get_db()
    rows = db.execute(
        """
        SELECT l.cooler_name, l.screen, l.shelf, l.slot,
               c.case_code, c.name, c.funeral_home, c.pickup_date
        FROM locations l
        JOIN cases c ON c.location_id = l.id AND c.status = 'placed'
        ORDER BY l.cooler_order, l.shelf, l.slot
        """
    ).fetchall()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["Cooler", "Screen", "Shelf", "Slot", "Case", "Name", "Funeral Home", "Pickup Date"]
    )
    for r in rows:
        writer.writerow(
            [
                r["cooler_name"],
                r["screen"],
                r["shelf"],
                r["slot"] or "",
                r["case_code"],
                r["name"] or "",
                r["funeral_home"] or "",
                r["pickup_date"] or "",
            ]
        )

    resp = app.response_class(buf.getvalue(), mimetype="text/csv")
    resp.headers["Content-Disposition"] = (
        f"attachment; filename=cooler-board-{datetime.now().strftime('%Y-%m-%d')}.csv"
    )
    return resp


@app.route("/api/case/lookup", methods=["POST"])
@login_required
def api_case_lookup():
    """Scan a Case ID tag. Creates the case record if it's brand new.

    Pre-printed placeholder field tags (case codes starting with
    config.FIELD_TAG_PREFIX -- see gen_field_tags.py) are a special case:
    the physical tag's code is never used as the case's real identity.
    The first time one is scanned, a real, sequential case number is
    claimed from the sheet for it and remembered in tag_aliases, so this
    same physical tag always resolves to that real case from then on.
    """
    data = request.get_json(force=True)
    case_code = (data.get("case_code") or "").strip()
    if not case_code:
        return jsonify(error="No case code scanned"), 400

    db = get_db()

    case_code, err = _resolve_field_tag(db, case_code)
    if err:
        message, status = err
        return jsonify(error=message), status

    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if row is None:
        db.execute(
            "INSERT INTO cases (case_code, status, created_at, sheet_id) VALUES (?, 'pending_info', ?, ?)",
            (case_code, now(), current_sheet_id(db)),
        )
        db.commit()
        row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    return jsonify(dict(row))


@app.route("/api/case/<case_code>/info", methods=["POST"])
@login_required
def api_case_info(case_code):
    """
    Save/edit intake info: name, funeral home, pickup date. Used by the
    scan station's Field Intake/Assign flows AND the board's click-to-edit
    -- either way, syncs back to the sheet the same as sheet-intake save
    does, so an edit made from the board doesn't fall out of sync with
    the call log.
    """
    data = request.get_json(force=True)
    db = get_db()
    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if row is None:
        return jsonify(error="Unknown case code"), 404

    new_status = row["status"]
    if new_status == "pending_info":
        new_status = "pending_location"

    name = data.get("name", row["name"])
    funeral_home = data.get("funeral_home", row["funeral_home"])
    pickup_date = data.get("pickup_date", row["pickup_date"])

    db.execute(
        """UPDATE cases
           SET name = ?, funeral_home = ?, pickup_date = ?, status = ?
           WHERE case_code = ?""",
        (name, funeral_home, pickup_date, new_status, case_code),
    )
    db.commit()

    sheet_warning = None
    if config.GOOGLE_SHEETS_ENABLED:
        try:
            sid = case_sheet_id(db, row)
            sheet_row = _sheets().find_row_for_case(sid, case_code)
            if sheet_row:
                _sheets().backfill_intake(
                    sid, sheet_row, format_date_for_sheet(pickup_date), name, funeral_home
                )
        except Exception as e:
            sheet_warning = f"Saved locally, but sheet write failed: {e}"

    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    resp = dict(row)
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(resp)


def _backfill_case_location(db, case, loc):
    """Writes a case's current location into the sheet -- shared by both
    Assign (first placement) and Move (relocation), so a moved decedent's
    COOLER LOCATION column stays accurate instead of only reflecting
    wherever they were FIRST placed."""
    if not config.GOOGLE_SHEETS_ENABLED:
        return None
    try:
        sid = case_sheet_id(db, case)
        sheet_row = _sheets().find_row_for_case(sid, case["case_code"])
        if sheet_row:
            loc_text = f"{loc['cooler_name']} - Shelf {loc['shelf']}{loc['slot'] or ''}"
            _sheets().backfill_location(sid, sheet_row, loc_text)
        return None
    except Exception as e:
        # Local placement already succeeded and is the source of truth
        # for the board -- a sheet write failure here is a warning, not
        # a reason to undo the placement.
        return f"Placed locally, but sheet write failed: {e}"


@app.route("/api/assign", methods=["POST"])
@login_required
def api_assign():
    """First placement: case_code -> location_code."""
    data = request.get_json(force=True)
    case_code = data.get("case_code")
    location_code = data.get("location_code")
    staff = (data.get("staff") or "").strip()
    db = get_db()

    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    loc = db.execute("SELECT * FROM locations WHERE code = ?", (location_code,)).fetchone()
    if case is None:
        return jsonify(error="Unknown case code"), 404
    if loc is None:
        return jsonify(error="Unknown location code"), 404

    if not loc["shared"]:
        occupied = db.execute(
            "SELECT * FROM cases WHERE location_id = ? AND status = 'placed'", (loc["id"],)
        ).fetchone()
        if occupied is not None:
            return jsonify(error=f"{location_code} is already occupied by {occupied['case_code']}"), 409

    db.execute(
        "UPDATE cases SET location_id = ?, status = 'placed' WHERE id = ?",
        (loc["id"], case["id"]),
    )
    db.execute(
        "INSERT INTO moves (case_id, from_location_id, to_location_id, action, timestamp, staff) VALUES (?, NULL, ?, 'placed', ?, ?)",
        (case["id"], loc["id"], now(), staff),
    )
    db.commit()

    sheet_warning = _backfill_case_location(db, case, loc)

    resp = dict(ok=True, case_code=case_code, location_code=location_code)
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(**resp)


def _perform_move(case, new_loc, staff):
    """Shared by /api/move and /api/move-to-staging: relocates an
    already-placed case to new_loc, logs it, and syncs the sheet."""
    db = get_db()
    old_loc_id = case["location_id"]
    db.execute("UPDATE cases SET location_id = ? WHERE id = ?", (new_loc["id"], case["id"]))
    db.execute(
        "INSERT INTO moves (case_id, from_location_id, to_location_id, action, timestamp, staff) VALUES (?, ?, ?, 'moved', ?, ?)",
        (case["id"], old_loc_id, new_loc["id"], now(), staff),
    )
    db.commit()
    return _backfill_case_location(db, case, new_loc)


@app.route("/api/move", methods=["POST"])
@login_required
def api_move():
    """Relocate an already-placed case to a new location."""
    data = request.get_json(force=True)
    case_code = data.get("case_code")
    location_code = data.get("location_code")
    staff = (data.get("staff") or "").strip()
    db = get_db()

    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    new_loc = db.execute("SELECT * FROM locations WHERE code = ?", (location_code,)).fetchone()
    if case is None or case["status"] != "placed":
        return jsonify(error="Case is not currently placed; use Assign instead"), 400
    if new_loc is None:
        return jsonify(error="Unknown location code"), 404

    if not new_loc["shared"]:
        occupied = db.execute(
            "SELECT * FROM cases WHERE location_id = ? AND status = 'placed'", (new_loc["id"],)
        ).fetchone()
        if occupied is not None:
            return jsonify(error=f"{location_code} is already occupied by {occupied['case_code']}"), 409

    sheet_warning = _perform_move(case, new_loc, staff)

    resp = dict(ok=True, case_code=case_code, location_code=location_code)
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(**resp)


@app.route("/api/move-to-staging", methods=["POST"])
@login_required
def api_move_to_staging():
    """Convenience action: relocates an already-placed case straight to
    the next open shelf in Cremation Staging (falling back to the
    overflow Biers area once the main shelves are full), without staff
    needing to scan/tap a specific destination location."""
    data = request.get_json(force=True)
    case_code = data.get("case_code")
    staff = (data.get("staff") or "").strip()
    db = get_db()

    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None or case["status"] != "placed":
        return jsonify(error="Case is not currently placed; use Assign instead"), 400

    new_loc = db.execute(
        """
        SELECT l.* FROM locations l
        WHERE l.cooler_code IN ('CREM-STAGE', 'CREM-STAGE-BIERS')
          AND NOT EXISTS (
              SELECT 1 FROM cases c WHERE c.location_id = l.id AND c.status = 'placed'
          )
        ORDER BY CASE l.cooler_code WHEN 'CREM-STAGE' THEN 0 ELSE 1 END, l.shelf, l.slot
        LIMIT 1
        """
    ).fetchone()
    if new_loc is None:
        return jsonify(error="No open space in Cremation Staging or the overflow Biers area"), 409

    sheet_warning = _perform_move(case, new_loc, staff)

    resp = dict(ok=True, case_code=case_code, location_code=new_loc["code"])
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(**resp)


@app.route("/api/release", methods=["POST"])
@login_required
def api_release():
    """Pickup / removal: frees the slot, records who/where the decedent
    was released to, both locally and back into the sheet."""
    data = request.get_json(force=True)
    case_code = data.get("case_code")
    cremated = bool(data.get("cremated"))
    released_to = "Cremated" if cremated else (data.get("released_to") or "").strip()
    staff = (data.get("staff") or "").strip()
    signed_name = (data.get("signed_name") or "").strip()
    signature = data.get("signature") or None
    disk_number = (data.get("disk_number") or "").strip() if cremated else None
    db = get_db()

    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None or case["status"] != "placed":
        return jsonify(error="Case is not currently placed"), 400

    db.execute(
        """UPDATE cases SET status = 'released', released_at = ?, released_to = ?,
           release_signed_name = ?, release_signature = ?, disk_number = ? WHERE id = ?""",
        (now(), released_to, signed_name, signature, disk_number, case["id"]),
    )
    db.execute(
        "INSERT INTO moves (case_id, from_location_id, to_location_id, action, timestamp, staff, disk_number) VALUES (?, ?, NULL, 'released', ?, ?, ?)",
        (case["id"], case["location_id"], now(), staff, disk_number),
    )
    db.commit()

    sheet_warning = None
    if config.GOOGLE_SHEETS_ENABLED and released_to:
        try:
            sid = case_sheet_id(db, case)
            sheet_row = _sheets().find_row_for_case(sid, case_code)
            if sheet_row:
                if cremated:
                    dt = datetime.now()
                    stamp = f"{dt.month}/{dt.day}/{dt.year} {dt.strftime('%I:%M %p').lstrip('0')}"
                    _sheets().backfill_cremation(sid, sheet_row, stamp, disk_number)
                else:
                    _sheets().backfill_released_to(sid, sheet_row, released_to)
        except Exception as e:
            sheet_warning = f"Released locally, but sheet write failed: {e}"

    resp = dict(ok=True, case_code=case_code)
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(**resp)


@app.route("/api/checkout", methods=["POST"])
@login_required
def api_checkout():
    """
    Temporary custody transfer -- autopsy, organ/tissue donation, etc.
    Unlike Release, the armband QR stays fully active: scanning it again
    later is how the decedent gets checked back in. Frees the current
    shelf/slot, same as Release, since the body physically leaves.
    """
    data = request.get_json(force=True)
    case_code = data.get("case_code")
    org = (data.get("organization") or "").strip()
    reason = (data.get("reason") or "").strip()
    staff = (data.get("staff") or "").strip()
    db = get_db()

    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None or case["status"] != "placed":
        return jsonify(error="Case is not currently placed"), 400
    if not org:
        return jsonify(error="Missing organization"), 400

    checked_out_at = now()
    db.execute(
        """UPDATE cases
           SET status = 'checked_out', location_id = NULL,
               checkout_org = ?, checkout_reason = ?, checked_out_at = ?
           WHERE id = ?""",
        (org, reason, checked_out_at, case["id"]),
    )
    db.execute(
        "INSERT INTO moves (case_id, from_location_id, to_location_id, action, timestamp, staff) VALUES (?, ?, NULL, 'checked_out', ?, ?)",
        (case["id"], case["location_id"], checked_out_at, staff),
    )
    db.commit()

    sheet_warning = None
    if config.GOOGLE_SHEETS_ENABLED:
        try:
            sid = case_sheet_id(db, case)
            sheet_row = _sheets().find_row_for_case(sid, case_code)
            if sheet_row:
                summary = f"Checked out to {org}"
                if reason:
                    summary += f" ({reason})"
                summary += f" since {format_date_for_sheet(checked_out_at.split(' ')[0])}"
                _sheets().backfill_checkout(sid, sheet_row, summary)
        except Exception as e:
            sheet_warning = f"Checked out locally, but sheet write failed: {e}"

    resp = dict(ok=True, case_code=case_code)
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(**resp)


@app.route("/api/checkin", methods=["POST"])
@login_required
def api_checkin():
    """Brings a checked-out decedent back into the system -- ready for a
    fresh location scan, same as any other not-yet-placed case."""
    data = request.get_json(force=True)
    case_code = data.get("case_code")
    staff = (data.get("staff") or "").strip()
    db = get_db()

    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None or case["status"] != "checked_out":
        return jsonify(error="Case is not currently checked out"), 400

    db.execute(
        """UPDATE cases
           SET status = 'pending_location', checkout_org = NULL,
               checkout_reason = NULL, checked_out_at = NULL
           WHERE id = ?""",
        (case["id"],),
    )
    db.execute(
        "INSERT INTO moves (case_id, from_location_id, to_location_id, action, timestamp, staff) VALUES (?, NULL, NULL, 'checked_in', ?, ?)",
        (case["id"], now(), staff),
    )
    db.commit()

    sheet_warning = None
    if config.GOOGLE_SHEETS_ENABLED:
        try:
            sid = case_sheet_id(db, case)
            sheet_row = _sheets().find_row_for_case(sid, case_code)
            if sheet_row:
                _sheets().backfill_checkout(sid, sheet_row, "")
        except Exception as e:
            sheet_warning = f"Checked in locally, but sheet write failed: {e}"

    resp = dict(ok=True, case_code=case_code)
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(**resp)


@app.route("/api/intake-sync", methods=["POST"])
@login_required
def api_intake_sync():
    """
    Offline-capable field intake. The phone calls this the moment it has
    *any* connection (WiFi or cellular) -- it may be minutes or hours after
    the actual scan happened in the field. client_id is generated on the
    phone at scan time and makes retries safe: replaying the same client_id
    (e.g. a flaky connection that "succeeded" but the response never made
    it back) just returns the already-applied result instead of duplicating.
    """
    data = request.get_json(force=True)
    client_id = (data.get("client_id") or "").strip()
    case_code = (data.get("case_code") or "").strip()
    if not client_id or not case_code:
        return jsonify(error="Missing client_id or case_code"), 400

    db = get_db()
    already = db.execute(
        "SELECT 1 FROM sync_log WHERE client_id = ?", (client_id,)
    ).fetchone()
    if already:
        row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
        return jsonify(ok=True, duplicate=True, case=(dict(row) if row else None))

    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    name = data.get("name") or (row["name"] if row else None)
    funeral_home = data.get("funeral_home") or (row["funeral_home"] if row else None)
    pickup_date = data.get("pickup_date") or (row["pickup_date"] if row else None)
    new_status = "pending_location" if name else "pending_info"

    if row is None:
        db.execute(
            """INSERT INTO cases (case_code, name, funeral_home, pickup_date, status, created_at, sheet_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (case_code, name, funeral_home, pickup_date, new_status, now(), current_sheet_id(db)),
        )
    elif row["status"] in ("pending_info", "pending_location"):
        db.execute(
            """UPDATE cases SET name = ?, funeral_home = ?, pickup_date = ?, status = ?
               WHERE case_code = ?""",
            (name, funeral_home, pickup_date, new_status, case_code),
        )
    # if the case is already placed/released, an intake-sync arriving late
    # shouldn't clobber that -- it's just a late-arriving duplicate.

    db.execute(
        "INSERT INTO sync_log (client_id, created_at) VALUES (?, ?)", (client_id, now())
    )
    db.commit()
    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    return jsonify(ok=True, duplicate=False, case=dict(row))


@app.route("/api/sheet-intake/start", methods=["POST"])
@login_required
def api_sheet_intake_start():
    """
    Pulls the next unclaimed case number from Column A of the Google
    Sheet and creates a matching local case record. This replaces
    scanning a pre-printed Case ID tag -- the case number itself comes
    from the sheet.
    """
    if not config.GOOGLE_SHEETS_ENABLED:
        return jsonify(error="Google Sheets intake isn't turned on yet (see config.py)"), 400

    db = get_db()
    sid = current_sheet_id(db)
    try:
        row_num, case_code = _sheets().find_next_unclaimed_case(sid)
    except Exception as e:
        return jsonify(error=f"Couldn't reach the spreadsheet: {e}"), 502

    if case_code is None:
        return jsonify(error="No unclaimed case numbers found in the sheet -- add more rows"), 404

    existing = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if existing is None:
        db.execute(
            "INSERT INTO cases (case_code, status, created_at, sheet_id) VALUES (?, 'pending_info', ?, ?)",
            (case_code, now(), sid),
        )
        db.commit()

    return jsonify(ok=True, case_code=case_code, sheet_row=row_num)


@app.route("/api/sheet-intake/save", methods=["POST"])
@login_required
def api_sheet_intake_save():
    """
    Saves name/funeral home/date for a case started via Sheets intake --
    both locally (so Assign/Move/Release/board all work as normal) and
    back into columns B, D, E of the sheet.
    """
    data = request.get_json(force=True)
    case_code = (data.get("case_code") or "").strip()
    name = data.get("name") or ""
    funeral_home = data.get("funeral_home") or ""
    pickup_date = data.get("pickup_date") or ""
    time_received = data.get("time_received") or ""
    removal_type = data.get("removal_type") or ""
    disposition = data.get("disposition") or ""
    removal_by = data.get("removal_by") or ""
    night = data.get("night") or ""

    if not case_code:
        return jsonify(error="Missing case_code"), 400

    db = get_db()
    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if row is None:
        return jsonify(error="Unknown case code -- start intake first"), 404

    db.execute(
        """UPDATE cases SET name = ?, funeral_home = ?, pickup_date = ?, status = 'pending_location',
           time_received = ?, removal_type = ?, disposition = ?, removal_by = ?, night = ?
           WHERE case_code = ?""",
        (name, funeral_home, pickup_date, time_received, removal_type, disposition, removal_by, night, case_code),
    )
    db.commit()

    if config.GOOGLE_SHEETS_ENABLED:
        try:
            sid = case_sheet_id(db, row)
            sheet_row = data.get("sheet_row")
            if not sheet_row:
                sheet_row = _sheets().find_row_for_case(sid, case_code)
            if sheet_row:
                _sheets().backfill_intake(
                    sid, sheet_row, format_date_for_sheet(pickup_date), name, funeral_home
                )
                _sheets().backfill_removal_details(
                    sid, sheet_row, time_received, removal_type, disposition, removal_by, night
                )
                if not _sheets().row_has_case_link(sid, sheet_row):
                    target_url = request.host_url.rstrip("/") + url_for(
                        "case_detail_page", case_code=case_code
                    )
                    _sheets().backfill_case_link(sid, sheet_row, target_url)
        except Exception as e:
            # Local save already succeeded -- don't fail the whole request
            # over a sheet write hiccup, just tell the caller it happened.
            row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
            return jsonify(
                ok=True, case=dict(row), sheet_warning=f"Saved locally, but sheet write failed: {e}"
            )

    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    return jsonify(ok=True, case=dict(row))


@app.route("/api/case/<case_code>")
@login_required
def api_case_get(case_code):
    db = get_db()
    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if row is None:
        return jsonify(error="Unknown case code"), 404
    return jsonify(dict(row))


def _ensure_https_cert():
    """
    Self-signed cert for LAN HTTPS, generated once and cached in
    cert.pem/key.pem (same idea as secret_key.txt) instead of asking
    Werkzeug to generate a fresh one via ssl_context="adhoc" on every
    startup. That "adhoc" path hands key generation off to pyOpenSSL's
    own OpenSSL binding, which has a known history of hanging or being
    extremely slow on some Windows machines (entropy/FIPS-mode
    weirdness). Generating directly with the `cryptography` library
    (already installed -- pyOpenSSL depends on it) sidesteps that path
    entirely, and caching to disk means it only ever runs once.
    """
    cert_path = Path("cert.pem")
    key_path = Path("key.pem")
    if cert_path.exists() and key_path.exists():
        return str(cert_path), str(key_path)

    import datetime

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    print("Generating a self-signed HTTPS certificate (one-time, cached in cert.pem/key.pem)...")
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "cooler-board.local")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(
            x509.SubjectAlternativeName(
                [x509.DNSName("cooler-board.local"), x509.DNSName("localhost")]
            ),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    key_path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    print("Certificate saved -- future --https starts will reuse it instantly.")
    return str(cert_path), str(key_path)


if __name__ == "__main__":
    import sys

    init_db()
    use_https = "--https" in sys.argv
    ssl_ctx = _ensure_https_cert() if use_https else None
    if use_https:
        print("Starting with a self-signed HTTPS cert (needed for camera scanning).")
        print("Browsers will show a 'not secure' warning the first time -- that's")
        print("expected for a self-signed cert on your own LAN. Choose")
        print("'Advanced' -> 'Proceed' / 'visit this site' to continue.")
    # threaded=False: requests are handled one at a time, which is what
    # keeps two simultaneous scans from both grabbing the same slot.
    # Fine for a single scan station; see README if you add a second one.
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=False, ssl_context=ssl_ctx)
