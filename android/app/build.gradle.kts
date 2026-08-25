plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

val leasePublicKey = providers.environmentVariable("DISCIPLINEOS_LEASE_PUBLIC_KEY_BASE64")
    .orElse("JP7DAT1FP0pr7PBUoet0W27gTWvqqZm4BjxFfjhOG8M=")
    .get()
val leaseKeyId = providers.environmentVariable("DISCIPLINEOS_LEASE_KEY_ID")
    .orElse("server-lease-v1")
    .get()

android {
    namespace = "com.disciplineos"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.disciplineos"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "LEASE_PUBLIC_KEY_BASE64", "\"$leasePublicKey\"")
        buildConfigField("String", "LEASE_KEY_ID", "\"$leaseKeyId\"")

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)

    // Room
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // WorkManager & Coroutines
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)

    // Location & Activity Recognition
    implementation(libs.play.services.location)

    // Networking
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)

    implementation(libs.bouncycastle)
    implementation(libs.okhttp.logging)

    debugImplementation(libs.androidx.ui.tooling)

    testImplementation(libs.junit)
}
