// Ported from BtpNameExtraction.kt's text-based path (extractBtpName(text: String)
// and splitLegalName) - the Android app's OCR name-finding logic, reused
// as-is since it was already tuned against real burial-transit permits.
// The positional/table-grid strategies in the Kotlin version (which need
// per-word bounding boxes from ML Kit) are not ported here; this works from
// plain recognized text only, which is what the browser OCR engine returns.

const BTP_NAME_LABEL = /NAME OF DECEASED(?:\s*[-:]?\s*)/i;
const BTP_FIELD_WORDS = /\b(FIRST|MIDDLE|LAST)\b/gi;
const BTP_EXCLUDE_FOLLOWING = /AGE|SEX|DATE|METHOD/i;
const BTP_TWO_LETTERS = /[A-Za-z]{2}/;
const BTP_TWO_WORD_NAME = /\b([A-Z][A-Z'-]{2,})\s+([A-Z][A-Z'-]{2,})\b/;
const BTP_EXCLUDE_TWO_WORD = /BURIAL|TRANSIT|PERMIT|TEXAS|CREMATION/i;

const BTP_COLUMN_LABEL_WORDS = new Set([
  "FIRST", "MIDDLE", "LAST", "AGE", "SEX", "DATE", "METHOD", "PLACE", "NAME",
  "STATE", "COUNTY", "REGISTRAR", "TEXAS", "PRACTICE", "FORM", "TEST", "OF", "DECEASED",
]);

function btpLooksLikeNameToken(text) {
  const cleaned = text.trim();
  if (cleaned.length < 2 || cleaned.length > 24) return false;
  if (!/^[A-Za-z' -]+$/.test(cleaned)) return false;
  const words = cleaned.split(/[\s-]+/).filter((w) => w !== "");
  if (words.length === 0) return false;
  return words.every((w) => !BTP_COLUMN_LABEL_WORDS.has(w.toUpperCase()));
}

function btpValueAfterLabel(lines, isLabel) {
  const labelIndex = lines.findIndex(isLabel);
  if (labelIndex === -1) return null;
  for (let i = labelIndex + 1; i < Math.min(labelIndex + 3, lines.length); i++) {
    if (btpLooksLikeNameToken(lines[i])) return lines[i];
  }
  return null;
}

function btpExtractTableColumnName(lines) {
  const first = btpValueAfterLabel(lines, (l) => l.toUpperCase().includes("NAME OF DECEASED"));
  const middle = btpValueAfterLabel(lines, (l) => l.trim().toUpperCase() === "MIDDLE");
  const last = btpValueAfterLabel(lines, (l) => l.trim().toUpperCase() === "LAST");
  const parts = [first, middle, last].filter((p) => p != null && p !== "");
  return parts.length >= 2 ? parts.join(" ") : null;
}

// Finds the decedent's name in raw OCR'd text from a burial-transit permit.
// Looks for a "Name of Deceased" label first (the same line or one of the
// next few), then falls back to the first plausible two-word capitalized
// name that isn't part of the permit's own boilerplate. Returns "" if
// nothing plausible is found - callers should treat that as "needs manual
// entry", never guess.
function extractBtpName(text) {
  const lines = text.split("\n").map((l) => cleanText(l)).filter((l) => l !== "");

  const tableColumnName = btpExtractTableColumnName(lines);
  if (tableColumnName) return displayName(tableColumnName);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.toUpperCase().includes("NAME OF DECEASED")) continue;
    const afterLabelParts = line.split(BTP_NAME_LABEL);
    const afterLabel = afterLabelParts[afterLabelParts.length - 1];
    let tail = afterLabel.replace(BTP_FIELD_WORDS, " ");
    tail = cleanText(tail);
    if (tail.length >= 4) {
      return displayName(tail);
    }
    const windowEnd = Math.min(index + 4, lines.length);
    for (let i = index + 1; i < windowEnd; i++) {
      const following = lines[i];
      if (BTP_TWO_LETTERS.test(following) && !BTP_EXCLUDE_FOLLOWING.test(following)) {
        return displayName(following);
      }
    }
  }

  for (const line of lines) {
    const match = BTP_TWO_WORD_NAME.exec(line);
    if (!match) continue;
    if (!BTP_EXCLUDE_TWO_WORD.test(match[0])) {
      return displayName(match[0]);
    }
  }

  return "";
}

const BTP_SUFFIXES = new Set(["JR", "SR", "II", "III", "IV", "V"]);

// Splits a confirmed display name ("First Middle Last Suffix") into the
// discrete fields the batch form needs. Nothing here is inferred beyond
// simple positional splitting - first token is first name, last token is
// last name (unless it's a recognized suffix, in which case the one before
// it is), everything in between is the middle name.
function splitLegalName(displayFullName) {
  const cleaned = cleanText(displayFullName);
  if (cleaned === "") return { first: "", middle: "", last: "", suffix: "" };
  const tokens = cleaned.split(" ");
  let suffix = "";
  if (tokens.length > 1 && BTP_SUFFIXES.has(tokens[tokens.length - 1].toUpperCase().replace(/\.+$/, ""))) {
    suffix = tokens.pop();
  }
  if (tokens.length === 0) return { first: "", middle: "", last: "", suffix };
  const first = tokens[0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : "";
  const middle = tokens.length > 2 ? tokens.slice(1, tokens.length - 1).join(" ") : "";
  return { first, middle, last, suffix };
}
