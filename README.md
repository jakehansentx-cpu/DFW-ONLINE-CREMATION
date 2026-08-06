# Cooler Tracking Whiteboard

Fully local, no internet involved anywhere. Runs off a Python web server on
whatever machine you host it on (Raspberry Pi, mini PC, old laptop) and is
viewed over your own local WiFi/LAN.

## Passcode protection

Every page and every API call requires a shared passcode before it works
— set it in `config.py`:
```python
ACCESS_PASSCODE = "changeme123"
```
**Change this before real use.** Anyone with the passcode and network
access (LAN or Tailscale) can see decedent names and funeral homes, so
treat it like a real password, not a formality. Sessions last about a
year once someone logs in on a device, so this isn't a "log in every
time" hassle — one gate per device/browser, then it's remembered.
`/logout` clears it on that device if you ever need to.

## Google Sheets intake

The scan page has a "New Case (Sheet)" mode: instead of scanning a
pre-printed Case ID tag, it pulls the next unclaimed case number from
Column A of your Google Sheet (the first row where A has a value but
B/D/E are all still empty), and after you fill in date/name/funeral
home, writes that info back into the sheet automatically. Later, when
that case is assigned a shelf/slot, the cooler + location gets written
into Column L.

**One-time setup (see conversation for full step-by-step, summarized
here):**
1. Enable the Google Sheets API on a Google Cloud project
2. Create a service account, download its JSON key file
3. Rename that file `service_account.json` and put it in this folder
4. Share your actual spreadsheet with the service account's email
   address (Editor access)
5. In `config.py`, set `GOOGLE_SHEETS_ENABLED = True` and confirm
   `GOOGLE_SHEET_ID` matches your sheet's URL

Until `GOOGLE_SHEETS_ENABLED` is `True`, "New Case (Sheet)" mode shows a
clear error instead of a crash -- safe to leave off until you're ready.

If a sheet write fails (bad connection, permissions issue, etc.) after
the info was already saved locally, the app tells you so but does NOT
lose the local save -- the sheet is a convenience mirror, not the
system of record for what's happening in your coolers right now.

**Monthly spreadsheet rollover:** since a new call log spreadsheet gets
generated every month, the scan station has a "🗂️ This Month's
Spreadsheet" button (top of the page) for switching to it -- paste the
new sheet's link and save. It auto-expands and flags itself once the
calendar month changes and nobody's set that month's sheet yet. Only
NEW intakes need this; a case already in progress keeps writing back to
whichever sheet it was created against, even after you switch. Remember
to share each new monthly sheet with the service account's email first
(shown in the error message if you forget).

