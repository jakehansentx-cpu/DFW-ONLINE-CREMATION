// High-level wrapper around the vendored tesseract-wasm library (lib/tesseract-lib.js)
// for reading text off a photo of a printed Burial-Transit Permit.
//
// Everything the OCR engine needs (worker script, WASM core, English trained
// data) is embedded as base64 in ocr-assets.js and handed to the worker
// directly via postMessage - never fetched by URL. That's not a style choice:
// this app is normally opened by double-clicking the HTML file (file://, no
// server), and Chrome's fetch() unconditionally refuses file:// requests, so
// any approach that relies on the worker fetching a sibling file at runtime
// does not work here. See lib/ocr/tesseract-worker.js's one line of patch
// (search "locateFile") for the other file://-specific fix this needed: the
// vendored worker computes an absolute URL for its own wasm file eagerly, on
// every startup, even though a wasmBinary is supplied directly below and
// that computed URL is never actually used - but the computation itself
// throws when the worker's own location is a blob: URL, which it always is
// here. Supplying locateFile short-circuits that dead branch entirely.
//
// The trained-data variant here is "best_int" (int8-quantized) rather than
// the full "best" model - a deliberate size/accuracy tradeoff to keep the
// embedded bundle a reasonable download; see README notes if accuracy on
// real photos ends up needing the larger model instead.

let ocrClientPromise = null;

// Named distinctly from pdfgen.js's own base64ToBytes (a fetch()-based
// helper for data: URIs, used for the logos): all <script> tags in this
// classic (non-module) page share one global scope, so a same-named
// function declared in a script loaded later silently overwrites this one.
function ocrBase64ToBytes(base64) {
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes;
}

// One OCRClient (one Worker) is reused across scans in a session rather than
// spun up per photo - the worker script + WASM core + trained data are
// several MB to hand over via postMessage, so reusing it keeps every scan
// after the first one fast.
async function getOcrClient() {
  if (!ocrClientPromise) {
    ocrClientPromise = (async () => {
      const workerBytes = ocrBase64ToBytes(OCR_WORKER_JS_BASE64);
      const workerBlob = new Blob([workerBytes], { type: "application/javascript" });
      const workerUrl = URL.createObjectURL(workerBlob);
      const wasmBinary = ocrBase64ToBytes(OCR_CORE_WASM_BASE64);

      const client = new OCRClient({ workerURL: workerUrl, wasmBinary });
      const trainedData = ocrBase64ToBytes(OCR_TRAINED_DATA_BASE64);
      await client.loadModel(trainedData.buffer);
      return client;
    })();
  }
  return ocrClientPromise;
}

// Runs OCR on an image file/blob (as picked from a file input) and returns
// the recognized text. onProgress, if given, is called with a 0-1 fraction.
async function recognizeImageText(imageFileOrBlob, onProgress) {
  const client = await getOcrClient();
  const image = await createImageBitmap(imageFileOrBlob);
  try {
    await client.loadImage(image);
    return await client.getText(onProgress);
  } finally {
    image.close();
  }
}
