package com.disciplineos.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED || intent?.action == "android.intent.action.QUICKBOOT_POWERON") {
            Log.i("BootReceiver", "Boot completed detected. Restoring DisciplineOS services.")
            context?.let {
                DisciplineForegroundService.start(it)
            }
        }
    }
}
