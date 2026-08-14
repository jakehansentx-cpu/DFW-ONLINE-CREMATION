package com.lastresponder.certificatestickermaker

import android.app.Application

/**
 * No analytics, no crash-reporting SDK, no network client is initialized
 * here - decedent information and source-document photos never leave the
 * device (see README.md "Privacy and security").
 */
class LrtsApplication : Application()
