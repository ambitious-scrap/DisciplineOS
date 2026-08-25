package com.disciplineos.data.auth

import android.content.Context
import android.util.Base64
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

/** Stores one encrypted credential snapshot so device identity and tokens cannot tear independently. */
data class DeviceCredentials(
    val deviceId: String,
    val accessToken: String,
    val refreshToken: String,
)

class DeviceCredentialStore(context: Context) : CredentialSnapshotStore {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val lock = Any()

    override fun read(): DeviceCredentials? = synchronized(lock) {
        val encrypted = preferences.getString(PAYLOAD_KEY, null) ?: return@synchronized null
        return@synchronized try {
            val payload = JSONObject(decrypt(encrypted))
            val deviceId = payload.getString("deviceId")
            val accessToken = payload.getString("accessToken")
            val refreshToken = payload.getString("refreshToken")
            if (deviceId.isBlank() || accessToken.isBlank() || refreshToken.isBlank()) {
                clearLocked()
                null
            } else {
                DeviceCredentials(deviceId, accessToken, refreshToken)
            }
        } catch (_: Exception) {
            // Corrupt credentials are never partially recovered. Cached policy remains local authority.
            clearLocked()
            null
        }
    }

    override fun write(credentials: DeviceCredentials) = synchronized(lock) {
        require(credentials.deviceId.isNotBlank()) { "Device ID must not be blank" }
        require(credentials.accessToken.isNotBlank()) { "Access token must not be blank" }
        require(credentials.refreshToken.isNotBlank()) { "Refresh token must not be blank" }
        val payload = JSONObject()
            .put("deviceId", credentials.deviceId)
            .put("accessToken", credentials.accessToken)
            .put("refreshToken", credentials.refreshToken)
        check(preferences.edit().putString(PAYLOAD_KEY, encrypt(payload.toString())).commit()) {
            "Could not persist device credentials"
        }
    }

    override fun clear() = synchronized(lock) { clearLocked() }

    private fun clearLocked() {
        preferences.edit().clear().commit()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val ciphertext = Base64.encodeToString(cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8)), Base64.NO_WRAP)
        return "$iv:$ciphertext"
    }

    private fun decrypt(value: String): String {
        val parts = value.split(':', limit = 2)
        require(parts.size == 2) { "Malformed encrypted credential payload" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            GCMParameterSpec(GCM_TAG_LENGTH_BITS, Base64.decode(parts[0], Base64.NO_WRAP)),
        )
        return String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "disciplineos.device.credentials.v1"
        const val PREFERENCES = "disciplineos_secure_credentials"
        const val PAYLOAD_KEY = "encrypted_snapshot"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_LENGTH_BITS = 128
    }
}
