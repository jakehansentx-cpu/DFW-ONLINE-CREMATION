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
import threading
import time
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path
from urllib.parse import quote
from flask import Flask, g, jsonify, render_template, request, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

import qrcode
from PIL import Image, ImageDraw, ImageFont

import config

app = Flask(__name__)
DB_PATH = "cooler.db"

# In-memory only (not persisted -- resets on restart, which is fine): the
# last time each case_code was scanned anywhere (any mode, any device).
# Lets the Cooler Board's detail popup auto-close itself once someone
# actually scans the tag it's showing (see api_case_scan_timestamp), e.g.
# a shared-screen board display showing a QR code that a staff member
# then scans with their own phone.
_last_scan_times = {}
INVENTORY_PHOTOS_PATH = Path(config.INVENTORY_PHOTOS_DIR)
INVENTORY_PHOTOS_PATH.mkdir(exist_ok=True)
CASE_DOCUMENTS_PATH = Path(config.CASE_DOCUMENTS_DIR)
CASE_DOCUMENTS_PATH.mkdir(exist_ok=True)


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
                return jsonify(error="Not logged in. Reload the page and log in."), 401
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    """Combines login_required with an is_admin check -- used alone (not
    stacked with login_required) on every /admin route. GET /admin
    itself redirects a non-admin back to the board; every other admin
    route is a JSON API, so it 401s/403s instead."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        is_api = request.path != "/admin"
        if not session.get("authed"):
            if is_api:
                return jsonify(error="Not logged in."), 401
            return redirect(url_for("login", next=request.path))
        if not session.get("is_admin"):
            if is_api:
                return jsonify(error="Admin access required"), 403
            return redirect(url_for("board_page"))
        return view(*args, **kwargs)
    return wrapped


@app.before_request
def _require_password_change():
    """Once logged in with a temporary or admin-reset password, every
    page except the change-password form itself (and logout) redirects
    there, so a forced reset can't just be skipped by navigating
    elsewhere."""
    if not session.get("authed") or not session.get("must_change_password"):
        return
    if request.endpoint in ("change_password", "logout", "static"):
        return
    if request.path.startswith("/api/"):
        return jsonify(error="You must set a new password before continuing."), 403
    return redirect(url_for("change_password"))


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            error = "Wrong name or password."
        elif not user["active"]:
            error = "This account has been disabled. See an admin."
        else:
            session.permanent = True
            session["authed"] = True
            session["username"] = user["username"]
            session["is_admin"] = bool(user["is_admin"])
            session["must_change_password"] = bool(user["must_change_password"])
            db.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now(), user["id"]))
            db.commit()
            if user["must_change_password"]:
                return redirect(url_for("change_password"))
            return redirect(request.args.get("next") or url_for("board_page"))
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/change-password", methods=["GET", "POST"])
@login_required
def change_password():
    # Staff can no longer change their own password on demand -- only an
    # admin can, via Reset Password on the Admin page (which sets a fresh
    # temp password and routes back through this same forced flow). This
    # route still exists for that forced first-login/post-reset step.
    if not session.get("must_change_password"):
        return redirect(url_for("board_page"))

    error = None
    if request.method == "POST":
        new_password = request.form.get("new_password") or ""
        confirm_password = request.form.get("confirm_password") or ""
        if len(new_password) < 6:
            error = "Password must be at least 6 characters."
        elif new_password != confirm_password:
            error = "Passwords don't match."
        else:
            db = get_db()
            db.execute(
                "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = ?",
                (generate_password_hash(new_password), session["username"]),
            )
            db.commit()
            session["must_change_password"] = False
            return redirect(url_for("board_page"))
    return render_template("change_password.html", error=error, forced=bool(session.get("must_change_password")))


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

        CREATE TABLE IF NOT EXISTS case_documents (
            id INTEGER PRIMARY KEY,
            case_id INTEGER NOT NULL REFERENCES cases(id),
            doc_type TEXT,  -- "Face Sheet", "First Call Sheet", etc. -- free text, staff types it
            photo_filename TEXT NOT NULL,
            created_at TEXT NOT NULL,
            staff TEXT
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,  -- the staff member's name; never changes
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,  -- disabled (not deleted) once someone leaves,
                                                 -- so their name stays intact on old history
            must_change_password INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            last_login_at TEXT
        );

        CREATE TABLE IF NOT EXISTS disposition_options (
            id INTEGER PRIMARY KEY,
            label TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL
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

    # First run only: seed one login per name already in config.STAFF_NAMES,
    # all with the same temporary password, forced to be changed on first
    # login -- so there's never a chicken-and-egg problem where nobody can
    # log in to create the first account. The first name becomes the
    # initial admin, able to create/disable further accounts from there.
    user_count = db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
    if user_count == 0 and config.STAFF_NAMES:
        temp_hash = generate_password_hash(config.INITIAL_TEMP_PASSWORD)
        for i, name in enumerate(config.STAFF_NAMES):
            db.execute(
                "INSERT INTO users (username, password_hash, is_admin, active, must_change_password, created_at) "
                "VALUES (?, ?, ?, 1, 1, ?)",
                (name, temp_hash, 1 if i == 0 else 0, now()),
            )
        db.commit()
        print(
            f"Seeded {len(config.STAFF_NAMES)} login(s) with temporary password "
            f"'{config.INITIAL_TEMP_PASSWORD}' -- {config.STAFF_NAMES[0]} is the initial admin."
        )

    # First run only: seed the Disposition dropdown with the common values
    # staff actually use -- Admin can add/remove from there afterward (see
    # /admin/dispositions/create). The field stays free-text underneath
    # (a <datalist>, not a <select>) so an unusual one-off can always be
    # typed even if it's not in this list.
    disposition_count = db.execute("SELECT COUNT(*) AS n FROM disposition_options").fetchone()["n"]
    if disposition_count == 0:
        for label in (
            "PU/HOLD", "PICKUP/PREP", "HOLD", "FH DROP OFF",
            "STORAGE", "PREP", "DIRECT CREMATION",
        ):
            db.execute(
                "INSERT INTO disposition_options (label, created_at) VALUES (?, ?)",
                (label, now()),
            )
        db.commit()

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


def format_time_for_sheet(hhmm):
    """
    The time picker always sends 24-hour HH:MM internally (that's the
    only format an <input type="time"> value ever comes in, regardless
    of how it's displayed on-screen). The sheet's existing times read
    like 11:00 PM / 2:00 AM -- write ours the same way instead of as
    military time, so the column stays consistent no matter whether a
    row came from the app or was typed straight into the sheet.
    """
    if not hhmm:
        return hhmm
    try:
        dt = datetime.strptime(hhmm, "%H:%M")
        return f"{dt.strftime('%I').lstrip('0') or '12'}:{dt.strftime('%M %p')}"
    except ValueError:
        return hhmm  # unexpected format -- write it through as-is rather than crash


def _inventory_status_urls(base_url, case_code):
    """The two links column O's (INVENTORY) status can point to (see
    backfill_inventory_status): the case page (once inventory exists) or
    straight into the scan app's Inventory panel for this case (when it
    doesn't yet, via the ?open=inventory deep link -- see scan.js). Built
    with plain string formatting rather than url_for, so this also works
    from the background sync loop (run_sheet_sync), which has no Flask
    request context to build one from."""
    view_url = f"{base_url}/case/{quote(case_code, safe='')}"
    add_url = f"{base_url}/scan?open=inventory&case={quote(case_code, safe='')}"
    return view_url, add_url


def _documents_status_urls(base_url, case_code):
    """The two links column P's (Documents) status can point to (see
    backfill_documents_status) -- same pattern as
    _inventory_status_urls, just pointing the "add" link at the scan
    app's Documents panel (?open=documents) instead of Inventory's."""
    view_url = f"{base_url}/case/{quote(case_code, safe='')}"
    add_url = f"{base_url}/scan?open=documents&case={quote(case_code, safe='')}"
    return view_url, add_url


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

    _maybe_auto_adopt_new_month_sheet(db)

    # Before claiming a fresh case number, pick up anything staff typed
    # straight into the sheet instead of going through the app (see
    # run_sheet_sync). This used to be a separate "Sync Manual Entries"
    # button staff had to remember to press; running it here means it
    # just always happens at the one moment it actually matters -- right
    # before a blank tag is about to be handed the next available row.
    # Best-effort: a sync hiccup shouldn't block claiming a case number.
    try:
        run_sheet_sync(db, request.host_url.rstrip("/"))
    except Exception as e:
        print(f"[field-tag claim] manual-entry sync failed, continuing anyway: {e}")

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


def release_stale_field_claims(db):
    """Gives back a real case number that got claimed by scanning a blank
    field tag (see _resolve_field_tag above) but was then never actually
    used -- no name, funeral home, or pickup date ever entered. Claiming
    never writes anything back to the sheet itself (find_next_unclaimed_case
    only reads it), so releasing is just deleting the local record of the
    claim -- the sheet naturally offers that same case number up again next
    time anything asks for the next unclaimed one, and the physical tag
    (still showing the same FIELD-### code) claims a fresh number the next
    time it's actually scanned.

    Returns the list of placeholder codes released."""
    cutoff = (
        datetime.now() - timedelta(minutes=config.RELEASE_STALE_CLAIMS_AFTER_MINUTES)
    ).strftime("%Y-%m-%d %H:%M:%S")
    stale = db.execute(
        """
        SELECT ta.placeholder_code, ta.real_case_code
        FROM tag_aliases ta
        LEFT JOIN cases c ON c.case_code = ta.real_case_code
        WHERE ta.created_at < ?
          AND (
                c.id IS NULL
                OR (c.status = 'pending_info' AND c.name IS NULL AND c.funeral_home IS NULL AND c.pickup_date IS NULL)
              )
        """,
        (cutoff,),
    ).fetchall()

    released = []
    for row in stale:
        db.execute("DELETE FROM cases WHERE case_code = ?", (row["real_case_code"],))
        db.execute("DELETE FROM tag_aliases WHERE placeholder_code = ?", (row["placeholder_code"],))
        released.append(row["placeholder_code"])
    if released:
        db.commit()
    return released


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


def primary_status_text(row):
    """While a decedent is still in our care, column G is just an
    operational note (Pickup & Hold, Pickup & Prep, dropped off by a
    funeral home/organization, etc.), so it's shown exactly as typed in
    the sheet. Once a case reaches final disposition there are only two
    possible outcomes -- cremated here, or released to another funeral
    home/organization -- so the field switches over to state that
    outcome plainly instead of whatever intent was originally logged."""
    if row is None:
        return None
    if row["status"] == "released":
        if row["released_to"] == "Cremated":
            when = _format_when(row["released_at"]) if row["released_at"] else None
            return f"Cremated on {when}" if when else "Cremated"
        return f"Released to {row['released_to']}" if row["released_to"] else "Released"
    return row["disposition"] or "—"


def secondary_status_text(row):
    """Physical/logistics detail alongside the primary status -- once a
    case has reached final disposition, Status already states the
    outcome plainly, so there's nothing more to add here."""
    if row is None or row["status"] == "released":
        return None
    status = row["status"]
    if status == "checked_out":
        text = f"Checked Out to {row['checkout_org'] or '—'}"
        if row["checkout_reason"]:
            text += f" ({row['checkout_reason']})"
        return text
    if status == "placed":
        loc = location_text(row)
        return f"In Cooler at {loc}" if loc else "In Cooler"
    return "Awaiting Placement"


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


def get_staff_history(db, username, limit=300):
    """Every action a specific staff member has taken -- moves, status
    flag changes, and inventory items -- across every case. Same
    combined-timeline idea as get_case_history(), just filtered by who
    did it instead of by which case; used on the admin page to verify a
    specific person's actions."""
    move_rows = db.execute(
        """
        SELECT m.action, m.timestamp, m.disk_number, c.case_code, c.name,
               fl.cooler_name AS from_cooler, fl.shelf AS from_shelf, fl.slot AS from_slot,
               tl.cooler_name AS to_cooler, tl.shelf AS to_shelf, tl.slot AS to_slot
        FROM moves m
        JOIN cases c ON c.id = m.case_id
        LEFT JOIN locations fl ON fl.id = m.from_location_id
        LEFT JOIN locations tl ON tl.id = m.to_location_id
        WHERE m.staff = ?
        ORDER BY m.timestamp DESC, m.id DESC
        LIMIT ?
        """,
        (username, limit),
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
        action_text = describe(m) if describe else m["action"]
        entries.append((m["timestamp"], f"{m['case_code']} ({m['name'] or '—'}): {action_text}"))

    event_rows = db.execute(
        """
        SELECT e.flag, e.value, e.timestamp, c.case_code, c.name
        FROM case_events e
        JOIN cases c ON c.id = e.case_id
        WHERE e.staff = ?
        ORDER BY e.timestamp DESC, e.id DESC
        LIMIT ?
        """,
        (username, limit),
    ).fetchall()
    for e in event_rows:
        entries.append(
            (e["timestamp"], f"{e['case_code']} ({e['name'] or '—'}): {e['flag']}: {'Yes' if e['value'] else 'No'}")
        )

    inv_rows = db.execute(
        """
        SELECT i.description, i.created_at, i.photo_filename, c.case_code, c.name
        FROM inventory_items i
        JOIN cases c ON c.id = i.case_id
        WHERE i.staff = ?
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT ?
        """,
        (username, limit),
    ).fetchall()
    for i in inv_rows:
        what = i["description"] or ("Photo" if i["photo_filename"] else "Inventory item")
        entries.append((i["created_at"], f"{i['case_code']} ({i['name'] or '—'}): Inventory — {what}"))

    entries.sort(key=lambda entry: entry[0], reverse=True)
    return [{"when": _format_when(ts), "description": desc} for ts, desc in entries[:limit]]


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


def _stamp_inventory_caption(img, case_code, name, timestamp):
    """Burns the case number, decedent name (if known), and date/time
    into the bottom of an inventory photo -- so the photo is still
    self-identifying even if it ever leaves the app entirely (copied off
    the Pi, emailed, printed), not just tagged in the database. Shrinks
    the case/name line down (and drops the name first, then truncates
    it) rather than letting it overflow, for unusually long names."""
    draw = ImageDraw.Draw(img)
    font_size = max(16, img.width // 40)
    max_width = img.width - 16

    def build(with_name, chars):
        if with_name and name:
            trimmed = name if chars is None or len(name) <= chars else name[:chars].rstrip() + "..."
            return f"Case: {case_code}  —  {trimmed}"
        return f"Case: {case_code}"

    font = _load_font(True, font_size)
    case_line = build(True, None)
    if draw.textbbox((0, 0), case_line, font=font)[2] > max_width:
        # Try progressively shorter versions of the name before dropping
        # it entirely -- always keeping the case number intact, since
        # that's the one piece that must never be cut off.
        fit = None
        for chars in (40, 25, 15, 8):
            candidate = build(True, chars)
            if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
                fit = candidate
                break
        case_line = fit or build(False, None)

    when_line = _format_when(timestamp)

    padding = 8
    line_gap = 4
    case_bbox = draw.textbbox((0, 0), case_line, font=font)
    when_bbox = draw.textbbox((0, 0), when_line, font=font)
    case_h = case_bbox[3] - case_bbox[1]
    when_h = when_bbox[3] - when_bbox[1]
    bar_h = padding * 2 + case_h + line_gap + when_h

    draw.rectangle([0, img.height - bar_h, img.width, img.height], fill=(0, 0, 0))
    y = img.height - bar_h + padding
    draw.text((padding, y - when_bbox[1]), when_line, font=font, fill=(255, 255, 255))
    y += when_h + line_gap
    draw.text((padding, y - case_bbox[1]), case_line, font=font, fill=(255, 255, 255))
    return img


def _save_inventory_photo(file_storage, case_code, name, timestamp):
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
    img = _stamp_inventory_caption(img, case_code, name, timestamp)
    filename = f"{secrets.token_hex(12)}.jpg"
    img.save(INVENTORY_PHOTOS_PATH / filename, format="JPEG", quality=82)
    return filename, None


def get_case_documents(db, case_id):
    """Scanned paperwork (face sheets, first call sheets, etc.) logged
    for a decedent -- oldest first, same order staff scanned them in."""
    rows = db.execute(
        "SELECT id, doc_type, created_at, staff FROM case_documents "
        "WHERE case_id = ? ORDER BY id ASC",
        (case_id,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "doc_type": r["doc_type"],
            "when": _format_when(r["created_at"]),
            "staff": r["staff"],
        }
        for r in rows
    ]


def _save_document_photo(file_storage, case_code, name, timestamp):
    """Same resize/re-encode/caption treatment as _save_inventory_photo
    -- see that function's docstring."""
    try:
        img = Image.open(file_storage.stream)
        img = img.convert("RGB")
    except Exception:
        return None, "That doesn't look like a photo the app can read -- try again."

    img.thumbnail((1600, 1600))
    img = _stamp_inventory_caption(img, case_code, name, timestamp)
    filename = f"{secrets.token_hex(12)}.jpg"
    img.save(CASE_DOCUMENTS_PATH / filename, format="JPEG", quality=82)
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


def generate_cremation_tag_image(case_code, name, funeral_home, pickup_date, staged_since, target_url):
    """
    Same content as the Avery 5164 cremation tag page (QR, name,
    funeral home, pickup date, date moved to staging) composited into a
    single flat PNG instead -- for saving straight to a phone's photo
    gallery or a desktop file rather than going through a printer.
    """
    dpi = 200
    width, height = round(4 * dpi), round(3.3333 * dpi)
    margin_x = round(0.5 * dpi)

    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)

    qr_size = round(1.6 * dpi)
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(target_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    qr_img = qr_img.resize((qr_size, qr_size))
    img.paste(qr_img, ((width - qr_size) // 2, round(0.25 * dpi)))

    lines = [(name or case_code, True, 34, (20, 21, 26))]
    if funeral_home:
        lines.append((funeral_home, True, 26, (20, 21, 26)))
    if pickup_date:
        lines.append((f"Pickup: {pickup_date}", True, 22, (42, 44, 49)))
    if staged_since:
        lines.append((f"Moved to Staging: {staged_since}", True, 22, (42, 44, 49)))

    y = round(0.25 * dpi) + qr_size + round(0.2 * dpi)
    for text, bold, size, color in lines:
        font = _load_font(bold, size)
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        # Shrink to fit the tag's width rather than letting a long name
        # or funeral home spill over the edge.
        while text_w > width - 2 * margin_x and size > 12:
            size -= 1
            font = _load_font(bold, size)
            bbox = draw.textbbox((0, 0), text, font=font)
            text_w = bbox[2] - bbox[0]
        draw.text(((width - text_w) // 2, y), text, font=font, fill=color)
        y += (bbox[3] - bbox[1]) + round(0.14 * dpi)

    buf = io.BytesIO()
    img.save(buf, format="PNG", dpi=(dpi, dpi))
    return buf.getvalue()


# ------------------------------------------------------------------- pages --
@app.route("/")
@login_required
def index():
    return render_template(
        "board.html", screens=config.BOARD_SCREENS, username=session["username"], is_admin=session.get("is_admin")
    )


@app.route("/board")
@login_required
def board_page():
    return render_template(
        "board.html", screens=config.BOARD_SCREENS, username=session["username"], is_admin=session.get("is_admin")
    )


@app.route("/scan")
@login_required
def scan_page():
    return render_template("scan.html", username=session["username"], is_admin=session.get("is_admin"))


@app.route("/admin")
@admin_required
def admin_page():
    db = get_db()
    rows = db.execute("SELECT * FROM users ORDER BY username COLLATE NOCASE").fetchall()
    users = [
        {
            "id": r["id"],
            "username": r["username"],
            "is_admin": bool(r["is_admin"]),
            "active": bool(r["active"]),
            "must_change_password": bool(r["must_change_password"]),
            "last_login_at": r["last_login_at"],
        }
        for r in rows
    ]
    dispositions = [
        {"id": r["id"], "label": r["label"]}
        for r in db.execute("SELECT * FROM disposition_options ORDER BY id").fetchall()
    ]
    return render_template(
        "admin.html",
        users_json=jsonify(users).get_data(as_text=True),
        dispositions_json=jsonify(dispositions).get_data(as_text=True),
        username=session["username"],
    )


@app.route("/admin/users/create", methods=["POST"])
@admin_required
def admin_create_user():
    data = request.get_json(force=True)
    username = (data.get("username") or "").strip()
    is_admin = bool(data.get("is_admin"))
    if not username:
        return jsonify(error="Name is required"), 400

    db = get_db()
    existing = db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        return jsonify(error=f"{username} already has an account"), 409

    cur = db.execute(
        "INSERT INTO users (username, password_hash, is_admin, active, must_change_password, created_at) "
        "VALUES (?, ?, ?, 1, 1, ?)",
        (username, generate_password_hash(config.INITIAL_TEMP_PASSWORD), 1 if is_admin else 0, now()),
    )
    db.commit()
    return jsonify(ok=True, id=cur.lastrowid, temp_password=config.INITIAL_TEMP_PASSWORD)


@app.route("/admin/users/<int:user_id>/toggle-active", methods=["POST"])
@admin_required
def admin_toggle_active(user_id):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        return jsonify(error="Unknown user"), 404
    if user["username"] == session["username"] and user["active"]:
        return jsonify(error="You can't disable your own account while logged in as it"), 400

    new_active = 0 if user["active"] else 1
    db.execute("UPDATE users SET active = ? WHERE id = ?", (new_active, user_id))
    db.commit()
    return jsonify(ok=True, active=bool(new_active))


@app.route("/admin/users/<int:user_id>/toggle-admin", methods=["POST"])
@admin_required
def admin_toggle_admin(user_id):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        return jsonify(error="Unknown user"), 404
    if user["username"] == session["username"] and user["is_admin"]:
        return jsonify(error="You can't remove your own admin access"), 400

    new_is_admin = 0 if user["is_admin"] else 1
    db.execute("UPDATE users SET is_admin = ? WHERE id = ?", (new_is_admin, user_id))
    db.commit()
    return jsonify(ok=True, is_admin=bool(new_is_admin))


@app.route("/admin/users/<int:user_id>/reset-password", methods=["POST"])
@admin_required
def admin_reset_password(user_id):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        return jsonify(error="Unknown user"), 404

    db.execute(
        "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?",
        (generate_password_hash(config.INITIAL_TEMP_PASSWORD), user_id),
    )
    db.commit()
    return jsonify(ok=True, temp_password=config.INITIAL_TEMP_PASSWORD)


@app.route("/admin/users/<int:user_id>/history")
@admin_required
def admin_user_history(user_id):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        return jsonify(error="Unknown user"), 404
    return jsonify(username=user["username"], history=get_staff_history(db, user["username"]))


@app.route("/api/dispositions")
@login_required
def api_dispositions():
    """Options for the Disposition field's suggestion list (Decedent
    Information / edit forms) -- see disposition_options. The field stays
    free-text underneath, so anything not in this list can still be typed
    in by hand."""
    db = get_db()
    rows = db.execute("SELECT label FROM disposition_options ORDER BY id").fetchall()
    return jsonify(options=[r["label"] for r in rows])


@app.route("/admin/dispositions/create", methods=["POST"])
@admin_required
def admin_create_disposition():
    data = request.get_json(force=True)
    label = (data.get("label") or "").strip()
    if not label:
        return jsonify(error="Enter a disposition"), 400

    db = get_db()
    existing = db.execute("SELECT 1 FROM disposition_options WHERE label = ?", (label,)).fetchone()
    if existing:
        return jsonify(error=f'"{label}" is already in the list'), 409

    cur = db.execute(
        "INSERT INTO disposition_options (label, created_at) VALUES (?, ?)", (label, now())
    )
    db.commit()
    return jsonify(ok=True, id=cur.lastrowid, label=label)


@app.route("/admin/dispositions/<int:option_id>/delete", methods=["POST"])
@admin_required
def admin_delete_disposition(option_id):
    db = get_db()
    db.execute("DELETE FROM disposition_options WHERE id = ?", (option_id,))
    db.commit()
    return jsonify(ok=True)


@app.route("/admin/repair-inventory-column", methods=["POST"])
@admin_required
def admin_repair_inventory_column():
    """One-off cleanup for columns O (INVENTORY), P (Documents), and R
    (Days in Storage). O/P: rows that got corrupted before this was
    fixed to always write an explicit "Yes"/"NO PROPERTY"/"NO DOCUMENTS"
    (see backfill_inventory_status/backfill_documents_status) --
    previously a blank cell under an already-"Yes" one could get
    overwritten by Google Sheets' own "fill down" suggestion, copying
    one case's Yes link onto unrelated rows. This also fixes an earlier
    version of the app that wrote inventory status into column Q by
    mistake (that's actually a free-text Notes column) -- running this
    moves things to the right column going forward, though any old
    incorrect values already sitting in Q are left alone rather than
    auto-deleted, in case Q also has real staff notes mixed in. R:
    backfills the running/frozen day count for any case that predates
    the Days in Storage feature, or whose count otherwise got out of
    sync. Re-derives the correct value for every tracked case from its
    actual local data and rewrites O, P, and R to match, using whichever
    sheet each case actually lives on (a case keeps its own sheet_id
    even after the current month rolls over)."""
    if not config.GOOGLE_SHEETS_ENABLED:
        return jsonify(error="Google Sheets isn't turned on yet (see config.py)"), 400

    db = get_db()
    cases = db.execute(
        "SELECT id, case_code, sheet_id, created_at, status, released_at FROM cases WHERE sheet_id IS NOT NULL"
    ).fetchall()

    base_url = request.host_url.rstrip("/")
    checked = 0
    fixed = 0
    errors = []
    for case in cases:
        checked += 1
        try:
            sheet_row = _sheets().find_row_for_case(case["sheet_id"], case["case_code"])
            if not sheet_row:
                continue
            has_inventory = db.execute(
                "SELECT 1 FROM inventory_items WHERE case_id = ?", (case["id"],)
            ).fetchone() is not None
            view_url, add_url = _inventory_status_urls(base_url, case["case_code"])
            _sheets().backfill_inventory_status(case["sheet_id"], sheet_row, has_inventory, view_url, add_url)

            has_documents = db.execute(
                "SELECT 1 FROM case_documents WHERE case_id = ?", (case["id"],)
            ).fetchone() is not None
            doc_view_url, doc_add_url = _documents_status_urls(base_url, case["case_code"])
            _sheets().backfill_documents_status(case["sheet_id"], sheet_row, has_documents, doc_view_url, doc_add_url)

            created_at = datetime.strptime(case["created_at"], "%Y-%m-%d %H:%M:%S")
            ended_at = None
            if case["status"] == "released" and case["released_at"]:
                ended_at = datetime.strptime(case["released_at"], "%Y-%m-%d %H:%M:%S")
            _sheets().backfill_storage_days(case["sheet_id"], sheet_row, created_at, ended_at)
            fixed += 1
        except Exception as e:
            errors.append(f"{case['case_code']}: {e}")

    return jsonify(ok=True, checked=checked, fixed=fixed, errors=errors)


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


def _maybe_auto_adopt_new_month_sheet(db):
    """Checks whether a new calendar month has started and, if so, tries
    to auto-adopt the sheet the Apps Script rollover (see
    apps_script/monthly_sheet_rollover.gs) should have already created
    and shared for it -- so new intakes land on the right sheet without
    anyone needing to visit Admin. Called at the two points that actually
    pull a NEW case number (Start New Case, and claiming a blank field
    tag); every other action keeps working fine off whichever sheet each
    existing case already remembers.

    Returns the adopted label on success, or None if nothing changed
    (already on the current month, Sheets disabled, or the new sheet
    isn't found/shared yet -- Admin's manual panel is the fallback for
    that last case)."""
    if not config.GOOGLE_SHEETS_ENABLED:
        return None
    real_month = datetime.now().strftime("%Y-%m")
    if get_setting(db, "current_sheet_month") == real_month:
        return None
    try:
        expected_name = expected_sheet_name(datetime.now())
        found_id = _sheets().find_shared_sheet_by_name(expected_name)
        if found_id:
            _sheets().verify_access(found_id)
            _adopt_sheet(db, found_id, expected_name.title())
            return expected_name.title()
    except Exception:
        pass  # Drive lookup hiccup -- Admin's manual panel still covers this
    return None


@app.route("/api/settings/sheet-status")
@admin_required
def api_sheet_status():
    """Whether it's time to nag for a new monthly spreadsheet -- compares
    the real calendar month against the month the current sheet was set
    for. Lives on the Admin page: new intakes auto-adopt the new month's
    sheet on their own (see _maybe_auto_adopt_new_month_sheet), so this
    manual panel is only needed as a fallback when that automation didn't
    run or the share step failed for some reason.
    """
    db = get_db()
    real_month = datetime.now().strftime("%Y-%m")
    auto_adopted_label = _maybe_auto_adopt_new_month_sheet(db)
    needs_new_sheet = get_setting(db, "current_sheet_month") != real_month

    return jsonify(
        needs_new_sheet=needs_new_sheet,
        current_sheet_id=current_sheet_id(db),
        current_sheet_label=get_setting(db, "current_sheet_label"),
        current_month=real_month,
        auto_adopted_label=auto_adopted_label,
    )


@app.route("/api/settings/sheet", methods=["POST"])
@admin_required
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


def _release_orphaned_field_alias(db, case_code):
    """If case_code was already claimed by a blank field tag (see
    _resolve_field_tag above), but is now getting its real info from
    somewhere else entirely -- typed straight into the sheet -- that
    claim is orphaned: the physical tag was never actually applied to
    this decedent. Release it so the tag is free to claim a fresh
    number next time it's actually scanned, instead of permanently
    pointing at a decedent it was never used for."""
    alias = db.execute(
        "SELECT placeholder_code FROM tag_aliases WHERE real_case_code = ?", (case_code,)
    ).fetchone()
    if alias:
        db.execute("DELETE FROM tag_aliases WHERE placeholder_code = ?", (alias["placeholder_code"],))
        print(f"[auto-sync] released field-tag claim {alias['placeholder_code']} for {case_code} (filled in manually)")


def run_sheet_sync(db, base_url):
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

    Runs automatically right before a blank field tag claims its case
    number (see _resolve_field_tag, base_url from the live request) and
    on the background loop's own timer (base_url from config.PUBLIC_HOST,
    since there's no request to read one from there).
    """
    sid = current_sheet_id(db)
    rows = _sheets().read_rows(sid)

    synced = []
    for row_num, cols in rows:
        case_code = cols[0].strip()
        date_str, time_received, name, funeral_home, removal_type, disposition, removal_by, night = (
            cols[1].strip(), cols[2].strip(), cols[3].strip(), cols[4].strip(),
            cols[5].strip(), cols[6].strip(), cols[7].strip(), cols[8].strip(),
        )
        if not (name and funeral_home and date_str):
            continue  # not fully filled in yet -- wait until name, funeral home, AND date are all there

        existing = db.execute(
            "SELECT id, name, funeral_home, pickup_date, status FROM cases WHERE case_code = ?", (case_code,)
        ).fetchone()
        if existing is not None:
            # Already tracked locally -- but it may be a stray blank/
            # incomplete record (e.g. created under the old rule above,
            # which only required ONE of name/funeral home/date instead
            # of all three, or from a tag scanned in the field before any
            # info was typed in) that the sheet has since caught up to.
            # Fill it in now rather than leaving it stuck blank forever.
            if (
                existing["status"] in ("pending_info", "pending_location")
                and not (existing["name"] and existing["funeral_home"] and existing["pickup_date"])
            ):
                db.execute(
                    "UPDATE cases SET name = ?, funeral_home = ?, pickup_date = ?, status = 'pending_location' WHERE id = ?",
                    (name, funeral_home, parse_date_from_sheet(date_str), existing["id"]),
                )
                _release_orphaned_field_alias(db, case_code)
                db.commit()
            # The column N link may also never have actually been written
            # (e.g. an earlier sync attempt got interrupted), so make
            # sure that's there too before moving on -- without this, a
            # case stuck in that state would be skipped forever instead
            # of ever getting fixed. cols[13] (column N) came back in the
            # same bulk read as everything else, so this is free -- no
            # extra API call needed just to check.
            if not cols[13].strip():
                try:
                    target_url = f"{base_url}/case/{quote(case_code, safe='')}"
                    _sheets().backfill_case_link(sid, row_num, target_url)
                except Exception:
                    pass
            continue

        pickup_date = parse_date_from_sheet(date_str)
        created_at = now()
        db.execute(
            """INSERT INTO cases
               (case_code, name, funeral_home, pickup_date, status, created_at, sheet_id,
                time_received, removal_type, disposition, removal_by, night)
               VALUES (?, ?, ?, ?, 'pending_location', ?, ?, ?, ?, ?, ?, ?)""",
            (
                case_code, name or None, funeral_home or None, pickup_date, created_at, sid,
                time_received or None, removal_type or None, disposition or None,
                removal_by or None, night or None,
            ),
        )
        _release_orphaned_field_alias(db, case_code)
        db.commit()

        if not cols[13].strip():
            try:
                target_url = f"{base_url}/case/{quote(case_code, safe='')}"
                _sheets().backfill_case_link(sid, row_num, target_url)
            except Exception:
                pass  # the local record is what matters -- the sheet link is a convenience shortcut

        try:
            view_url, add_url = _inventory_status_urls(base_url, case_code)
            _sheets().backfill_inventory_status(sid, row_num, False, view_url, add_url)
        except Exception:
            pass  # not worth failing the whole sync over -- the admin repair action covers stragglers

        try:
            doc_view_url, doc_add_url = _documents_status_urls(base_url, case_code)
            _sheets().backfill_documents_status(sid, row_num, False, doc_view_url, doc_add_url)
        except Exception:
            pass  # not worth failing the whole sync over -- the admin repair action covers stragglers

        try:
            _sheets().backfill_storage_days(sid, row_num, datetime.strptime(created_at, "%Y-%m-%d %H:%M:%S"))
        except Exception:
            pass  # not worth failing the whole sync over -- the admin repair action covers stragglers

        synced.append({"case_code": case_code, "name": name or None})

    return synced


def _background_sync_loop():
    """Runs run_sheet_sync automatically every
    config.SHEET_SYNC_INTERVAL_MINUTES, so a decedent typed straight into
    the sheet gets an armband tag/QR/board tracking within a few minutes
    even between blank-tag scans (see _resolve_field_tag for the other,
    on-demand trigger) -- and, in the same cycle, releases any blank
    field-tag claims that have sat unused past
    config.RELEASE_STALE_CLAIMS_AFTER_MINUTES (see
    release_stale_field_claims above). Own thread, own DB connection --
    Flask's request-scoped get_db() isn't usable outside an actual
    request."""
    while True:
        time.sleep(config.SHEET_SYNC_INTERVAL_MINUTES * 60)
        if not config.GOOGLE_SHEETS_ENABLED:
            continue
        try:
            db = sqlite3.connect(DB_PATH)
            db.row_factory = sqlite3.Row
            released = release_stale_field_claims(db)
            if released:
                codes = ", ".join(released)
                print(f"[auto-sync] released {len(released)} stale field-tag claim(s): {codes}")
            synced = run_sheet_sync(db, config.PUBLIC_HOST)
            db.close()
            if synced:
                codes = ", ".join(c["case_code"] for c in synced)
                print(f"[auto-sync] picked up {len(synced)} manually-entered case(s): {codes}")
        except Exception as e:
            print(f"[auto-sync] failed: {e}")


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
    documents = get_case_documents(db, row["id"]) if row is not None else []
    return render_template(
        "case_detail.html",
        case=row,
        case_code=case_code,
        loc_text=location_text(row),
        primary_status=primary_status_text(row),
        secondary_status=secondary_status_text(row),
        released_date=released_date,
        checked_out_date=checked_out_date,
        history=history,
        flags=flags,
        inventory=inventory,
        documents=documents,
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
    staff = session.get("username") or ""

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
    angles of the same item are just multiple lines.

    When several photos are captured back to back (see scan.js's
    multi-capture queue) and saved together, each one is submitted as
    its own call to this route with its own captured_at -- the exact
    moment that particular photo was taken, not when the batch happened
    to finish uploading -- so each item's timestamp reflects reality
    even if there were several seconds/minutes between shots."""
    db = get_db()
    case = db.execute("SELECT id, name, sheet_id FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None:
        return jsonify(error="Unknown case code"), 404

    description = (request.form.get("description") or "").strip()
    staff = session.get("username") or ""
    photo = request.files.get("photo")
    captured_at = (request.form.get("captured_at") or "").strip()

    if not description and not (photo and photo.filename):
        return jsonify(error="Enter a description or attach a photo"), 400

    timestamp = now()
    if captured_at:
        try:
            datetime.strptime(captured_at, "%Y-%m-%d %H:%M:%S")
            timestamp = captured_at
        except ValueError:
            pass  # malformed -- fall back to server time rather than reject the item
    photo_filename = None
    if photo and photo.filename:
        photo_filename, err = _save_inventory_photo(photo, case_code, case["name"], timestamp)
        if err:
            return jsonify(error=err), 400

    db.execute(
        "INSERT INTO inventory_items (case_id, description, photo_filename, created_at, staff) "
        "VALUES (?, ?, ?, ?, ?)",
        (case["id"], description or None, photo_filename, timestamp, staff),
    )
    db.commit()

    sheet_warning = None
    if config.GOOGLE_SHEETS_ENABLED:
        try:
            sid = case_sheet_id(db, case)
            sheet_row = _sheets().find_row_for_case(sid, case_code)
            if sheet_row and not _sheets().row_has_inventory_flag(sid, sheet_row):
                view_url, add_url = _inventory_status_urls(request.host_url.rstrip("/"), case_code)
                _sheets().backfill_inventory_status(sid, sheet_row, True, view_url, add_url)
        except Exception as e:
            # First inventory item already saved locally either way -- a
            # sheet write hiccup here shouldn't block staff from
            # continuing to log items.
            sheet_warning = f"Saved locally, but sheet write failed: {e}"

    resp = dict(ok=True, items=get_inventory_items(db, case["id"]))
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(**resp)


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


@app.route("/api/case/<case_code>/documents")
@login_required
def api_list_documents(case_code):
    """Scanned paperwork (face sheets, first call sheets, etc.) logged
    for a decedent -- backs the scan station's Scan Document mode."""
    db = get_db()
    case = db.execute("SELECT id FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None:
        return jsonify(error="Unknown case code"), 404
    return jsonify(items=get_case_documents(db, case["id"]))


@app.route("/api/case/<case_code>/documents", methods=["POST"])
@login_required
def api_add_document(case_code):
    """Adds one scanned document: a type/label (Face Sheet, First Call
    Sheet, etc.), a required photo, and whoever scanned it. Same
    multi-capture-friendly shape as api_add_inventory -- each photo in a
    batch is its own call with its own captured_at."""
    db = get_db()
    case = db.execute("SELECT id, name, sheet_id FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None:
        return jsonify(error="Unknown case code"), 404

    doc_type = (request.form.get("doc_type") or "").strip()
    staff = session.get("username") or ""
    photo = request.files.get("photo")
    captured_at = (request.form.get("captured_at") or "").strip()

    if not photo or not photo.filename:
        return jsonify(error="Attach a photo of the document"), 400

    timestamp = now()
    if captured_at:
        try:
            datetime.strptime(captured_at, "%Y-%m-%d %H:%M:%S")
            timestamp = captured_at
        except ValueError:
            pass  # malformed -- fall back to server time rather than reject the item

    photo_filename, err = _save_document_photo(photo, case_code, case["name"], timestamp)
    if err:
        return jsonify(error=err), 400

    db.execute(
        "INSERT INTO case_documents (case_id, doc_type, photo_filename, created_at, staff) "
        "VALUES (?, ?, ?, ?, ?)",
        (case["id"], doc_type or None, photo_filename, timestamp, staff),
    )
    db.commit()

    sheet_warning = None
    if config.GOOGLE_SHEETS_ENABLED:
        try:
            sid = case_sheet_id(db, case)
            sheet_row = _sheets().find_row_for_case(sid, case_code)
            if sheet_row and not _sheets().row_has_documents_flag(sid, sheet_row):
                view_url, add_url = _documents_status_urls(request.host_url.rstrip("/"), case_code)
                _sheets().backfill_documents_status(sid, sheet_row, True, view_url, add_url)
        except Exception as e:
            # First document already saved locally either way -- a
            # sheet write hiccup here shouldn't block staff from
            # continuing to scan more pages.
            sheet_warning = f"Saved locally, but sheet write failed: {e}"

    resp = dict(ok=True, items=get_case_documents(db, case["id"]))
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(**resp)


@app.route("/api/documents/<int:doc_id>/delete", methods=["POST"])
@login_required
def api_delete_document(doc_id):
    """Removes one scanned document (and its photo file) -- for a
    mis-scanned or duplicate page."""
    db = get_db()
    item = db.execute("SELECT * FROM case_documents WHERE id = ?", (doc_id,)).fetchone()
    if item is None:
        return jsonify(error="Unknown document"), 404

    if item["photo_filename"]:
        photo_path = CASE_DOCUMENTS_PATH / item["photo_filename"]
        photo_path.unlink(missing_ok=True)

    db.execute("DELETE FROM case_documents WHERE id = ?", (doc_id,))
    db.commit()

    return jsonify(ok=True, items=get_case_documents(db, item["case_id"]))


@app.route("/api/documents/<int:doc_id>/photo")
@login_required
def document_photo(doc_id):
    """Serves one scanned document's photo, looked up by id."""
    db = get_db()
    item = db.execute(
        "SELECT photo_filename FROM case_documents WHERE id = ?", (doc_id,)
    ).fetchone()
    if item is None or not item["photo_filename"]:
        return jsonify(error="No photo for this document"), 404
    photo_path = CASE_DOCUMENTS_PATH / item["photo_filename"]
    if not photo_path.is_file():
        return jsonify(error="Photo file missing"), 404
    return app.response_class(photo_path.read_bytes(), mimetype="image/jpeg")


@app.route("/documents/<int:doc_id>/print")
@login_required
def print_single_document_page(doc_id):
    """Printable page for one scanned document -- for pulling just, say,
    the ID card or authorization form out of a case's paperwork instead
    of printing everything."""
    db = get_db()
    item = db.execute(
        "SELECT cd.*, c.case_code, c.name FROM case_documents cd "
        "JOIN cases c ON c.id = cd.case_id WHERE cd.id = ?",
        (doc_id,),
    ).fetchone()
    if item is None:
        return jsonify(error="Unknown document"), 404
    return render_template(
        "print_single_photo.html",
        page_title=item["doc_type"] or "Document",
        heading=item["doc_type"] or "(untitled document)",
        case_code=item["case_code"],
        name=item["name"],
        photo_url=url_for("document_photo", doc_id=doc_id),
        when=_format_when(item["created_at"]),
        staff=item["staff"],
    )


@app.route("/case/<case_code>/print-documents")
@login_required
def case_print_documents_page(case_code):
    """Printable page of every scanned document for this case (office
    printer) -- for handing over or filing the whole set at once."""
    db = get_db()
    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None:
        return jsonify(error="Unknown case code"), 404
    items = [
        {**item, "photo_url": url_for("document_photo", doc_id=item["id"])}
        for item in get_case_documents(db, case["id"])
    ]
    return render_template(
        "case_print_documents.html",
        case=case,
        case_code=case_code,
        items=items,
    )


@app.route("/inventory/<int:item_id>/print")
@login_required
def print_single_inventory_photo_page(item_id):
    """Printable page for one inventory item's photo -- the single-item
    counterpart to case_print_inventory_page's print-everything view."""
    db = get_db()
    item = db.execute(
        "SELECT ii.*, c.case_code, c.name FROM inventory_items ii "
        "JOIN cases c ON c.id = ii.case_id WHERE ii.id = ?",
        (item_id,),
    ).fetchone()
    if item is None or not item["photo_filename"]:
        return jsonify(error="No photo for this item"), 404
    return render_template(
        "print_single_photo.html",
        page_title=item["description"] or "Inventory Photo",
        heading=item["description"] or "(photo only)",
        case_code=item["case_code"],
        name=item["name"],
        photo_url=url_for("inventory_photo", item_id=item_id),
        when=_format_when(item["created_at"]),
        staff=item["staff"],
    )


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


@app.route("/case/<case_code>/print-label")
@login_required
def case_print_label_page(case_code):
    """Printable armband tag sized for the NELKO PM230 thermal sticker
    printer's 54mm roll -- QR code stacked above name/funeral home/date/
    case code, narrow enough to fit the roll width. Separate from
    case_print_page's landscape layout, which is sized for a regular
    office printer instead."""
    db = get_db()
    row = get_case_with_location(db, case_code)
    if row is None:
        return jsonify(error="Unknown case code -- start intake first"), 404
    return render_template(
        "case_print_label.html",
        case=row,
        case_code=case_code,
        pickup_date=format_date_for_sheet(row["pickup_date"]),
    )


def _paginate_evenly(items, max_per_page):
    """Splits items into pages of at most max_per_page each, spreading
    a remainder evenly across pages instead of cramming every page full
    and leaving a nearly-empty last one -- e.g. 6 items at max 4 becomes
    two pages of 3 (not a full page of 4 plus a page of 2)."""
    if not items:
        return []
    num_pages = (len(items) + max_per_page - 1) // max_per_page
    base, remainder = divmod(len(items), num_pages)
    pages = []
    i = 0
    for p in range(num_pages):
        count = base + (1 if p < remainder else 0)
        pages.append(items[i : i + count])
        i += count
    return pages


@app.route("/case/<case_code>/print-inventory")
@login_required
def case_print_inventory_page(case_code):
    """Printable page of every inventory photo logged for this case, for
    a staff member to keep with the file or hand over alongside the
    decedent's property. Office printer only -- there's no label-printer
    equivalent, since these are full photos, not a small tag. Four
    photos per page, laid out 2x2 -- see _paginate_evenly for how a
    count that doesn't divide evenly by 4 gets balanced across pages."""
    db = get_db()
    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None:
        return jsonify(error="Unknown case code"), 404
    items = [i for i in get_inventory_items(db, case["id"]) if i["has_photo"]]
    return render_template(
        "case_print_inventory.html",
        case=case,
        case_code=case_code,
        items=items,
        pages=_paginate_evenly(items, 4),
    )


def _cremation_tag_data(db, row):
    """Pickup date (falling back to created_at) and the date this case's
    current shelf was reached -- shared by the printable page and the
    downloadable image, since both show the same information."""
    staged_since = None
    move_row = db.execute(
        "SELECT timestamp FROM moves WHERE case_id = ? AND action IN ('placed', 'moved') "
        "ORDER BY timestamp DESC, id DESC LIMIT 1",
        (row["id"],),
    ).fetchone()
    if move_row:
        try:
            dt = datetime.strptime(move_row["timestamp"], "%Y-%m-%d %H:%M:%S")
            staged_since = f"{dt.month}/{dt.day}/{dt.strftime('%y')}"
        except ValueError:
            pass

    if row["pickup_date"]:
        received_date = format_date_for_sheet(row["pickup_date"])
    else:
        try:
            dt = datetime.strptime(row["created_at"], "%Y-%m-%d %H:%M:%S")
            received_date = f"{dt.month}/{dt.day}/{dt.strftime('%y')}"
        except (ValueError, TypeError):
            received_date = None

    return received_date, staged_since


@app.route("/case/<case_code>/print-cremation-sticker")
@login_required
def case_print_cremation_page(case_code):
    """Printable sticker for the cremation container itself -- sized for
    Avery 5146 name badge sheets. Same QR/case link as the armband tag,
    so scanning either one at Cremate time works identically; only
    offered on the board when the decedent's current shelf is in the
    Cremation Staging screen (see board.js)."""
    db = get_db()
    row = get_case_with_location(db, case_code)
    if row is None:
        return jsonify(error="Unknown case code -- start intake first"), 404

    received_date, staged_since = _cremation_tag_data(db, row)

    return render_template(
        "case_print_cremation.html",
        case=row,
        case_code=case_code,
        pickup_date=received_date,
        staged_since=staged_since,
    )


@app.route("/case/<case_code>/cremation-tag-image")
@login_required
def case_cremation_tag_image(case_code):
    """Same cremation tag content as a flat downloadable PNG instead of
    a browser print page -- for saving straight to a phone's photos, or
    to a desktop file, instead of going through a printer at all."""
    db = get_db()
    row = get_case_with_location(db, case_code)
    if row is None:
        return jsonify(error="Unknown case code -- start intake first"), 404

    received_date, staged_since = _cremation_tag_data(db, row)
    target_url = request.host_url.rstrip("/") + url_for("case_detail_page", case_code=case_code)
    png_bytes = generate_cremation_tag_image(
        case_code, row["name"], row["funeral_home"], received_date, staged_since, target_url
    )
    resp = app.response_class(png_bytes, mimetype="image/png")
    resp.headers["Content-Disposition"] = f"attachment; filename=Cremation_Tag_{case_code}.png"
    return resp


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


@app.route("/location/<location_code>/qr.png")
@login_required
def location_qr_image(location_code):
    """QR image for a shelf/slot location itself -- encodes the raw
    location code text (not a URL), matching what a printed physical
    location tag encodes (see gen_location_qr.py). Scanning it off the
    board's own screen at the scan station's Assign/Move step works
    exactly the same as scanning a physical location tag, for whenever
    that's easier than reaching the actual sticker."""
    png_bytes = generate_qr_png(location_code)
    resp = app.response_class(png_bytes, mimetype="image/png")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route("/api/location/<location_code>/lookup")
@login_required
def api_location_lookup(location_code):
    """Who (if anyone) currently occupies a shelf/slot -- for the scan
    app's smart-scan flow, so scanning an occupied shelf's own QR code
    shows that decedent's info directly instead of only being usable as
    a move/assign destination."""
    db = get_db()
    loc = db.execute("SELECT * FROM locations WHERE code = ?", (location_code,)).fetchone()
    if loc is None:
        return jsonify(error="Unknown location"), 404
    occupants = db.execute(
        "SELECT case_code, name, funeral_home, pickup_date, status FROM cases WHERE location_id = ? AND status = 'placed'",
        (loc["id"],),
    ).fetchall()
    return jsonify(
        location_code=loc["code"],
        cooler_name=loc["cooler_name"],
        shelf=loc["shelf"],
        slot=loc["slot"],
        occupants=[dict(o) for o in occupants],
    )


@app.route("/api/case/<case_code>/scan-timestamp")
@login_required
def api_case_scan_timestamp(case_code):
    """When this case was last scanned anywhere (see _last_scan_times) --
    the Cooler Board's detail popup polls this while open so a shared-
    screen display can close itself the moment someone actually scans
    the tag it's showing (e.g. with their own phone), instead of sitting
    open until someone remembers to close it by hand."""
    return jsonify(last_scanned=_last_scan_times.get(case_code))


@app.route("/api/cases/search")
@login_required
def api_cases_search():
    """Every case (any status) matching a name/case-number substring --
    for the scan app's Find Decedent search. Unlike /api/board (which
    only reflects who's currently occupying a shelf), this also finds a
    case that isn't placed yet or is temporarily checked out."""
    q = (request.args.get("q") or "").strip().lower()
    if not q:
        return jsonify([])
    db = get_db()
    rows = db.execute(
        "SELECT case_code, name, funeral_home, status FROM cases "
        "WHERE LOWER(name) LIKE ? OR LOWER(case_code) LIKE ? "
        "ORDER BY created_at DESC LIMIT 20",
        (f"%{q}%", f"%{q}%"),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


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

    _last_scan_times[case_code] = time.time()

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
    staff = session.get("username") or ""
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
    staff = session.get("username") or ""
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
    staff = session.get("username") or ""
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
    staff = session.get("username") or ""
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
                _sheets().set_case_link_dead(sid, sheet_row)
                # Freeze column R (Days in Storage) as of right now --
                # billing stops the day of release/cremation, so this
                # should never keep counting up after this point.
                created_at = datetime.strptime(case["created_at"], "%Y-%m-%d %H:%M:%S")
                _sheets().backfill_storage_days(sid, sheet_row, created_at, datetime.now())
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
    staff = session.get("username") or ""
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
                _sheets().set_case_checked_out_color(sid, sheet_row, True)
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
    staff = session.get("username") or ""
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
                _sheets().set_case_checked_out_color(sid, sheet_row, False)
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
    _maybe_auto_adopt_new_month_sheet(db)
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
                    sid, sheet_row, format_time_for_sheet(time_received), removal_type, disposition, removal_by, night
                )
                if not _sheets().row_has_case_link(sid, sheet_row):
                    target_url = request.host_url.rstrip("/") + url_for(
                        "case_detail_page", case_code=case_code
                    )
                    _sheets().backfill_case_link(sid, sheet_row, target_url)
                # Initialize column O (INVENTORY) explicitly (NO PROPERTY,
                # not blank) as soon as the row exists -- see
                # backfill_inventory_status for why leaving it blank is
                # what causes Sheets to offer to "fill down" a neighboring
                # row's Yes link into it.
                has_inventory = db.execute(
                    "SELECT 1 FROM inventory_items WHERE case_id = ?", (row["id"],)
                ).fetchone() is not None
                view_url, add_url = _inventory_status_urls(request.host_url.rstrip("/"), case_code)
                _sheets().backfill_inventory_status(sid, sheet_row, has_inventory, view_url, add_url)
                # Same idea for column P (Documents).
                has_documents = db.execute(
                    "SELECT 1 FROM case_documents WHERE case_id = ?", (row["id"],)
                ).fetchone() is not None
                doc_view_url, doc_add_url = _documents_status_urls(request.host_url.rstrip("/"), case_code)
                _sheets().backfill_documents_status(sid, sheet_row, has_documents, doc_view_url, doc_add_url)
                # Column R (Days in Storage) starts counting from when
                # this case was first created -- see backfill_storage_days.
                created_at = datetime.strptime(row["created_at"], "%Y-%m-%d %H:%M:%S")
                _sheets().backfill_storage_days(sid, sheet_row, created_at)
        except Exception as e:
            # Local save already succeeded -- don't fail the whole request
            # over a sheet write hiccup, just tell the caller it happened.
            row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
            return jsonify(
                ok=True, case=dict(row), sheet_warning=f"Saved locally, but sheet write failed: {e}"
            )

    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    return jsonify(ok=True, case=dict(row))


@app.route("/api/sheet-intake/link-tag", methods=["POST"])
@login_required
def api_sheet_intake_link_tag():
    """
    Links a pre-printed blank field tag (see gen_field_tags.py) to the
    case just created via Sheets intake, for staff who hand-write the
    decedent's info onto a physical tag instead of printing a new one.

    This is deliberately NOT the same path as _resolve_field_tag/
    /api/case/lookup: that flow claims whatever the NEXT unclaimed sheet
    row happens to be for a freshly-scanned placeholder, which would
    hand out a different case number than the one already created and
    filled in here. This just records that a specific already-known
    case_code IS the real identity behind a specific scanned placeholder.
    """
    data = request.get_json(force=True)
    case_code = (data.get("case_code") or "").strip()
    placeholder_code = (data.get("placeholder_code") or "").strip()

    if not case_code or not placeholder_code:
        return jsonify(error="Missing case_code or placeholder_code"), 400
    if not placeholder_code.startswith(config.FIELD_TAG_PREFIX):
        return jsonify(error=f"That's not a blank field tag (expected a {config.FIELD_TAG_PREFIX}... code)"), 400

    db = get_db()
    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None:
        return jsonify(error="Unknown case code -- start intake first"), 404

    existing_alias = db.execute(
        "SELECT real_case_code FROM tag_aliases WHERE placeholder_code = ?", (placeholder_code,)
    ).fetchone()
    if existing_alias and existing_alias["real_case_code"] != case_code:
        return jsonify(error=f"That tag is already linked to case {existing_alias['real_case_code']}"), 409
    already_used_directly = db.execute(
        "SELECT 1 FROM cases WHERE case_code = ?", (placeholder_code,)
    ).fetchone()
    if already_used_directly is not None:
        return jsonify(error=f"{placeholder_code} is itself an active case, not a blank tag"), 409

    if not existing_alias:
        db.execute(
            "INSERT INTO tag_aliases (placeholder_code, real_case_code, created_at) VALUES (?, ?, ?)",
            (placeholder_code, case_code, now()),
        )
        db.commit()

    return jsonify(ok=True, case_code=case_code, placeholder_code=placeholder_code)


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
    if config.GOOGLE_SHEETS_ENABLED:
        threading.Thread(target=_background_sync_loop, daemon=True).start()
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
