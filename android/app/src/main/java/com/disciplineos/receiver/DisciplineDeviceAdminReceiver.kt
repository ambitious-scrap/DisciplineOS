package com.disciplineos.receiver

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast

class DisciplineDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "DisciplineOS Device Admin / Device Owner enabled successfully")
        Toast.makeText(context, "DisciplineOS Hard Mode Active", Toast.LENGTH_SHORT).show()
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        Log.w(TAG, "Deactivation of DisciplineOS Device Admin requested by user")
        return "WARNING: Disabling DisciplineOS Device Admin will immediately trigger an authoritative protection degradation incident on the server."
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.w(TAG, "DisciplineOS Device Admin disabled")
    }

    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) {
        super.onLockTaskModeEntering(context, intent, pkg)
        Log.i(TAG, "Lock task mode entered for package: $pkg")
    }

    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        super.onLockTaskModeExiting(context, intent)
        Log.i(TAG, "Lock task mode exited")
    }

    companion object {
        private const val TAG = "DisciplineAdmin"

        fun getComponentName(context: Context): ComponentName {
            return ComponentName(context, DisciplineDeviceAdminReceiver::class.java)
        }

        fun isDeviceOwner(context: Context): Boolean {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            return dpm.isDeviceOwnerApp(context.packageName)
        }

        fun suspendPackages(context: Context, packageNames: Array<String>, suspended: Boolean): Boolean {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = getComponentName(context)
            return try {
                if (dpm.isDeviceOwnerApp(context.packageName)) {
                    val result = dpm.setPackagesSuspended(admin, packageNames, suspended)
                    Log.i(TAG, "Suspended packages (${packageNames.joinToString()}): $suspended -> result: ${result?.joinToString()}")
                    true
                } else {
                    Log.w(TAG, "Cannot suspend packages: app is not Device Owner")
                    false
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error suspending packages", e)
                false
            }
        }
    }
}
