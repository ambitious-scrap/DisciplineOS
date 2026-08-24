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
import java.nio.ByteBuffer

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
                .setSession("DisciplineOS DNS Protection Shield")
                .addAddress("10.0.0.2", 32)
                .addDnsServer("1.1.1.1")
                .addRoute("0.0.0.0", 0) // Route DNS
                .setBlocking(false)

            vpnInterface = builder.establish()
            Log.i(TAG, "DisciplineOS DNS Shield VPN Interface established")

            val app = application as? DisciplineApplication

            vpnScope.launch {
                runDnsLoop(app)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to establish VPN interface", e)
            stopSelf()
        }
    }

    private suspend fun runDnsLoop(app: DisciplineApplication?) {
        val pfd = vpnInterface ?: return
        val inputStream = FileInputStream(pfd.fileDescriptor)
        val outputStream = FileOutputStream(pfd.fileDescriptor)
        val packet = ByteArray(32767)

        val upstreamDns = InetAddress.getByName("1.1.1.1")
        val upstreamSocket = DatagramSocket()
        protect(upstreamSocket) // Prevent VPN routing loop

        while (isRunning && vpnScope.isActive) {
            try {
                val length = withContext(Dispatchers.IO) { inputStream.read(packet) }
                if (length > 0) {
                    // Inspect IP Packet (IPv4 header = min 20 bytes)
                    if (length > 28 && packet[9] == 17.toByte()) { // Protocol 17 = UDP
                        val ipHeaderLength = (packet[0].toInt() and 0x0F) * 4
                        val udpPayloadOffset = ipHeaderLength + 8

                        if (length > udpPayloadOffset + 12) {
                            val dnsPayload = packet.copyOfRange(udpPayloadOffset, length)
                            val domain = extractDomainFromDnsQuery(dnsPayload)

                            if (domain != null && domain.isNotBlank()) {
                                val isBlocked = app?.policyRepository?.isDomainBlocked(domain) ?: false
                                val activeLease = app?.sessionRepository?.getActiveLeaseForIdentifier(domain)

                                if (isBlocked && activeLease == null) {
                                    Log.w(TAG, "🛡️ Blocked DNS Query for domain: $domain -> Returning NXDOMAIN")
                                    val nxResponse = createNxDomainResponse(packet, length, ipHeaderLength, dnsPayload)
                                    withContext(Dispatchers.IO) {
                                        outputStream.write(nxResponse)
                                    }
                                    continue
                                }
                            }
                        }
                    }

                    // Forward legitimate traffic or pass through
                }
            } catch (e: Exception) {
                if (isRunning) {
                    Log.w(TAG, "VPN packet processing loop notice", e)
                }
                delay(10)
            }
        }

        try {
            upstreamSocket.close()
        } catch (_: Exception) {}
    }

    /**
     * Extracts QNAME domain string from raw DNS query payload (RFC 1035)
     */
    private fun extractDomainFromDnsQuery(dnsPayload: ByteArray): String? {
        try {
            if (dnsPayload.size < 12) return null
            var pos = 12
            val sb = StringBuilder()

            while (pos < dnsPayload.size) {
                val labelLength = dnsPayload[pos].toInt() and 0xFF
                if (labelLength == 0) break
                pos++

                if (pos + labelLength > dnsPayload.size) return null
                if (sb.isNotEmpty()) sb.append('.')

                for (i in 0 until labelLength) {
                    sb.append(dnsPayload[pos + i].toInt().toChar())
                }
                pos += labelLength
            }

            return sb.toString().lowercase()
        } catch (_: Exception) {
            return null
        }
    }

    /**
     * Constructs a synthetic DNS NXDOMAIN (RCODE=3) error packet back to the client
     */
    private fun createNxDomainResponse(
        originalPacket: ByteArray,
        length: Int,
        ipHeaderLength: Int,
        dnsQuery: ByteArray
    ): ByteArray {
        val response = originalPacket.copyOf(length)

        // Swap Source IP and Destination IP
        for (i in 0 until 4) {
            val src = response[12 + i]
            response[12 + i] = response[16 + i]
            response[16 + i] = src
        }

        // Swap UDP Ports
        val srcPortOffset = ipHeaderLength
        val dstPortOffset = ipHeaderLength + 2
        val p0 = response[srcPortOffset]
        val p1 = response[srcPortOffset + 1]
        response[srcPortOffset] = response[dstPortOffset]
        response[srcPortOffset + 1] = response[dstPortOffset + 1]
        response[dstPortOffset] = p0
        response[dstPortOffset + 1] = p1

        // Set DNS Flags: QR=1 (Response), AA=1, RA=1, RCODE=3 (NXDOMAIN)
        val dnsOffset = ipHeaderLength + 8
        response[dnsOffset + 2] = 0x81.toByte() // QR=1, RD=1
        response[dnsOffset + 3] = 0x83.toByte() // RA=1, RCODE=3 (NXDOMAIN)

        return response
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