**Fully automatic rollover (optional):** the manual link-paste above can
be skipped entirely with `apps_script/monthly_sheet_rollover.gs` -- a
script that runs inside YOUR Google account (not the service account,
which has no Drive storage of its own and can't create files) on a
monthly schedule Google manages. It duplicates a template spreadsheet,
continues the case-number sequence in column A from wherever the
previous month's sheet left off, and shares the result with the service
account automatically. The app then notices it (same sheet-status check
that drives the manual banner) and adopts it with zero staff action.
See the setup instructions at the top of that file -- it's a one-time,
few-minutes setup (paste the script into any Google Sheet's Apps
Script editor, fill in three constants, run two setup functions once).
Requires enabling the Google Drive API on the same Google Cloud project
the Sheets API is already enabled on. If the automation ever misses a
month (sharing failed, script error, etc.), the manual panel is still
there as a fallback -- nothing breaks, it just asks a human instead.

**Manual spreadsheet entry:** some staff prefer typing name/date/
funeral home/disposition/night straight into the spreadsheet instead of
using the scan station -- that's fine, but a decedent only gets an
armband tag/QR and board tracking once the app knows about them. The
scan station's "🔄 Sync Manual Entries From Sheet" button picks up any
row that has a case number and looks filled in but isn't tracked
locally yet, creates a record for it, and lists a Print Tag link for
each one found -- run it any time (safe to run repeatedly) and print a
tag for everything it finds.

## Setup (one time)

1. Install Python 3.10+ on the host machine.
2. In this folder:
   ```
   pip install -r requirements.txt
   python app.py
   ```
3. The server prints nothing scary — it just starts listening on port 5000.
   Find the host machine's local IP (e.g. `192.168.1.50`) with `ipconfig`
   (Windows) or `ip addr` / `ifconfig` (Linux/Mac).

## Daily use

- **TV / mirrored display:** open `http://<host-ip>:5000/board` in a
  full-screen kiosk browser. This auto-refreshes every 3 seconds.
- **Tablet (scan station):** open `http://<host-ip>:5000/scan` in the
  Samsung tablet's browser, add it to the home screen. Pair a USB/Bluetooth
  barcode scanner to the tablet — it types scanned codes into the input box
  automatically (acts like a keyboard) and hits Enter, which is all the
  page needs.
- **Mirroring the tablet to the TV:** use Samsung DeX + an HDMI cable for a
  zero-network-dependency connection, OR just open `/board` directly on a
  browser running on a stick PC / mini PC plugged into the TV — you don't
  actually need to mirror the tablet at all if the TV has its own way onto
  the LAN. Either works; HDMI from the tablet is the simplest to reason
  about for uptime.

## Scanning: physical scanner vs. phone/tablet camera

**Two ways to scan a code, both built in:**

1. **Physical USB/Bluetooth barcode scanner** (recommended for daily use) —
   tap the text box on `/scan`, scan with the device, it types the code
   and hits Enter automatically. No camera, no permissions, works
   instantly in low light and with gloves on. This is the reliable
   option for a cooler room.
2. **Phone/tablet camera** — tap "Use Phone/Tablet Camera Instead" on the
   `/scan` page. Useful if you don't have a scanner yet, or as a backup.

**Camera scanning needs HTTPS.** Browsers refuse camera access on a plain
`http://` page unless it's literally `localhost` — a security rule, not a
bug in this app. To use the camera option, start the server with:
```
python app.py --https
```
Then visit `https://<host-ip>:5000/scan` (note the **https**, not http).
The browser will show a "not secure" warning the first time — that's
expected, it's just a self-signed certificate with nobody but you on the
LAN to verify it against. Choose "Advanced" → "Proceed" (Chrome) or
"visit this website" (Safari) and it won't ask again on that device.

If you're using the auto-start service (below), add `--https` to the
`ExecStart` line in `cooler-board.service` too.

## Installing the scanner as an app icon on your phone

The `/scan` page is a "PWA" — a website that installs like a real app, with
its own icon and no browser address bar. This is what makes it feel like a
dedicated QR scanner app rather than a webpage.

**Requires HTTPS** (same reason camera scanning does — see above). Start
the server with `python app.py --https`.

**On the phone:**
1. Open `https://<host-ip>:5000/scan` in Chrome (Android) or Safari (iPhone)
2. Accept the "not secure" warning once (self-signed cert, expected)
3. Tap the browser menu → **"Add to Home screen"** (Chrome) or the Share
   icon → **"Add to Home Screen"** (Safari)
4. It now sits on the home screen as **"Cooler Scan"** with its own icon.
   Opening it launches full-screen, no browser chrome, straight to the
   scan station.

It still needs the server running somewhere on your LAN (PC, Pi, whatever
you land on) — this doesn't make the phone independent of that, it just
makes the phone's *entry point* to the whiteboard system feel like a real
app instead of a bookmark.

**If the app ever behaves oddly after you update these files** — a
button doing nothing, old text showing, a feature that should be there
isn't — it's almost always the installed app serving a stale cached
version instead of the new one. Fix: on the phone, Chrome → ⋮ → Settings
→ Site settings → find the server's address → **Clear & reset**, then
delete and re-add the home screen icon. That forces a completely fresh
download.

## Field Intake: working with no signal at all

**The real-world gap this closes:** the "away from the cooler" moment is
field pickup — creating the Case ID and writing down name/funeral
home/pickup date at wherever the body is picked up, sometimes with zero
bars. The shelf *assignment* scan always happens standing in the cooler
room, which has your LAN WiFi — so that part stays simple and always-live,
unchanged from before.

**Field Intake mode** (the default tab on `/scan`) is built for the
no-signal case specifically:
- Scan a Case ID tag, fill in whatever you know, tap Save.
- If the phone can reach the server right then (WiFi, cellular with a
  path to the server, doesn't matter) — it uploads immediately.
- If it can't reach the server at all — it saves right on the phone
  (using the browser's built-in local database, not just memory, so it
  survives closing the app or losing signal for hours) and shows how many
  cases are waiting to upload.
- The moment the phone gets *any* connection back — walks back into WiFi
  range, gets a cell signal again — it uploads everything automatically
  within about 20 seconds, no button to press.
- Retries are safe: each save gets a unique ID generated on the phone, so
  if a spotty connection causes a retry, the server recognizes it and
  doesn't create a duplicate case.

**For instant upload from literal anywhere (not "eventually, once
reachable")**, the phone needs some path to your server over the
internet. Two ways to do that, ranked by how much I'd recommend them:

1. **Recommended: a private VPN (Tailscale).** Install the free Tailscale
   app on the server and on the phone, log both into the same account.
   The server gets a private address (like `100.x.x.x`) reachable from
   the phone on any connection, anywhere, encrypted end-to-end — with
   *no open ports on your router* and nothing publicly discoverable on
   the internet. Setup is about 10 minutes: tailscale.com/download,
   install on both devices, sign in, done. Point the phone at
   `https://<tailscale-ip>:5000/scan` instead of the LAN IP when you're
   off-site.
2. **Not recommended without more work: forwarding port 5000 straight to
   the internet on your router.** This is genuinely risky as-is — this
   app has no login, and the built-in dev server isn't hardened for
   public exposure. This holds decedents' names and funeral home info;
   don't put it on the open internet without adding real authentication
   and a production server first. Happy to build that out if you decide
   you need it, but it's real additional work, not a flag to flip.

Without either of those, Field Intake still works exactly as described
above — it just uploads on a delay (until the phone's back on the LAN)
instead of instantly. No case data is ever lost either way.

## History mode on the board

The board has a "🕐 History" button next to "📍 Move" -- tap it, then tap
any occupied shelf to pop up that decedent's full history: when they were
placed, every move between shelves, release/checkout/check-in events, and
Yes/No status flags (Prepped, Witness Cremation, ID Viewing) that staff can
toggle right from that popup. Every toggle is logged with a timestamp and
whoever set it, same as any other action.

Add or remove status flags in `config.py`:
```python
CASE_FLAGS = [
    "Prepped",
    "Witness Cremation",
    "ID Viewing",
]
```
No other code changes needed -- a flag just starts showing up as a new
Yes/No toggle in the History popup (and on a case's own `/case/<code>`
page) the next time the app restarts.

## Personal effects inventory

The scan station has an "Inventory" mode: scan any case tag, then log
personal effects (jewelry, clothing, phone, paperwork, etc.) as a
description, a photo, or both. Photos come from the device's own camera
button (`<input capture>`) -- no custom camera UI needed -- and are
automatically resized/re-encoded to keep file sizes reasonable on a
Pi's storage. Each entry is timestamped and attributed to whoever
logged it, deletable for corrections, and also shown read-only on that
case's own `/case/<code>` page. Photos are saved to
`inventory_photos/` (gitignored -- never committed) rather than in the
database, and served through a login-gated route rather than as plain
static files.

Each photo also has the date/time, case number, and decedent's name
burned directly into the bottom of the image itself (not just tagged
in the database), so it stays self-identifying even if a copy ever
leaves the app.

## Layout config: coolers and shelves

The system is organized as **cooler → shelf → optional A/B slot**, no more
generic "racks." Edit `config.py` to match your real coolers:

```python
COOLERS = [
    {
        "name": "Metro Large Cooler",   # shown on the board, printed on labels
        "code": "METRO-LG",              # short code used inside the QR text
        "shelves": [
            (1, ["A", "B"]),   # shelf 1 splits into two spots
            (2, ["A", "B"]),
            (3, [None]),        # shelf 3 holds one decedent, no letter
        ],
    },
    # ...one dict per cooler
]
```

Rename coolers, add or remove coolers, and set each cooler's real shelf
count and slot pattern (mixing A/B and single-slot shelves within the same
cooler is fine — see the example `ATC Back Cooler` entry already in the
file). The five coolers and shelf counts already in `config.py` are a
starting template with placeholder counts — replace the shelf numbers with
your actual counts per cooler before printing labels for real.

**After editing:** delete `cooler.db` and restart the app once to reseed
locations with the new layout, then rerun `python gen_location_qr.py` to
print matching labels. Do NOT delete `cooler.db` once it holds real case
data — that wipes history. Back it up first if a layout change is needed
on a live system.

## Printing labels

`gen_location_qr.py` is bundled in this folder and reads `config.py`
directly, so it always matches whatever coolers/shelves you've configured.
Run `python gen_location_qr.py` (needs `pip install qrcode reportlab`
once) to generate `location_qr_labels.pdf` — laminate and stick one on
each shelf/slot.

For the blank Case ID tags used at intake, see the original
`case_id_qr_labels.pdf` from setup — those aren't tied to the cooler
layout, so they don't need regenerating when you change `config.py`.

## Keeping this fully offline

- Put the host machine + tablet + TV all on one local network with **no**
  internet gateway (isolated SSID or just an unplugged/disabled WAN port on
  the router).
- Nothing in this codebase makes outbound network calls. It only listens
  for LAN connections on port 5000.
- Back up `cooler.db` periodically (copy the file to a USB drive) since
  it's the only copy of your placement history.

## Auto-start on boot (Raspberry Pi / Linux mini PC)

So the app comes back up on its own after a power cut or reboot, without
anyone having to open a terminal:

1. Copy the whole `cooler_board` folder onto the host machine, e.g.
   `/home/pi/cooler_board`.
2. Edit `cooler-board.service` — set `WorkingDirectory`, `ExecStart`, and
   `User` to match that path and your actual login user.
3. From inside the folder, run:
   ```
   chmod +x install_service.sh
   ./install_service.sh
   ```
4. It's now a real background service. Check it with
   `sudo systemctl status cooler-board`, restart it with
   `sudo systemctl restart cooler-board`, view logs with
   `sudo journalctl -u cooler-board -f`.

(If you're hosting on Windows instead — Task Scheduler with "run at
startup" pointed at `python app.py` does the same job. Say the word if
that's your setup and I'll write the exact steps.)

## Concurrent scan stations

Right now the server processes one request at a time on purpose
(`threaded=False` in `app.py`) — that's what guarantees two people
scanning at the same moment can't both grab the same slot. Fine for a
single scan station. If you ever add a second tablet scanning
simultaneously, tell me and I'll add proper locking so it stays safe with
threading turned on.
