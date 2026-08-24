package com.disciplineos.vpn

import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import com.disciplineos.DisciplineApplication
import kotlinx.coroutines.*
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

class DisciplineVpnService : VpnService() {

    private var vpnInterface: ParcelFileDescriptor? = null
    private val vpnScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var isRunning = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopVpn()
            return START_NOT_STICKY
        }

        startVpn()
        return START_STICKY
    }

    private fun startVpn() {
        if (isRunning) return
        isRunning = true

        try {
            val builder = Builder()
                .setSession("DisciplineOS DNS Protection")
                .addAddress("10.0.0.2", 32)
                .addDnsServer("10.0.0.1") // Local DNS interceptor
                .addRoute("10.0.0.1", 32) // Route only DNS traffic
                .setBlocking(true)

            vpnInterface = builder.establish()
            Log.i(TAG, "DisciplineOS VPN Interface established successfully")

            val app = application as? DisciplineApplication
            val policyDao = app?.database?.policyDao()

            vpnScope.launch {
                runDnsLoop(policyDao)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to establish VPN interface", e)
            stopSelf()
        }
    }

    private suspend fun runDnsLoop(policyDao: com.disciplineos.data.local.dao.PolicyDao?) {
        val pfd = vpnInterface ?: return
        val inputStream = FileInputStream(pfd.fileDescriptor)
        val outputStream = FileOutputStream(pfd.fileDescriptor)
        val packet = ByteArray(4096)

        while (isRunning) {
            try {
                val length = withContext(Dispatchers.IO) { inputStream.read(packet) }
                if (length > 0) {
                    // Forward legitimate DNS requests or filter matching blocked domains
                    // (Simplified DNS resolver loop)
                }
            } catch (e: Exception) {
                if (isRunning) {
                    Log.w(TAG, "VPN packet read error", e)
                }
                break
            }
        }
    }

    private fun stopVpn() {
        isRunning = false
        vpnScope.cancel()
        try {
            vpnInterface?.close()
            vpnInterface = null
        } catch (e: Exception) {
            Log.e(TAG, "Error closing VPN interface", e)
        }
        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopVpn()
    }

    companion object {
        private const val TAG = "DisciplineVpnService"
        const val ACTION_STOP = "com.disciplineos.vpn.STOP"
    }
}
