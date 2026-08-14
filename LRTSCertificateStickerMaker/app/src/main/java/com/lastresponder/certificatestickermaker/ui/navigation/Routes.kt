package com.lastresponder.certificatestickermaker.ui.navigation

/** All 14 screens, matching the task's required-screens list. */
object Routes {
    const val HOME = "home"
    const val CAPTURE_BTP = "capture_btp"
    const val CAPTURE_LOG = "capture_log"
    const val MANUAL_ENTRY = "manual_entry"
    const val OCR_REVIEW = "ocr_review"
    const val VERIFICATION = "verification"
    const val CERTIFICATE_PREVIEW = "certificate_preview"
    const val FUNERAL_HOME_SELECT = "funeral_home_select"
    const val LABEL_QUANTITY = "label_quantity"
    const val LABEL_PREVIEW = "label_preview"
    const val RESULTS = "results"
    const val PROFILE_MANAGER = "profile_manager"
    const val PROFILE_ADD = "profile_add"
    const val PROFILE_EDIT_PATTERN = "profile_edit/{profileId}"
    fun profileEdit(profileId: String) = "profile_edit/$profileId"
    const val SETTINGS = "settings"
}
