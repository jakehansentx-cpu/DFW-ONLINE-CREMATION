pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
plugins {
    // Lets Gradle auto-download a matching JDK for the jvmToolchain(17) requirement
    // below instead of failing when no JDK 17 is already installed locally.
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.8.0"
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "LRTS Certificate & Sticker Maker"
include(":app")
