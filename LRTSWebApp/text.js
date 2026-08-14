// Ported from TextNormalization.kt / DateParsing.kt's prettyDate.

function cleanText(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

// Converts an all-caps or "Last, First Middle" name into normal display form.
function displayName(raw) {
  let value = cleanText(raw);
  if (value === "") return "";
  if (value.includes(",")) {
    const idx = value.indexOf(",");
    const last = cleanText(value.slice(0, idx));
    const rest = cleanText(value.slice(idx + 1));
    value = `${rest} ${last}`.trim();
  }
  return value
    .split(" ")
    .map((part) => {
      if (part.length > 0 && part === part.toUpperCase() && /[A-Za-z]/.test(part)) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      return part;
    })
    .join(" ");
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// isoDate is always YYYY-MM-DD here since it comes straight from an
// <input type="date"> picker - no free-text date parsing needed.
function prettyDate(isoDate) {
  if (!isoDate) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return cleanText(isoDate);
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}
