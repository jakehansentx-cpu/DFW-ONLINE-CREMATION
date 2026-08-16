// Reads the decedent's name off a photo of a printed Burial-Transit Permit
// using the Claude API (Anthropic's AI), instead of the on-device OCR this
// app used to have. On-device OCR (tesseract-wasm) turned out to be too
// unreliable on real phone-camera photos in practice - it regularly swapped
// first/last names or dropped the middle name entirely. Claude reads the
// permit's layout and labels contextually instead of guessing at columns
// from raw recognized text, which is far more reliable.
//
// This is the one part of the app that needs the internet and an Anthropic
// API key: the photo is uploaded to Anthropic's API to be read, then
// discarded. Nothing else in this app ever leaves this computer - see the
// key entered under "Fill in the name from a photo," stored only in this
// browser's local storage (specific to this computer/file location).
//
// A forced tool call (rather than asking for free-text/JSON) is used so the
// response is guaranteed to be structured - no brittle text parsing needed.

const CLAUDE_API_KEY_STORAGE_KEY = "metroApp.claudeApiKey";
const CLAUDE_MODEL = "claude-sonnet-5";
// Anthropic's vision guidance: images are internally capped around this
// edge length anyway, so sending anything larger just wastes upload time on
// (often slow) office wifi without improving accuracy.
const CLAUDE_MAX_IMAGE_DIMENSION = 1568;

function getSavedClaudeApiKey() {
  try {
    return localStorage.getItem(CLAUDE_API_KEY_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveClaudeApiKey(key) {
  try {
    localStorage.setItem(CLAUDE_API_KEY_STORAGE_KEY, key);
  } catch {
    // Storage unavailable (e.g. blocked by browser settings) - the key
    // simply won't persist across sessions; the caller still has it in
    // memory for the current one.
  }
}

async function resizeImageForUpload(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, CLAUDE_MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
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

const NAME_EXTRACTION_TOOL = {
  name: "record_decedent_name",
  description:
    "Records the decedent's name as read from the 'Name of Deceased' field on the Texas Burial-Transit Permit shown in the photo.",
  input_schema: {
    type: "object",
    properties: {
      found: {
        type: "boolean",
        description: "true if a decedent name was legible on the permit, false otherwise.",
      },
      firstName: {
        type: "string",
        description: "First name, properly capitalized (e.g. 'John'). Empty string if not found.",
      },
      middleName: {
        type: "string",
        description: "Middle name or initial, properly capitalized. Empty string if there is none.",
      },
      lastName: {
        type: "string",
        description: "Last name, properly capitalized. Empty string if not found.",
      },
      suffix: {
        type: "string",
        description: "Suffix such as Jr, Sr, II, III if present on the permit, otherwise empty string.",
      },
    },
    required: ["found", "firstName", "middleName", "lastName", "suffix"],
  },
};

// Sends the photo to Claude and returns {found, firstName, middleName, lastName, suffix}.
async function extractNameFromBtpPhoto(file, apiKey) {
  const resized = await resizeImageForUpload(file);
  const base64Data = await blobToBase64(resized);

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 512,
        tools: [NAME_EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: NAME_EXTRACTION_TOOL.name },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Data } },
              {
                type: "text",
                text:
                  "This is a photo of a printed Texas Burial-Transit Permit. Find the " +
                  "\"Name of Deceased\" field - it may be one line, or split into separate " +
                  "First/Middle/Last columns - and record it with the record_decedent_name tool.",
              },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Could not reach Anthropic - check your internet connection and try again.");
    }
    throw error;
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('That API key was rejected - check it under "Fill in the name from a photo" and try again.');
    }
    const body = await response.text().catch(() => "");
    throw new Error(`Claude API error (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const toolUse = (data.content || []).find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a recognized result.");
  return toolUse.input;
}
