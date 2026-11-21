package com.streamhub.tv

import android.content.Context
import android.net.ConnectivityManager
import android.net.wifi.WifiManager
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.util.Collections
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Acha o StreamHub do PC na rede local: testa a porta da interface (5173) em todos os endereços da sub-rede da TV
 * e confirma pelo /api/system/status, que responde {"app":"streamhub"} sem precisar de login.
 */
object ServerFinder {
    const val PORT = 5173

    /** Normaliza o que o usuário digitou: "192.168.0.10" → "http://192.168.0.10:5173". */
    fun normalize(input: String): String? {
        var s = input.trim().trimEnd('/')
        if (s.isEmpty()) return null
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
        return try {
            val u = URL(s)
            if (u.host.isNullOrEmpty()) return null
            val port = if (u.port > 0) u.port else PORT
            "${u.protocol}://${u.host}:$port"
        } catch (e: Exception) {
            null
        }
    }

    /** true se no endereço existe um StreamHub respondendo. */
    fun probe(base: String, timeoutMs: Int = 2500): Boolean {
        var c: HttpURLConnection? = null
        return try {
            c = URL("$base/api/system/status").openConnection() as HttpURLConnection
            c.connectTimeout = timeoutMs
            c.readTimeout = timeoutMs
            c.useCaches = false
            if (c.responseCode != 200) return false
            val body = c.inputStream.bufferedReader().use { it.readText() }
            body.contains("\"app\"") && body.contains("streamhub")
        } catch (e: Exception) {
            false
        } finally {
            c?.disconnect()
        }
    }

    /** Endereço IPv4 da TV e o tamanho da sub-rede, ou null sem rede. */
    private fun localAddress(context: Context): Pair<ByteArray, Int>? {
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val lp = cm.getLinkProperties(cm.activeNetwork)
            lp?.linkAddresses?.firstOrNull { it.address is Inet4Address && !it.address.isLoopbackAddress }?.let {
                return it.address.address to it.prefixLength
            }
        } catch (e: Exception) { /* sem permissão ou API antiga: tenta pelo Wi-Fi */ }
        try {
            @Suppress("DEPRECATION")
            val ip = (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo.ipAddress
            if (ip != 0) return byteArrayOf(ip.toByte(), (ip shr 8).toByte(), (ip shr 16).toByte(), (ip shr 24).toByte()) to 24
        } catch (e: Exception) { /* sem Wi-Fi */ }
        return null
    }

    fun localIp(context: Context): String? = localAddress(context)?.first?.joinToString(".") { (it.toInt() and 0xff).toString() }

    /**
     * Varre a sub-rede (no máximo um /24 em volta da TV, ~254 endereços) e devolve os StreamHub encontrados.
     * Leva poucos segundos: só abre HTTP onde a porta respondeu.
     */
    fun scan(context: Context, onProgress: (Int) -> Unit = {}): List<String> {
        val (ip, prefix) = localAddress(context) ?: return emptyList()
        val hosts = mutableListOf<String>()
        val a = ip.map { it.toInt() and 0xff }
        if (prefix >= 24) {
            val size = 1 shl (32 - prefix)
            val start = a[3] and (256 - size)
            for (h in start + 1 until start + size - 1) if (h != a[3]) hosts += "${a[0]}.${a[1]}.${a[2]}.$h"
        } else {
            for (h in 1..254) if (h != a[3]) hosts += "${a[0]}.${a[1]}.${a[2]}.$h"
        }
        val found = Collections.synchronizedList(mutableListOf<String>())
        val done = java.util.concurrent.atomic.AtomicInteger()
        val pool = Executors.newFixedThreadPool(48)
        for (host in hosts) {
            pool.execute {
                try {
                    Socket().use { it.connect(InetSocketAddress(host, PORT), 600) }
                    val base = "http://$host:$PORT"
                    if (probe(base)) found += base
                } catch (e: Exception) {
                    // porta fechada: não é o servidor
                } finally {
                    onProgress(done.incrementAndGet() * 100 / hosts.size)
                }
            }
        }
        pool.shutdown()
        pool.awaitTermination(30, TimeUnit.SECONDS)
        pool.shutdownNow()
        return found.sortedBy { it.substringAfterLast('.').substringBefore(':').toIntOrNull() ?: 0 }
    }
}
