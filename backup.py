#!/usr/bin/env python3
"""
Automated backup: the case database, inventory/document photos, and an
offline .xlsx copy of every Google Sheet this app has ever used, onto
an external drive mounted at config.BACKUP_MOUNT_DIR.

Run on a schedule by cooler-backup.timer (see README's backup setup
section) -- this is a standalone script, never imported by or run
inside the live app itself, so a backup failure can never take the app
down. Each run writes one dated snapshot folder (e.g. 2026-08-08_1600/)
holding everything as of that moment; see cleanup() for how old
snapshots get discarded once they age out or the drive fills up.
"""
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

import config

APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "cooler.db"
SNAPSHOT_NAME_FORMAT = "%Y-%m-%d_%H%M%S"


def log(msg):
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(line)
    try:
        with open(Path(config.BACKUP_MOUNT_DIR) / "backup.log", "a") as f:
            f.write(line + "\n")
    except OSError:
        pass  # drive not mounted -- stdout/journal still has this line


def backup_database(dest_dir):
    """Safe copy of a live SQLite database via sqlite3's own backup
    API, not a raw file copy -- a snapshot mid-write can never be
    caught in a half-written/corrupt state this way."""
    dest = dest_dir / "cooler.db"
    src_conn = sqlite3.connect(str(DB_PATH))
    dest_conn = sqlite3.connect(str(dest))
    with dest_conn:
        src_conn.backup(dest_conn)
    src_conn.close()
    dest_conn.close()
    return dest.stat().st_size


def backup_photos(dest_dir, previous_dir):
    """Copies inventory/document photos into this snapshot, hardlinking
    (instead of re-copying) any file that's byte-identical to the same
    path in the previous snapshot. Each snapshot still looks like (and
    restores as) a complete, independent copy -- hardlinked files are
    ordinary files as far as anything reading them is concerned -- but
    years of 4-hourly snapshots don't multiply actual disk usage by
    however many snapshots exist, since photos are essentially
    write-once and rarely change after being taken. Pure Python (no
    rsync dependency) since that's not guaranteed to be preinstalled."""
    total = 0
    for name in (config.INVENTORY_PHOTOS_DIR, config.CASE_DOCUMENTS_DIR):
        src = APP_DIR / name
        if not src.is_dir():
            continue
        dst = dest_dir / name
        prev = previous_dir / name if previous_dir is not None else None
        for src_file in src.rglob("*"):
            if not src_file.is_file():
                continue
            rel = src_file.relative_to(src)
            dst_file = dst / rel
            dst_file.parent.mkdir(parents=True, exist_ok=True)
            dst_file.unlink(missing_ok=True)  # in case a crashed prior run left a partial file here
            st = src_file.stat()
            prev_file = prev / rel if prev is not None else None
            if (
                prev_file is not None
                and prev_file.is_file()
                and prev_file.stat().st_size == st.st_size
                and int(prev_file.stat().st_mtime) == int(st.st_mtime)
            ):
                os.link(prev_file, dst_file)
            else:
                shutil.copy2(src_file, dst_file)
            total += st.st_size
    return total


def backup_sheets(dest_dir):
    """Exports every Google Sheet this app has ever used (not just the
    current month's) as a standalone .xlsx file -- an independent,
    offline copy that survives even a Google Drive-side incident, on
    top of Drive's own Trash + Version History. One sheet failing to
    export (e.g. no internet at that moment) doesn't stop the others."""
    if not config.GOOGLE_SHEETS_ENABLED:
        return 0
    import sheets_integration as sheets

    conn = sqlite3.connect(str(DB_PATH))
    sheet_ids = [
        row[0]
        for row in conn.execute(
            "SELECT DISTINCT sheet_id FROM cases WHERE sheet_id IS NOT NULL"
        ).fetchall()
    ]
    conn.close()

    sheets_dir = dest_dir / "sheets"
    sheets_dir.mkdir(exist_ok=True)
    total = 0
    for sheet_id in sheet_ids:
        try:
            title = sheets.get_sheet_title(sheet_id) or sheet_id
            safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in title)
            data = sheets.export_sheet_xlsx(sheet_id)
            (sheets_dir / f"{safe_name}.xlsx").write_bytes(data)
            total += len(data)
        except Exception as e:
            log(f"  sheet export failed for {sheet_id}: {e}")
    return total


