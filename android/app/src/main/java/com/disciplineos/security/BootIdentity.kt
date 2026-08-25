package com.disciplineos.security

import android.content.Context
import android.provider.Settings

object BootIdentity {
    fun current(context: Context): Long {
        return runCatching {
            Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT).toLong()
        }.getOrDefault(-1L)
    }
}
