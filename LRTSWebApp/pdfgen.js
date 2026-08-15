// Certificate + Avery 8464 label PDF generation, ported from
// CertificateGenerator.kt / LabelSheetGenerator.kt / LabelPagination.kt /
// ReportLabStyleCanvas.kt. Every coordinate, font size, and layout constant
// below is unchanged from those files (which themselves preserved app.py's
// original reportlab numbers exactly). pdf-lib's coordinate system is
// already bottom-up PDF points, same as reportlab, so - unlike the Android
// port - no Y-flip wrapper is needed here; the numbers are used as-is.

const { PDFDocument, StandardFonts, rgb } = PDFLib;

function fitTextSize(text, maxWidth, font, size, minSize) {
  let current = size;
  while (current > minSize && font.widthOfTextAtSize(text, current) > maxWidth) {
    current -= 0.5;
  }
  return current;
}

function wrapText(text, maxWidth, font, size) {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  const words = trimmed.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

function drawLeft(page, text, x, y, font, size, color) {
  page.drawText(text, { x, y, size, font, color });
}

function drawCentered(page, text, centerX, y, font, size, color) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - width / 2, y, size, font, color });
}

function fitCentered(page, text, y, maxWidth, font, size, centerX, color, minSize = 8) {
  const cleaned = cleanText(text);
  const fitted = fitTextSize(cleaned, maxWidth, font, size, minSize);
  drawCentered(page, cleaned, centerX, y, font, fitted, color);
}

async function base64ToBytes(dataUri) {
  const res = await fetch(dataUri);
  return new Uint8Array(await res.arrayBuffer());
}

// ---- Certificate (CertificateGenerator.kt) ----

// 7.5in x 5.5in exactly (540pt x 396pt at 72pt/in) - the actual Metro
// certificate stock paper size.
const CERT_PAGE_WIDTH = 540;
const CERT_PAGE_HEIGHT = 396;
const CERT_CENTER_X = CERT_PAGE_WIDTH / 2;
const CERT_BLUE = rgb(0x00 / 255, 0x3a / 255, 0x9b / 255);
const BLACK = rgb(0, 0, 0);

async function buildCertificatePdf(cases) {
  const pdfDoc = await PDFDocument.create();
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const c of cases) {
    const missing = [];
    if (cleanText(c.decedentName) === "") missing.push("Decedent name");
    if (cleanText(c.cremationDate) === "") missing.push("Date of cremation");
    if (cleanText(c.discId) === "") missing.push("I.D. disc number");
    if (missing.length > 0) {
      throw new Error(`${c.decedentName || "(unnamed case)"}: missing ${missing.join(", ")}`);
    }

    const page = pdfDoc.addPage([CERT_PAGE_WIDTH, CERT_PAGE_HEIGHT]);
    page.drawRectangle({
      x: 10, y: 10, width: CERT_PAGE_WIDTH - 20, height: CERT_PAGE_HEIGHT - 20,
      borderColor: CERT_BLUE, borderWidth: 1.1,
    });
    page.drawRectangle({
      x: 15, y: 15, width: CERT_PAGE_WIDTH - 30, height: CERT_PAGE_HEIGHT - 30,
      borderColor: CERT_BLUE, borderWidth: 0.45,
    });

    fitCentered(page, "Certificate of Cremation", 326, 420, sansBold, 18, CERT_CENTER_X, BLACK);
    fitCentered(page, "This is to certify that the remains of", 296, 390, sans, 11, CERT_CENTER_X, BLACK);
    fitCentered(page, displayName(c.decedentName), 267, 410, sansBold, 16, CERT_CENTER_X, BLACK);
    fitCentered(page, "were cremated as documented below at the", 239, 410, sans, 11, CERT_CENTER_X, BLACK);
    fitCentered(page, cleanText(c.crematoryName || "Metro Mortuary & Crematory"), 214, 430, sansBold, 14, CERT_CENTER_X, BLACK);
    fitCentered(page, cleanText(c.crematoryCityState || "Sachse, Texas"), 190, 390, sans, 11, CERT_CENTER_X, BLACK);

    const leftX = 82;
    const rightX = 300;
    const lineY = 146;
    const providerService = cleanText(c.providerService || "Metro Mortuary & Crematory Service");
    const providerLocation = cleanText(c.providerLocation || "Sachse, Texas 75048");
    const dateText = prettyDate(c.cremationDate);

    drawLeft(page, providerService, leftX, lineY + 4, sans, 8.2, BLACK);
    page.drawLine({ start: { x: leftX, y: lineY }, end: { x: 250, y: lineY }, thickness: 1, color: BLACK });
    drawLeft(page, "Services provided by:", leftX + 3, lineY - 14, sans, 7.2, BLACK);

    page.drawLine({ start: { x: rightX, y: lineY }, end: { x: 448, y: lineY }, thickness: 1, color: BLACK });
    drawLeft(page, "Signature of Metro Crematory Official", rightX + 3, lineY - 14, sans, 7.2, BLACK);

    drawLeft(page, providerLocation, leftX, 93, sans, 8.2, BLACK);
    page.drawLine({ start: { x: leftX, y: 90 }, end: { x: 240, y: 90 }, thickness: 1, color: BLACK });
    drawLeft(page, "Provider City, State Zip", leftX + 3, 77, sans, 7.2, BLACK);

    drawLeft(page, dateText, rightX, 93, sans, 8.2, BLACK);
    page.drawLine({ start: { x: rightX, y: 90 }, end: { x: 448, y: 90 }, thickness: 1, color: BLACK });
    drawLeft(page, "Date of Cremation", rightX + 3, 77, sans, 7.2, BLACK);

    fitCentered(page, cleanText(c.discId), 39, 200, sansBold, 14, CERT_CENTER_X, BLACK);
  }

  return pdfDoc.save();
}

