# Debug builds are not minified. These rules apply only if a minified
# release build is produced in the future.
-keep class com.lastresponder.certificatestickermaker.data.** { *; }
-keepattributes *Annotation*
