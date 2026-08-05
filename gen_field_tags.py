"""
Generates printable placeholder armband tags for field use (see the
"pre-printed blank field tags" plan) -- a batch of QR codes with generic
FIELD-### codes, not tied to any Google Sheet row yet. Grab one from the
printed stack when creating an armband in the field; the case gets a real
sheet-issued case number claimed for it once the tag is actually scanned
and used (that claim-on-first-scan behavior is a separate, not-yet-built
piece of the app -- this script only produces the physical tags).

Each QR encodes a full URL (same format as a real case tag) so any phone
camera can open it directly:
    https://<PUBLIC_HOST>/case/FIELD-001

Sized to fit the specific armband stock measured by hand: ~3.5in wide,
~7in paddle length, with the QR placed in the top 4.5in-7in band (nearest
the strap) and the printed code lower down on the paddle. Adjust the
constants below if your actual armband stock measures differently.

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

# Change this if your public address changes (e.g. once Tailscale or a
# domain name is set up) -- this is baked into every printed QR code, so
# regenerate + reprint the batch if it does.
PUBLIC_HOST = "https://137.119.230.213:5000"

# Measured from the physical armband stock -- see chat photos.
LABEL_W = 3.0 * inch
LABEL_H = 7.0 * inch
QR_ZONE_BOTTOM = 4.5 * inch   # QR must sit between 4.5in and 7in up the paddle
QR_ZONE_TOP = 7.0 * inch
QR_SIZE = 1.5 * inch


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


def build_field_tag_sheet(filename, codes, cols=2):
    c = canvas.Canvas(filename, pagesize=letter)
    page_w, page_h = letter
    margin_x = (page_w - cols * LABEL_W) / 2
    margin_y = (page_h - LABEL_H) / 2

    per_page = cols
    for i, code in enumerate(codes):
        pos = i % per_page
        if pos == 0 and i != 0:
            c.showPage()
        x = margin_x + pos * LABEL_W
        y = margin_y

        # QR -- centered in the 4.5in-7in zone measured up from the
        # bottom of this label.
        qr_img = make_qr_image(f"{PUBLIC_HOST}/case/{code}")
        qr_x = x + (LABEL_W - QR_SIZE) / 2
        qr_y = y + QR_ZONE_BOTTOM + ((QR_ZONE_TOP - QR_ZONE_BOTTOM) - QR_SIZE) / 2
        c.drawImage(qr_img, qr_x, qr_y, width=QR_SIZE, height=QR_SIZE)

        # Placeholder code, large, below the QR.
        c.setFont("Helvetica-Bold", 22)
        c.drawCentredString(x + LABEL_W / 2, y + 3.5 * inch, code)

        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(x + LABEL_W / 2, y + 3.0 * inch, "PLACEHOLDER TAG")
        c.setFont("Helvetica", 9)
        c.drawCentredString(x + LABEL_W / 2, y + 2.7 * inch, "Scan to assign a case number")

        c.setFont("Helvetica", 8)
        c.drawCentredString(x + LABEL_W / 2, y + 0.4 * inch, "Last Responder Transport Services LLC")

        c.rect(x, y, LABEL_W, LABEL_H)  # cut guide
        # Marks showing the 4.5in/7in zone, for lining up on the real stock.
        c.setDash(2, 2)
        c.line(x, y + QR_ZONE_BOTTOM, x + LABEL_W, y + QR_ZONE_BOTTOM)
        c.setDash()

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
