"""
Generates printable placeholder ankle-tag QR labels for field use (see the
"pre-printed blank field tags" plan) -- a batch of QR codes with generic
FIELD-### codes, not tied to any Google Sheet row yet. Peel one from the
sheet and stick it onto a blank ankle band when creating a case in the
field; the case gets a real sheet-issued case number claimed for it once
the tag is actually scanned (that claim-on-first-scan logic lives in
app.py's _resolve_field_tag()).

Each QR encodes a full URL (same format as a real case tag) so any phone
camera can open it directly:
    https://<config.PUBLIC_HOST>/case/FIELD-001

Sized for Avery 5161 (also sold as 5261/5909/5961/8161/8461) label sheets --
1" x 4", 20 per sheet, 2 columns x 10 rows -- to fit the ~1 1/4" x 3 7/8"
label area on the ankle bands. Each label gets the QR code plus the
FIELD-### code printed as text, for a human-readable fallback if a scan
ever fails -- nothing else (no blank lines; staff write the name/funeral
home/date directly on the band, not on the sticker).

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
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

import config

# Avery 5161 sheet geometry -- 2 columns x 10 rows of 1" x 4" labels, no
# gap between labels (0.25" side margins + 2*4" = 8.5", 0.5" top/bottom
# margins + 10*1" = 11").
LABEL_W = 4 * inch
LABEL_H = 1 * inch
COLS = 2
ROWS = 10
SIDE_MARGIN = 0.25 * inch
TOP_MARGIN = 0.5 * inch

QR_SIZE = 0.85 * inch  # leaves a small margin within the 1" label height


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

    per_page = COLS * ROWS
    for i, code in enumerate(codes):
        pos = i % per_page
        if pos == 0 and i != 0:
            c.showPage()
        col = pos % COLS
        row = pos // COLS
        label_x = SIDE_MARGIN + col * LABEL_W
        label_y = page_h - TOP_MARGIN - (row + 1) * LABEL_H

        qr_img = make_qr_image(f"{config.PUBLIC_HOST}/case/{code}")
        qr_margin = (LABEL_H - QR_SIZE) / 2
        qr_x = label_x + qr_margin
        qr_y = label_y + qr_margin
        c.drawImage(qr_img, qr_x, qr_y, width=QR_SIZE, height=QR_SIZE)

        c.setFont("Helvetica-Bold", 16)
        text_x = qr_x + QR_SIZE + (0.15 * inch)
        text_y = label_y + LABEL_H / 2 - 6
        c.drawString(text_x, text_y, code)

    c.save()


# ---- CLI: default 50 tags, or pass a count, or a start/end range ----
args = [int(a) for a in sys.argv[1:]]
if len(args) == 0:
    start, end = 1, 50
elif len(args) == 1:
    start, end = 1, args[0]
else:
    start, end = args[0], args[1]

codes = [f"{config.FIELD_TAG_PREFIX}{n:03d}" for n in range(start, end + 1)]

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "field_tags.pdf")
build_field_tag_sheet(out_path, codes)
print(f"Field tag labels generated: {len(codes)} ({codes[0]}..{codes[-1]}) -> {out_path}")
