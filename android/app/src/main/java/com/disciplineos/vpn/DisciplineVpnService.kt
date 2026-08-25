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
import java.net.SocketTimeoutException

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
                .addDnsServer(UPSTREAM_DNS)
                .addRoute(UPSTREAM_DNS, 32)
                .setBlocking(false)

            vpnInterface = builder.establish()
            Log.i(TAG, "DisciplineOS DNS Shield VPN interface established")

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
        FileInputStream(pfd.fileDescriptor).use { inputStream ->
            FileOutputStream(pfd.fileDescriptor).use { outputStream ->
                val packet = ByteArray(MAX_PACKET_SIZE)
                val upstreamDns = InetAddress.getByName(UPSTREAM_DNS)
                DatagramSocket().use { upstreamSocket ->
                    protect(upstreamSocket)
                    upstreamSocket.connect(upstreamDns, DNS_PORT)
                    upstreamSocket.soTimeout = DNS_TIMEOUT_MS

                    while (isRunning && vpnScope.isActive) {
                        try {
                            val length = inputStream.read(packet)
                            if (length <= 0 || length < IPV4_HEADER_MIN + UDP_HEADER_SIZE) continue
                            if ((packet[0].toInt() ushr 4) != 4 || packet[9].toInt() and 0xFF != UDP_PROTOCOL) continue

                            val ipHeaderLength = (packet[0].toInt() and 0x0F) * 4
                            if (ipHeaderLength < IPV4_HEADER_MIN || length <= ipHeaderLength + UDP_HEADER_SIZE) continue
                            val destinationPort = readUnsignedShort(packet, ipHeaderLength + 2)
                            if (destinationPort != DNS_PORT) continue

                            val dnsOffset = ipHeaderLength + UDP_HEADER_SIZE
                            val dnsPayload = packet.copyOfRange(dnsOffset, length)
                            val domain = extractDomainFromDnsQuery(dnsPayload) ?: continue
                            val isBlocked = app?.policyRepository?.isDomainBlocked(domain) ?: false
                            val activeLease = app?.sessionRepository?.getActiveLeaseForIdentifier(domain)
                            val responseDns = if (isBlocked && activeLease == null) {
                                Log.w(TAG, "Blocked DNS query for domain: $domain")
                                createNxDomainDnsPayload(dnsPayload)
                            } else {
                                forwardDnsQuery(upstreamSocket, upstreamDns, dnsPayload)
                            }
                            if (responseDns != null) {
                                outputStream.write(createDnsResponse(packet, ipHeaderLength, responseDns))
                            }
                        } catch (_: SocketTimeoutException) {
                            // An upstream timeout is a dropped DNS response, not a VPN failure.
                        } catch (e: Exception) {
                            if (isRunning) Log.w(TAG, "VPN DNS packet processing notice", e)
                            delay(10)
                        }
                    }
                }
            }
        }
    }

    private fun forwardDnsQuery(
        upstreamSocket: DatagramSocket,
        upstreamDns: InetAddress,
        dnsPayload: ByteArray
    ): ByteArray? {
        upstreamSocket.send(DatagramPacket(dnsPayload, dnsPayload.size, upstreamDns, DNS_PORT))
        val response = ByteArray(MAX_DNS_PACKET_SIZE)
        val responsePacket = DatagramPacket(response, response.size)
        upstreamSocket.receive(responsePacket)
        return response.copyOf(responsePacket.length)
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

    private fun createNxDomainDnsPayload(query: ByteArray): ByteArray {
        val response = query.copyOf()
        if (response.size >= 12) {
            val flags = readUnsignedShort(response, 2)
            writeUnsignedShort(response, 2, flags or 0x8000 or 0x0003)
            writeUnsignedShort(response, 6, 0)
            writeUnsignedShort(response, 8, 0)
            writeUnsignedShort(response, 10, 0)
        }
        return response
    }

    private fun createDnsResponse(
        originalPacket: ByteArray,
        ipHeaderLength: Int,
        dnsResponse: ByteArray
    ): ByteArray {
        val udpLength = UDP_HEADER_SIZE + dnsResponse.size
        val response = ByteArray(ipHeaderLength + udpLength)
        originalPacket.copyInto(
            response,
            destinationOffset = 0,
            startIndex = 0,
            endIndex = ipHeaderLength + UDP_HEADER_SIZE
        )
        dnsResponse.copyInto(response, destinationOffset = ipHeaderLength + UDP_HEADER_SIZE)

        for (i in 0 until 4) {
            val source = response[12 + i]
            response[12 + i] = response[16 + i]
            response[16 + i] = source
        }
        for (i in 0 until 2) {
            val source = response[ipHeaderLength + i]
            response[ipHeaderLength + i] = response[ipHeaderLength + 2 + i]
            response[ipHeaderLength + 2 + i] = source
        }

        writeUnsignedShort(response, 2, response.size)
        writeUnsignedShort(response, ipHeaderLength + 4, udpLength)
        writeUnsignedShort(response, 10, 0)
        writeUnsignedShort(response, 10, internetChecksum(response, 0, ipHeaderLength))
        writeUnsignedShort(response, ipHeaderLength + 6, 0)

        var pseudoHeaderSum = 0L
        for (offset in 12 until 20 step 2) {
            pseudoHeaderSum += readUnsignedShort(response, offset)
        }
        pseudoHeaderSum += UDP_PROTOCOL
        pseudoHeaderSum += udpLength
        val udpChecksum = internetChecksum(response, ipHeaderLength, udpLength, pseudoHeaderSum)
        writeUnsignedShort(response, ipHeaderLength + 6, if (udpChecksum == 0) 0xFFFF else udpChecksum)
        return response
    }

    private fun readUnsignedShort(data: ByteArray, offset: Int): Int {
        return ((data[offset].toInt() and 0xFF) shl 8) or (data[offset + 1].toInt() and 0xFF)
    }

    private fun writeUnsignedShort(data: ByteArray, offset: Int, value: Int) {
        data[offset] = (value ushr 8).toByte()
        data[offset + 1] = value.toByte()
    }

    private fun internetChecksum(
        data: ByteArray,
        offset: Int,
        length: Int,
        initial: Long = 0
    ): Int {
        var sum = initial
        var position = offset
        val end = offset + length
        while (position + 1 < end) {
            sum += readUnsignedShort(data, position)
            position += 2
        }
        if (position < end) {
            sum += (data[position].toInt() and 0xFF) shl 8
        }
        while ((sum ushr 16) != 0L) {
            sum = (sum and 0xFFFF) + (sum ushr 16)
        }
        return sum.inv().toInt() and 0xFFFF
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
        private const val TAG = "DisciplineOSVpn"
        private const val UPSTREAM_DNS = "1.1.1.1"
        private const val DNS_PORT = 53
        private const val UDP_PROTOCOL = 17
        private const val IPV4_HEADER_MIN = 20
        private const val UDP_HEADER_SIZE = 8
        private const val MAX_PACKET_SIZE = 32767
        private const val MAX_DNS_PACKET_SIZE = 4096
        private const val DNS_TIMEOUT_MS = 2000
        const val ACTION_STOP = "com.disciplineos.vpn.STOP"
    }
}
