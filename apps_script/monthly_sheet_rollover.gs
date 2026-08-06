/**
 * Monthly call-log spreadsheet rollover.
 *
 * Runs entirely inside YOUR Google account (not the cooler board app's
 * service account) -- that's on purpose. The service account has no
 * Drive storage quota of its own, so it can't create new files. This
 * script creates the new sheet under your account (which has normal
 * storage), then shares it with the service account, same as the
 * manual "share this sheet" step you'd otherwise do every month by
 * hand. The app then auto-detects and adopts it -- see
 * expected_sheet_name() / find_shared_sheet_by_name() in the Python
 * app (sheets_integration.py / app.py).
 *
 * ---------------------------------------------------------------
 * ONE-TIME SETUP
 * ---------------------------------------------------------------
 * 1. Fill in the three constants right below this comment block.
 * 2. Open Extensions -> Apps Script from any Google Sheet, paste this
 *    whole file in, and save.
 * 3. Run bootstrapPreviousSheetId() ONCE, with the ID of whichever
 *    sheet is CURRENTLY active (this month's), so the script knows
 *    where to read the last case number from the first time it runs.
 *    Google will ask you to authorize the script the first time you
 *    run anything -- that's expected, approve it.
 * 4. Run installMonthlyTrigger() ONCE. This sets up the schedule and
 *    never needs to be run again.
 * That's it -- from here on, a new sheet gets created, numbered, and
 * shared automatically at the start of every month, with no further
 * action from you.
 *
 * Case numbers are assumed to be "<prefix><number>" (e.g. M26-22789)
 * that just keeps counting up forever -- this script never resets the
 * number and never changes the prefix on its own. If your numbering
 * convention ever changes (e.g. the prefix should update for a new
 * year), that's a manual one-line edit here, not automatic.
 */

const SERVICE_ACCOUNT_EMAIL = "PASTE-YOUR-SERVICE-ACCOUNT-EMAIL-HERE@your-project.iam.gserviceaccount.com";
const TEMPLATE_SHEET_ID = "PASTE-A-TEMPLATE-SPREADSHEET-ID-HERE"; // headers already set up, columns A-P
const DEST_FOLDER_ID = ""; // optional -- leave blank to create in "My Drive" root
const ROWS_TO_PRENUMBER = 300;
const NOTIFY_EMAIL = ""; // optional -- leave blank to skip the confirmation email

function bootstrapPreviousSheetId(sheetId) {
  PropertiesService.getScriptProperties().setProperty("PREVIOUS_SHEET_ID", sheetId);
  Logger.log("Previous sheet ID set to: " + sheetId);
}

function installMonthlyTrigger() {
  // Clears any existing trigger for this function first, so re-running
  // this setup function is always safe and never creates duplicates.
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "createNextMonthSheet") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("createNextMonthSheet")
    .timeBased()
    .onMonthDay(1)
    .atHour(0)
    .nearMinute(5)
    .create();
  Logger.log("Monthly trigger installed -- fires around 12:05 AM on the 1st of each month.");
}

function createNextMonthSheet() {
  try {
    const props = PropertiesService.getScriptProperties();
    const previousSheetId = props.getProperty("PREVIOUS_SHEET_ID");
    if (!previousSheetId) {
      throw new Error(
        "PREVIOUS_SHEET_ID isn't set -- run bootstrapPreviousSheetId('<id>') once first."
      );
    }

    const { prefix, width, lastNumber } = findLastCaseNumber(previousSheetId);

    const newName = monthlySheetName(new Date());
    const newFile = DriveApp.getFileById(TEMPLATE_SHEET_ID).makeCopy(newName);
    if (DEST_FOLDER_ID) {
      const folder = DriveApp.getFolderById(DEST_FOLDER_ID);
      folder.addFile(newFile);
      DriveApp.getRootFolder().removeFile(newFile);
    }

    const newSpreadsheet = SpreadsheetApp.openById(newFile.getId());
    const sheet = newSpreadsheet.getSheets()[0];

    const rows = [];
    for (let i = 1; i <= ROWS_TO_PRENUMBER; i++) {
      const nextNumber = String(lastNumber + i).padStart(width, "0");
      rows.push([prefix + nextNumber]);
    }
    sheet.getRange(2, 1, rows.length, 1).setValues(rows);

    DriveApp.getFileById(newFile.getId()).addEditor(SERVICE_ACCOUNT_EMAIL);

    props.setProperty("PREVIOUS_SHEET_ID", newFile.getId());

    const message =
      `Created "${newName}" (${rows.length} rows pre-numbered, ` +
      `${prefix}${String(lastNumber + 1).padStart(width, "0")} through ` +
      `${prefix}${String(lastNumber + rows.length).padStart(width, "0")}), ` +
      `shared with ${SERVICE_ACCOUNT_EMAIL}.\n\n${newFile.getUrl()}`;
    Logger.log(message);
    if (NOTIFY_EMAIL) {
      MailApp.sendEmail(NOTIFY_EMAIL, "New call log spreadsheet created: " + newName, message);
    }
  } catch (err) {
    Logger.log("createNextMonthSheet failed: " + err);
    if (NOTIFY_EMAIL) {
      MailApp.sendEmail(
        NOTIFY_EMAIL,
        "Monthly call log spreadsheet creation FAILED",
        "The automatic monthly rollover failed with this error:\n\n" +
          err +
          "\n\nYou'll need to create/share this month's sheet manually (see the app's " +
          '"This Month\'s Spreadsheet" panel) until this is fixed.'
      );
    }
    throw err;
  }
}

/** "SEPTEMBER 2026 CALL LOG" -- MUST match expected_sheet_name() in app.py exactly. */
function monthlySheetName(date) {
  const monthYear = Utilities.formatDate(date, Session.getScriptTimeZone(), "MMMM yyyy");
  return monthYear.toUpperCase() + " CALL LOG";
}

/** Reads column A of the given sheet, finds the last non-empty case
 * number, and splits it into its letter/dash prefix and numeric tail
 * (e.g. "M26-22789" -> prefix "M26-", width 5, lastNumber 22789). */
function findLastCaseNumber(sheetId) {
  const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
  const values = sheet.getRange("A:A").getValues();

  let lastValue = null;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = String(values[i][0] || "").trim();
    if (v) {
      lastValue = v;
      break;
    }
  }
  if (!lastValue) {
    throw new Error(`Column A of sheet ${sheetId} looks completely empty -- can't continue the sequence.`);
  }

  const match = lastValue.match(/^(.*?)(\d+)\s*$/);
  if (!match) {
    throw new Error(`Last case number "${lastValue}" doesn't end in a number -- can't continue the sequence.`);
  }
  return {
    prefix: match[1],
    width: match[2].length,
    lastNumber: parseInt(match[2], 10),
  };
}
