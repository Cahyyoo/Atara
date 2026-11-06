import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// The release key, when this machine has it. CI writes this file from its
// secrets and refuses to build without them; see .github/workflows/mobile-release.yml.
val keyProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "com.atara.mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.atara.mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Compressed in the APK: this is what a device downloads on every update.
    // They take a little more room once installed.
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }

    signingConfigs {
        if (keyProperties.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keyProperties.getProperty("storeFile"))
                storePassword = keyProperties.getProperty("storePassword")
                keyAlias = keyProperties.getProperty("keyAlias")
                keyPassword = keyProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // The debug key only where the release key is absent, so a local
            // `flutter run --release` still works. Android installs an update
            // only over the same key, so published builds must use the real one.
            signingConfig = signingConfigs.findByName("release")
                ?: signingConfigs.getByName("debug")

            // Dart is compiled ahead of time and is untouched by this; what it
            // strips is the Java and Kotlin side, which here means the Flutter
            // embedding plus mobile_scanner's CameraX and ML Kit barcode
            // models. Those shipped whole before, and they are the bulk of the
            // APK. ML Kit and CameraX both publish consumer ProGuard rules, so
            // the shrinker is told what to keep — but this is exactly the kind
            // of change that breaks a camera silently in release only, so the
            // scanner is tested on a device rather than assumed.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

// Release is arm64 only. --target-platform filters only Flutter's own library;
// the plugins would still bring theirs for every CPU, and a device they name but
// Flutter does not cover could install the app, then crash on open. By build type,
// so a debug build still runs on an x86_64 emulator.
androidComponents {
    onVariants(selector().withBuildType("release")) { variant ->
        variant.packaging.jniLibs.excludes.addAll("lib/armeabi-v7a/**", "lib/x86_64/**")
    }
}

flutter {
    source = "../.."
}

dependencies {
    // FileProvider, for handing a downloaded update to the system installer.
    implementation("androidx.core:core-ktx:1.13.1")
}