def list_snapshots(root):
    snapshots = []
    for p in root.iterdir():
        if not p.is_dir():
            continue
        try:
            snap_time = datetime.strptime(p.name, SNAPSHOT_NAME_FORMAT)
        except ValueError:
            continue  # not one of our snapshot folders -- leave it alone
        snapshots.append((snap_time, p))
    return sorted(snapshots)


def cleanup(root):
    """Deletes anything older than BACKUP_RETENTION_DAYS, then keeps
    deleting the OLDEST remaining snapshot(s) -- regardless of age --
    while free space is under BACKUP_MIN_FREE_MB. A drive that's
    genuinely filling up (e.g. photo volume grew faster than expected)
    never just fails; it makes room from the oldest snapshot forward,
    exactly like a ring buffer. The single most recent snapshot is
    never deleted by either rule, no matter how old or how tight space
    is -- there should always be at least one backup on the drive."""
    snapshots = list_snapshots(root)
    if len(snapshots) <= 1:
        return
    newest = snapshots[-1]

    cutoff = datetime.now() - timedelta(days=config.BACKUP_RETENTION_DAYS)
    for snap_time, snap_path in list(snapshots):
        if (snap_time, snap_path) == newest:
            continue
        if snap_time < cutoff:
            log(f"  deleting old backup {snap_path.name} (past {config.BACKUP_RETENTION_DAYS}-day retention)")
            shutil.rmtree(snap_path, ignore_errors=True)
            snapshots.remove((snap_time, snap_path))

    min_free = config.BACKUP_MIN_FREE_MB * 1024 * 1024
    while len(snapshots) > 1 and shutil.disk_usage(root).free < min_free:
        _, oldest = snapshots.pop(0)
        log(f"  deleting {oldest.name} to free up space (drive nearly full)")
        shutil.rmtree(oldest, ignore_errors=True)


def main():
    mount_dir = Path(config.BACKUP_MOUNT_DIR)
    if not os.path.ismount(mount_dir):
        log(
            f"ERROR: {mount_dir} is not a mounted drive -- backup skipped. "
            "Check the drive is plugged in and /etc/fstab is set up (see README)."
        )
        sys.exit(1)

    started = datetime.now()
    # Find the previous snapshot BEFORE creating this run's own -- otherwise
    # a freshly-made, still-empty dest_dir would sort as the "latest"
    # snapshot and get compared against itself, defeating the hardlinking
    # in backup_photos() (every file would look "new" against an empty dir).
    previous = list_snapshots(mount_dir)
    previous_dir = previous[-1][1] if previous else None

    dest_dir = mount_dir / started.strftime(SNAPSHOT_NAME_FORMAT)
    dest_dir.mkdir(parents=True, exist_ok=True)

    log(f"Starting backup -> {dest_dir}")
    try:
        db_size = backup_database(dest_dir)
        log(f"  database: {db_size / 1024:.0f} KB")
    except Exception as e:
        log(f"  database backup FAILED: {e}")

    try:
        photos_size = backup_photos(dest_dir, previous_dir)
        log(f"  photos: {photos_size / 1024 / 1024:.1f} MB")
    except Exception as e:
        log(f"  photo backup FAILED: {e}")

    try:
        sheets_size = backup_sheets(dest_dir)
        log(f"  sheets: {sheets_size / 1024:.0f} KB")
    except Exception as e:
        log(f"  sheet export FAILED: {e}")

    cleanup(mount_dir)
    log(f"Backup finished in {(datetime.now() - started).total_seconds():.1f}s")


if __name__ == "__main__":
    main()