// ---- Labels (LabelSheetGenerator.kt + LabelPagination.kt) ----

const LABEL_WIDTH = 4 * 72;
const LABEL_HEIGHT = (10 / 3) * 72;
const LEFT_MARGIN = 0.25 * 72;
const TOP_MARGIN = 0.5 * 72;
const LABEL_PAGE_WIDTH = 612;
const LABEL_PAGE_HEIGHT = 792;
const MIN_QTY = 1;
const MAX_QTY = 60;
const POSITIONS_PER_SHEET = 6;

function clampQuantity(raw) {
  return Math.max(MIN_QTY, Math.min(MAX_QTY, raw));
}

function labelOrigin(position) {
  const zeroBased = position - 1;
  const row = Math.floor(zeroBased / 2);
  const column = zeroBased % 2;
  const x = LEFT_MARGIN + column * LABEL_WIDTH;
  const y = LABEL_PAGE_HEIGHT - TOP_MARGIN - (row + 1) * LABEL_HEIGHT;
  return [x, y];
}

// Groups cases by funeral home before packing them onto sheets, so a batch
// with several funeral homes prints each one's stickers together on
// contiguous positions/sheets rather than interleaved in whatever order
// they were entered. Groups appear in first-seen order (whichever funeral
// home's first case was added earliest in the batch comes first); case
// order within a group is preserved.
function groupCasesByProfile(cases) {
  const groupOrder = [];
  const groups = new Map();
  for (const c of cases) {
    const key = (c.profile && c.profile.id) || c.profileId || "unknown";
    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }
    groups.get(key).push(c);
  }
  return groupOrder.flatMap((key) => groups.get(key));
}

// One placement (page index, x, y) per label, across every case in the
// batch, packed continuously across sheets and grouped by funeral home -
// the whole point of the batch print run: nobody has to babysit one case's
// sheet at a time, or hand-sort stickers by funeral home afterward.
function computeBatchPlacements(cases) {
  const ordered = groupCasesByProfile(cases);
  const placements = [];
  let position = 1; // 1-6, wraps to a new page after 6
  let pageIndex = 0;
  for (const c of ordered) {
    const qty = clampQuantity(c.labelQuantity);
    for (let i = 0; i < qty; i++) {
      const [x, y] = labelOrigin(position);
      placements.push({ pageIndex, x, y, caseData: c });
      position += 1;
      if (position > POSITIONS_PER_SHEET) {
        position = 1;
        pageIndex += 1;
      }
    }
  }
  return placements;
}

async function buildLabelsPdf(cases) {
  for (const c of cases) {
    if (cleanText(c.decedentName) === "") {
      throw new Error("A decedent name is required for every case before printing stickers.");
    }
  }

  const pdfDoc = await PDFDocument.create();
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const embeddedLogos = {};
  async function getEmbeddedLogo(logoKey) {
    if (!logoKey || !LOGOS[logoKey]) return null;
    if (!embeddedLogos[logoKey]) {
      const bytes = await base64ToBytes(LOGOS[logoKey]);
      embeddedLogos[logoKey] = await pdfDoc.embedPng(bytes);
    }
    return embeddedLogos[logoKey];
  }

  const placements = computeBatchPlacements(cases);
  if (placements.length === 0) return pdfDoc.save();

  const pageCount = placements[placements.length - 1].pageIndex + 1;
  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push(pdfDoc.addPage([LABEL_PAGE_WIDTH, LABEL_PAGE_HEIGHT]));
  }

  for (const placement of placements) {
    const page = pages[placement.pageIndex];
    const logoImage = await getEmbeddedLogo(placement.caseData.profile.logo);
    const secondaryLogoImage = await getEmbeddedLogo(placement.caseData.profile.secondaryLogo);
    await drawLabel(page, placement.caseData, placement.x, placement.y, LABEL_WIDTH, LABEL_HEIGHT, {
      sans, sansBold, serifBold, logoImage, secondaryLogoImage,
    });
  }

  return pdfDoc.save();
}

