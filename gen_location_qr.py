"""
Generates printable QR code labels for the cooler location system, using
the same config.py the app itself reads -- edit config.py, then rerun this
script to get matching labels. Every QR encodes ONLY a plain internal ID
string (e.g. LOC|METRO-LG|S01|A) -- no URL, no internet call, no PII.

Usage:
    python gen_location_qr.py                       -- every cooler
    python gen_location_qr.py CREM-STAGE             -- just one cooler
    python gen_location_qr.py CREM-STAGE CREM-STAGE-BIERS
                                                      -- just these coolers
(cooler codes are the short "code" values from config.py, e.g. METRO-LG,
CREM-STAGE -- printed in the summary at the end of a run so you can see
them all.)
"""
import sys
import os
import qrcode
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import io

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import COOLERS  # noqa: E402


def make_qr_image(data, box_size=6):
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


def build_label_sheet(filename, labels, cols=4, rows=5, label_w=1.9 * inch, label_h=1.9 * inch):
    c = canvas.Canvas(filename, pagesize=letter)
    page_w, page_h = letter
    margin_x = (page_w - cols * label_w) / 2
    margin_y = (page_h - rows * label_h) / 2

    per_page = cols * rows
    for i, (data, line1, line2) in enumerate(labels):
        pos = i % per_page
        if pos == 0 and i != 0:
            c.showPage()
        col = pos % cols
        row = pos // cols
        x = margin_x + col * label_w
        y = page_h - margin_y - (row + 1) * label_h

        qr_img = make_qr_image(data)
        qr_size = label_h * 0.56
        qr_x = x + (label_w - qr_size) / 2
        qr_y = y + label_h - qr_size - 0.10 * inch
        c.drawImage(qr_img, qr_x, qr_y, width=qr_size, height=qr_size)

        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(x + label_w / 2, y + 0.38 * inch, line1)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(x + label_w / 2, y + 0.22 * inch, line2)
        c.setFont("Helvetica", 6)
        c.drawCentredString(x + label_w / 2, y + 0.09 * inch, data)

        c.rect(x, y, label_w, label_h)  # cut guide

    c.save()


# ---- Build location labels from config.py ----
# Optional cooler-code filter, e.g. `python gen_location_qr.py CREM-STAGE`
# -- keeps you from reprinting labels you already have every time you add
# one new cooler.
wanted_codes = set(sys.argv[1:]) or None
coolers = [c for c in COOLERS if wanted_codes is None or c["code"] in wanted_codes]
if wanted_codes and not coolers:
    print(f"No coolers matched {sorted(wanted_codes)}. Known codes:")
    for c in COOLERS:
        print(f"  {c['code']} ({c['name']})")
    sys.exit(1)

location_labels = []
for cooler in coolers:
    for shelf_num, slots in cooler["shelves"]:
        for slot in slots:
            if slot:
                code = f"LOC|{cooler['code']}|S{shelf_num:02d}|{slot}"
                line2 = f"Shelf {shelf_num}{slot}"
            else:
                code = f"LOC|{cooler['code']}|S{shelf_num:02d}"
                line2 = f"Shelf {shelf_num}"
            location_labels.append((code, cooler["name"], line2))

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "location_qr_labels.pdf")
build_label_sheet(out_path, location_labels)
print(f"Location labels generated: {len(location_labels)} -> {out_path}")
for cooler in coolers:
    n = sum(len(slots) for _, slots in cooler["shelves"])
    print(f"  {cooler['name']} ({cooler['code']}): {n} locations")
