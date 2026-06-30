package pro.logoff.wms.tsd.auth

import android.content.Context
import pro.logoff.wms.tsd.network.AuthLoginResponse

data class TsdSession(
    val accessToken: String,
    val tokenType: String,
    val deviceCode: String,
    val deviceName: String,
)

class TsdSessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("logoff_wms_tsd_session", Context.MODE_PRIVATE)

    fun load(): TsdSession? {
        val token = prefs.getString(KEY_TOKEN, null) ?: return null
        val tokenType = prefs.getString(KEY_TOKEN_TYPE, null) ?: "Bearer"
        val deviceCode = prefs.getString(KEY_DEVICE_CODE, null) ?: return null
        val deviceName = prefs.getString(KEY_DEVICE_NAME, null) ?: deviceCode

        return TsdSession(
            accessToken = token,
            tokenType = tokenType,
            deviceCode = deviceCode,
            deviceName = deviceName,
        )
    }

    fun save(response: AuthLoginResponse, deviceCode: String) {
        prefs.edit()
            .putString(KEY_TOKEN, response.accessToken)
            .putString(KEY_TOKEN_TYPE, response.tokenType)
            .putString(KEY_DEVICE_CODE, deviceCode)
            .putString(KEY_DEVICE_NAME, response.user.name)
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_TOKEN = "access_token"
        private const val KEY_TOKEN_TYPE = "token_type"
        private const val KEY_DEVICE_CODE = "device_code"
        private const val KEY_DEVICE_NAME = "device_name"
    }
}
