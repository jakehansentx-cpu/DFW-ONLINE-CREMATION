"""
Generates printable placeholder armband tags for field use (see the
"pre-printed blank field tags" plan) -- a batch of QR codes with generic
FIELD-### codes, not tied to any Google Sheet row yet. Grab one from the
printed stack when creating an armband in the field; the case gets a real
sheet-issued case number claimed for it once the tag is actually scanned
(that claim-on-first-scan logic lives in app.py's _resolve_field_tag()).

Each QR encodes a full URL (same format as a real case tag) so any phone
camera can open it directly:
    https://<PUBLIC_HOST>/case/FIELD-001

Output is QR codes ONLY -- no border, text, or other markings around
them -- sized 2x2cm (the size confirmed by taping a test print onto the
real armband stock), arranged in a plain grid for cutting apart.

Usage:
    python gen_field_tags.py                -- 50 tags (FIELD-001..FIELD-050)
    python gen_field_tags.py 25              -- just 25 tags
    python gen_field_tags.py 51 100          -- a specific range (FIELD-051..FIELD-100)
"""
import sys
import os
import io
import qrcode
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

# Change this if your public address changes (e.g. once Tailscale or a
# domain name is set up) -- this is baked into every printed QR code, so
# regenerate + reprint the batch if it does.
PUBLIC_HOST = "https://137.119.230.213:5000"

QR_SIZE = 2 * cm  # confirmed working size, taped onto the real armband stock
CELL = 3.5 * cm   # QR_SIZE plus room around it to cut apart cleanly
COLS = 5
ROWS = 7          # 5x7 = 35 per page


def make_qr_image(data, box_size=8):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def build_field_tag_sheet(filename, codes):
    c = canvas.Canvas(filename, pagesize=letter)
    page_w, page_h = letter
    margin_x = (page_w - COLS * CELL) / 2
    margin_y = (page_h - ROWS * CELL) / 2

    per_page = COLS * ROWS
    for i, code in enumerate(codes):
        pos = i % per_page
        if pos == 0 and i != 0:
            c.showPage()
        col = pos % COLS
        row = pos // COLS
        cell_x = margin_x + col * CELL
        cell_y = page_h - margin_y - (row + 1) * CELL

        qr_img = make_qr_image(f"{PUBLIC_HOST}/case/{code}")
        qr_x = cell_x + (CELL - QR_SIZE) / 2
        qr_y = cell_y + (CELL - QR_SIZE) / 2
        c.drawImage(qr_img, qr_x, qr_y, width=QR_SIZE, height=QR_SIZE)

    c.save()


# ---- CLI: default 50 tags, or pass a count, or a start/end range ----
args = [int(a) for a in sys.argv[1:]]
if len(args) == 0:
    start, end = 1, 50
elif len(args) == 1:
    start, end = 1, args[0]
else:
    start, end = args[0], args[1]

codes = [f"FIELD-{n:03d}" for n in range(start, end + 1)]

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "field_tags.pdf")
build_field_tag_sheet(out_path, codes)
print(f"Field tag labels generated: {len(codes)} ({codes[0]}..{codes[-1]}) -> {out_path}")