function aspectFitBox(imgW, imgH, boxX, boxY, boxW, boxH) {
  if (imgW <= 0 || imgH <= 0) return [boxX, boxY, boxW, boxH];
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const fitW = imgW * scale;
  const fitH = imgH * scale;
  return [boxX + (boxW - fitW) / 2, boxY + (boxH - fitH) / 2, fitW, fitH];
}

async function drawLabel(page, caseData, x, y, w, h, fonts) {
  const profile = caseData.profile;
  const profileName = cleanText(profile.funeralHome || "All Texas Cremation");
  const funeralHome = profile.printFuneralHome != null
    ? cleanText(profile.printFuneralHome)
    : cleanText(profile.funeralHome || profileName);
  const cityState = profile.printCityState != null
    ? cleanText(profile.printCityState)
    : cleanText(profile.cityState || "");
  const name = displayName(caseData.decedentName);
  const preface = cleanText(profile.preface || "The Cremated Remains of");
  const disclosure = cleanText(profile.disclosure || "");

  const headerMode = cleanText(profile.headerMode || (fonts.logoImage ? "logo" : "name")).toLowerCase();
  const headerLines = (profile.headerText || "").split("\n").map(cleanText).filter((l) => l !== "");

  if (headerMode === "none") {
    // no header
  } else if (headerMode === "logo" && fonts.logoImage) {
    const [bx, by, bw, bh] = aspectFitBox(
      fonts.logoImage.width, fonts.logoImage.height,
      x + 92, y + h - 69, 104, 56
    );
    page.drawImage(fonts.logoImage, { x: bx, y: by, width: bw, height: bh });
  } else if (headerMode === "text" && headerLines.length > 0) {
    headerLines.slice(0, 2).forEach((line, index) => {
      fitCentered(page, line, y + h - 29 - index * 13, w - 34, fonts.serifBold, 10.5, x + w / 2, BLACK, 6.5);
    });
  } else {
    fitCentered(page, profileName.toUpperCase(), y + h - 35, w - 36, fonts.sansBold, 12, x + w / 2, BLACK, 7);
  }

  drawCentered(page, preface, x + w / 2, y + h - 78, fonts.sans, 11, BLACK);

  let nameSize = 15;
  while (nameSize > 9 && fonts.sansBold.widthOfTextAtSize(name, nameSize) > w - 42) {
    nameSize -= 0.5;
  }
  drawCentered(page, name, x + w / 2, y + h - 112, fonts.sansBold, nameSize, BLACK);

  // Some profiles (e.g. Mathis) print a second funeral-home logo in place of
  // the funeral home's name text, with the city/state line shifted down to
  // clear it.
  if (profile.secondaryLogo && fonts.secondaryLogoImage) {
    const [bx, by, bw, bh] = aspectFitBox(
      fonts.secondaryLogoImage.width, fonts.secondaryLogoImage.height,
      x + (w - 100) / 2, y + h - 142, 100, 24
    );
    page.drawImage(fonts.secondaryLogoImage, { x: bx, y: by, width: bw, height: bh });
    fitCentered(page, cityState, y + h - 168, w - 32, fonts.serifBold, 10.5, x + w / 2, BLACK, 6.5);
  } else {
    fitCentered(page, funeralHome, y + h - 140, w - 32, fonts.serifBold, 10.5, x + w / 2, BLACK, 6.5);
    fitCentered(page, cityState, y + h - 154, w - 32, fonts.serifBold, 10.5, x + w / 2, BLACK, 6.5);
  }

  drawDisclosure(page, disclosure, x + w / 2, y, w, fonts.sans);
}

// Mirrors drawDisclosure() in LabelSheetGenerator.kt: fontSize 6.4, leading
// 7.1, wrapped to w-32, vertically centered in a 43pt band starting 17pt
// above the label's bottom edge.
function drawDisclosure(page, disclosure, centerX, y, w, sansFont) {
  if (disclosure === "") return;
  const size = 6.4;
  const wrapWidth = w - 32;
  const lines = wrapText(disclosure, wrapWidth, sansFont, size);
  if (lines.length === 0) return;
  const leading = 7.1;
  const contentHeight = lines.length * leading;
  const verticalOffset = Math.max(0, (43 - contentHeight) / 2);
  const blockBottom = y + 17 + verticalOffset;
  const topBaseline = blockBottom + contentHeight - leading;
  lines.forEach((line, index) => {
    drawCentered(page, line, centerX, topBaseline - index * leading, sansFont, size, BLACK);
  });
}
