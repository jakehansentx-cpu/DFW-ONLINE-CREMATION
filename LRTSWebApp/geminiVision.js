// Reads the decedent's name off a photo of a printed Burial-Transit Permit
// using Google's Gemini API, instead of Claude or the on-device OCR this
// app used to have. Chosen for its free tier - no billing/credit card
// required for the volume this app expects, unlike Claude or OpenAI.
//
// This is the one part of the app that needs the internet and a Google API
// key: the photo is uploaded to Google's API to be read, then discarded.
// Nothing else in this app ever leaves this computer - see the key entered
// under "Fill in the name from a photo," stored only in this browser's
// local storage (specific to this computer/file location).
//
// Controlled generation (responseSchema) is used instead of free-text
// parsing, so the response is guaranteed to be valid, structured JSON - no
// brittle text parsing needed.

const GEMINI_API_KEY_STORAGE_KEY = "metroApp.geminiApiKey";
const GEMINI_MODEL = "gemini-2.5-flash";
// Images are internally capped around this edge length anyway, so sending
// anything larger just wastes upload time on (often slow) office wifi
// without improving accuracy.
const GEMINI_MAX_IMAGE_DIMENSION = 1568;

function getSavedGeminiApiKey() {
  try {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveGeminiApiKey(key) {
  try {
    localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
  } catch {
    // Storage unavailable (e.g. blocked by browser settings) - the key
    // simply won't persist across sessions; the caller still has it in
    // memory for the current one.
  }
}

async function resizeImageForUpload(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, GEMINI_MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } finally {
    bitmap.close();
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const NAME_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    found: {
      type: "BOOLEAN",
      description: "true if a decedent name was legible on the permit, false otherwise.",
    },
    firstName: {
      type: "STRING",
      description: "First name, properly capitalized (e.g. 'John'). Empty string if not found.",
    },
    middleName: {
      type: "STRING",
      description: "Middle name or initial, properly capitalized. Empty string if there is none.",
    },
    lastName: {
      type: "STRING",
      description: "Last name, properly capitalized. Empty string if not found.",
    },
    suffix: {
      type: "STRING",
      description: "Suffix such as Jr, Sr, II, III if present on the permit, otherwise empty string.",
    },
  },
  required: ["found", "firstName", "middleName", "lastName", "suffix"],
};

// Sends the photo to Gemini and returns {found, firstName, middleName, lastName, suffix}.
async function extractNameFromBtpPhoto(file, apiKey) {
  const resized = await resizeImageForUpload(file);
  const base64Data = await blobToBase64(resized);

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inline_data: { mime_type: "image/jpeg", data: base64Data } },
                {
                  text:
                    "This is a photo of a printed Texas Burial-Transit Permit. Find the " +
                    "\"Name of Deceased\" field - it may be one line, or split into separate " +
                    "First/Middle/Last columns - and report the name.",
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: NAME_RESPONSE_SCHEMA,
          },
        }),
      }
    );
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Could not reach Google - check your internet connection and try again.");
    }
    throw error;
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    let message = bodyText;
    try {
      message = JSON.parse(bodyText).error?.message || bodyText;
    } catch {
      // not JSON - use the raw body text as-is
    }
    if (response.status === 400 && /api key not valid|api_key_invalid/i.test(message)) {
      throw new Error('That API key was rejected - check it under "Fill in the name from a photo" and try again.');
    }
    throw new Error(`Gemini API error (${response.status}): ${message.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates && data.candidates[0] && data.candidates[0].content
    && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
    && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error("Gemini did not return a recognized result.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini returned an unexpected response.");
  }
}
