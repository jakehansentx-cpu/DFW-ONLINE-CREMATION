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

import config

app = Flask(__name__)
DB_PATH = "cooler.db"


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
            location_id INTEGER REFERENCES locations(id),
            created_at TEXT NOT NULL,
            released_at TEXT,
            released_to TEXT  -- who/where a released decedent went
        );

        CREATE TABLE IF NOT EXISTS moves (
            id INTEGER PRIMARY KEY,
            case_id INTEGER NOT NULL REFERENCES cases(id),
            from_location_id INTEGER REFERENCES locations(id),
            to_location_id INTEGER REFERENCES locations(id),
            action TEXT NOT NULL, -- placed / moved / released
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_log (
            client_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL
        );
        """
    )
    # Migrate DBs created before "screen" / "released_to" existed.
    _ensure_column(db, "locations", "screen", "TEXT")
    _ensure_column(db, "cases", "released_to", "TEXT")
    db.commit()

    # Ensure every location in config.py exists in the DB, WITHOUT ever
    # touching rows that are already there -- a live system's placement
    # history depends on those rows' ids staying put. This means adding a
    # new cooler (like Cremation Staging) to config.py just adds the new
    # rows in place on the next restart; nothing gets wiped or reseeded.
    added = 0
    for cooler in config.COOLERS:
        shared = 1 if cooler.get("shared") else 0
        screen = cooler.get("screen") or cooler["name"]
        db.execute(
            "UPDATE locations SET cooler_name = ?, shared = ?, screen = ? WHERE cooler_code = ?",
            (cooler["name"], shared, screen, cooler["code"]),
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
                           (code, cooler_name, cooler_code, shelf, slot, shared, screen)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (code, cooler["name"], cooler["code"], shelf_num, slot, shared, screen),
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


def generate_qr_png(data):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ------------------------------------------------------------------- pages --
@app.route("/")
@login_required
def index():
    return render_template("board.html", screens=config.BOARD_SCREENS)


@app.route("/board")
@login_required
def board_page():
    return render_template("board.html", screens=config.BOARD_SCREENS)


@app.route("/scan")
@login_required
def scan_page():
    return render_template("scan.html")


@app.route("/case/<case_code>")
@login_required
def case_detail_page(case_code):
    """
    What a printed armband QR code opens to -- any phone's default camera
    app can scan it straight into this page (after the usual passcode
    gate). Shows name, funeral home, pickup date, and the CURRENT
    shelf/slot, looked up live so it's never stale if the decedent moves.
    """
    db = get_db()
    row = get_case_with_location(db, case_code)
    return render_template(
        "case_detail.html", case=row, case_code=case_code, loc_text=location_text(row)
    )


@app.route("/case/<case_code>/print")
@login_required
def case_print_page(case_code):
    """Printable armband tag: QR code + human-readable case/name text."""
    db = get_db()
    row = get_case_with_location(db, case_code)
    if row is None:
        return jsonify(error="Unknown case code -- start intake first"), 404
    return render_template("case_print.html", case=row, case_code=case_code)


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
               l.screen, c.case_code, c.name, c.funeral_home, c.pickup_date, c.status
        FROM locations l
        LEFT JOIN cases c ON c.location_id = l.id AND c.status = 'placed'
        ORDER BY l.cooler_code, l.shelf, l.slot
        """
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
        ORDER BY l.cooler_code, l.shelf, l.slot
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
    """Scan a Case ID tag. Creates the case record if it's brand new."""
    data = request.get_json(force=True)
    case_code = (data.get("case_code") or "").strip()
    if not case_code:
        return jsonify(error="No case code scanned"), 400

    db = get_db()
    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if row is None:
        db.execute(
            "INSERT INTO cases (case_code, status, created_at) VALUES (?, 'pending_info', ?)",
            (case_code, now()),
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
            sheet_row = _sheets().find_row_for_case(case_code)
            if sheet_row:
                _sheets().backfill_intake(
                    sheet_row, format_date_for_sheet(pickup_date), name, funeral_home
                )
        except Exception as e:
            sheet_warning = f"Saved locally, but sheet write failed: {e}"

    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    resp = dict(row)
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(resp)


def _backfill_case_location(case_code, loc):
    """Writes a case's current location into the sheet -- shared by both
    Assign (first placement) and Move (relocation), so a moved decedent's
    COOLER LOCATION column stays accurate instead of only reflecting
    wherever they were FIRST placed."""
    if not config.GOOGLE_SHEETS_ENABLED:
        return None
    try:
        sheet_row = _sheets().find_row_for_case(case_code)
        if sheet_row:
            loc_text = f"{loc['cooler_name']} - Shelf {loc['shelf']}{loc['slot'] or ''}"
            _sheets().backfill_location(sheet_row, loc_text)
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
        "INSERT INTO moves (case_id, from_location_id, to_location_id, action, timestamp) VALUES (?, NULL, ?, 'placed', ?)",
        (case["id"], loc["id"], now()),
    )
    db.commit()

    sheet_warning = _backfill_case_location(case_code, loc)

    resp = dict(ok=True, case_code=case_code, location_code=location_code)
    if sheet_warning:
        resp["sheet_warning"] = sheet_warning
    return jsonify(**resp)


@app.route("/api/move", methods=["POST"])
@login_required
def api_move():
    """Relocate an already-placed case to a new location."""
    data = request.get_json(force=True)
    case_code = data.get("case_code")
    location_code = data.get("location_code")
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

    old_loc_id = case["location_id"]
    db.execute("UPDATE cases SET location_id = ? WHERE id = ?", (new_loc["id"], case["id"]))
    db.execute(
        "INSERT INTO moves (case_id, from_location_id, to_location_id, action, timestamp) VALUES (?, ?, ?, 'moved', ?)",
        (case["id"], old_loc_id, new_loc["id"], now()),
    )
    db.commit()

    sheet_warning = _backfill_case_location(case_code, new_loc)

    resp = dict(ok=True, case_code=case_code, location_code=location_code)
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
    released_to = (data.get("released_to") or "").strip()
    db = get_db()

    case = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if case is None or case["status"] != "placed":
        return jsonify(error="Case is not currently placed"), 400

    db.execute(
        "UPDATE cases SET status = 'released', released_at = ?, released_to = ? WHERE id = ?",
        (now(), released_to, case["id"]),
    )
    db.execute(
        "INSERT INTO moves (case_id, from_location_id, to_location_id, action, timestamp) VALUES (?, ?, NULL, 'released', ?)",
        (case["id"], case["location_id"], now()),
    )
    db.commit()

    sheet_warning = None
    if config.GOOGLE_SHEETS_ENABLED and released_to:
        try:
            sheet_row = _sheets().find_row_for_case(case_code)
            if sheet_row:
                _sheets().backfill_released_to(sheet_row, released_to)
        except Exception as e:
            sheet_warning = f"Released locally, but sheet write failed: {e}"

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
            """INSERT INTO cases (case_code, name, funeral_home, pickup_date, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (case_code, name, funeral_home, pickup_date, new_status, now()),
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

    try:
        row_num, case_code = _sheets().find_next_unclaimed_case()
    except Exception as e:
        return jsonify(error=f"Couldn't reach the spreadsheet: {e}"), 502

    if case_code is None:
        return jsonify(error="No unclaimed case numbers found in the sheet -- add more rows"), 404

    db = get_db()
    existing = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if existing is None:
        db.execute(
            "INSERT INTO cases (case_code, status, created_at) VALUES (?, 'pending_info', ?)",
            (case_code, now()),
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

    if not case_code:
        return jsonify(error="Missing case_code"), 400

    db = get_db()
    row = db.execute("SELECT * FROM cases WHERE case_code = ?", (case_code,)).fetchone()
    if row is None:
        return jsonify(error="Unknown case code -- start intake first"), 404

    db.execute(
        "UPDATE cases SET name = ?, funeral_home = ?, pickup_date = ?, status = 'pending_location' WHERE case_code = ?",
        (name, funeral_home, pickup_date, case_code),
    )
    db.commit()

    if config.GOOGLE_SHEETS_ENABLED:
        try:
            sheet_row = data.get("sheet_row")
            if not sheet_row:
                sheet_row = _sheets().find_row_for_case(case_code)
            if sheet_row:
                _sheets().backfill_intake(
                    sheet_row, format_date_for_sheet(pickup_date), name, funeral_home
                )
                # QR column: only generate/upload once per case -- once a
                # row has a QR image, re-saving edited info shouldn't spam
                # Drive with a new upload every time.
                if not _sheets().row_has_qr(sheet_row):
                    target_url = request.host_url.rstrip("/") + url_for(
                        "case_detail_page", case_code=case_code
                    )
                    png_bytes = generate_qr_png(target_url)
                    drive_url = _sheets().upload_qr_to_drive(case_code, png_bytes)
                    _sheets().backfill_qr(sheet_row, drive_url)
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
