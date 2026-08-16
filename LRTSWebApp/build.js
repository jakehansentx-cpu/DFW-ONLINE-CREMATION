// Bundles index.html + styles.css + all the separate .js files (including
// vendored pdf-lib) into ONE self-contained HTML file with everything
// inlined. This exists because a multi-file folder living inside a
// OneDrive-synced Desktop turned out to be fragile in practice - a sibling
// file (styles.css, profiles.js) could be a not-yet-downloaded cloud
// placeholder even after the main index.html opened fine, silently
// breaking the page with no visible error. A single file has nothing else
// that can go missing.
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const read = (name) => fs.readFileSync(path.join(DIR, name), "utf8");

const html = read("index.html");
const css = read("styles.css");
const pdfLib = read("lib/pdf-lib.min.js");
const tesseractLib = read("lib/tesseract-lib.js");
const ocrAssets = read("ocr-assets.js");
const ocr = read("ocr.js");
const btpExtraction = read("btpExtraction.js");
const logos = read("logos.js");
const profiles = read("profiles.js");
const text = read("text.js");
const pdfgen = read("pdfgen.js");
const app = read("app.js");

// Using a replacer FUNCTION (not a plain string) for every replace() call
// below is required, not stylistic: String.replace()'s string-replacement
// form treats "$&", "$1", etc. in the replacement text as special patterns,
// and pdf-lib's own minified source contains "$&" (from its own regex-escaping
// helper) - as a plain string replacement that gets misinterpreted as "reinsert
// the original match," corrupting the bundle. A function's return value is
// always inserted literally, with no such reinterpretation.
let out = html;
out = out.replace(
  '<link rel="stylesheet" href="styles.css">',
  () => `<style>\n${css}\n</style>`
);
const scriptReplacements = [
  ['<script src="lib/pdf-lib.min.js"></script>', pdfLib],
  ['<script src="lib/tesseract-lib.js"></script>', tesseractLib],
  ['<script src="ocr-assets.js"></script>', ocrAssets],
  ['<script src="ocr.js"></script>', ocr],
  ['<script src="btpExtraction.js"></script>', btpExtraction],
  ['<script src="logos.js"></script>', logos],
  ['<script src="profiles.js"></script>', profiles],
  ['<script src="text.js"></script>', text],
  ['<script src="pdfgen.js"></script>', pdfgen],
  ['<script src="app.js"></script>', app],
];
for (const [marker, code] of scriptReplacements) {
  if (!out.includes(marker)) {
    throw new Error(`Could not find expected marker in index.html: ${marker}`);
  }
  out = out.replace(marker, () => `<script>\n${code}\n</script>`);
}

const stillHasLink = out.includes('<link rel="stylesheet"');
const stillHasScript = out.includes("<script src=");
if (stillHasLink || stillHasScript) {
  console.error(`stillHasLink=${stillHasLink} stillHasScript=${stillHasScript}`);
  if (stillHasScript) {
    const idx = out.indexOf("<script src=");
    console.error("Context:", JSON.stringify(out.slice(idx - 40, idx + 80)));
  }
  if (stillHasLink) {
    const idx = out.indexOf('<link rel="stylesheet"');
    console.error("Context:", JSON.stringify(out.slice(idx - 40, idx + 80)));
  }
  throw new Error("Bundling failed to replace all external references");
}

const outPath = path.join(DIR, "build", "MetroCertificateStickerMaker.html");
fs.writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${(out.length / 1024).toFixed(0)} KB)`);
