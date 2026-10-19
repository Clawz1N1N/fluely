package com.plugin.keychain
import android.app.Activity
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.*
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg class KeychainOptions { var key: String = ""; var password: String = "" }
/** Ciphertext in app-private preferences, encryption key only in Android Keystore. */
@TauriPlugin class KeychainPlugin(private val activity: Activity): Plugin(activity) {
    private val alias = "FluelyCredentials/v1"
    private val preferences get() = activity.getSharedPreferences("fluely_encrypted_credentials", Context.MODE_PRIVATE)
    @Synchronized private fun encryptionKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun args(invoke: Invoke): KeychainOptions = invoke.parseArgs(KeychainOptions::class.java).also { require(it.key.isNotEmpty() && !it.key.contains('\u0000') && it.key.length <= 4096) { "Invalid credential key" } }
    @Command fun saveItem(invoke: Invoke) { try {
        val options = args(invoke); val plain = options.password.toByteArray(Charsets.UTF_8)
        require(plain.size <= 32768) { "Credential is too large" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, encryptionKey()); updateAAD(options.key.toByteArray(Charsets.UTF_8)) }
        val encrypted = try { cipher.doFinal(plain) } finally { plain.fill(0) }
        val value = Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
        check(preferences.edit().putString(options.key, value).commit()) { "Cannot persist encrypted credential" }
        invoke.resolve(JSObject())
    } catch (failure: Exception) { invoke.reject(failure.message ?: "Cannot save credential") } }
    @Command fun getItem(invoke: Invoke) { try {
        val options = args(invoke); val value = preferences.getString(options.key, null)
        if (value == null) { invoke.resolve(JSObject().apply { put("password", null) }); return }
        val encrypted = Base64.decode(value, Base64.NO_WRAP); require(encrypted.size >= 28) { "Invalid encrypted credential" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, encrypted.copyOfRange(0, 12))); updateAAD(options.key.toByteArray(Charsets.UTF_8)) }
        val plain = cipher.doFinal(encrypted.copyOfRange(12, encrypted.size))
        try { invoke.resolve(JSObject().apply { put("password", String(plain, Charsets.UTF_8)) }) } finally { plain.fill(0) }
    } catch (failure: Exception) { invoke.reject(failure.message ?: "Cannot read credential; re-enter the API key") } }
    @Command fun removeItem(invoke: Invoke) { try { val options = args(invoke); check(preferences.edit().remove(options.key).commit()) { "Cannot remove credential" }; invoke.resolve(JSObject()) } catch (failure: Exception) { invoke.reject(failure.message ?: "Cannot remove credential") } }
}
