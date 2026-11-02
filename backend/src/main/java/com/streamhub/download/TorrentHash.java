package com.streamhub.download;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Descobre o infohash de um magnet ou de um .torrent para detectar torrents já existentes no qBittorrent. */
final class TorrentHash {
    private static final Pattern BTIH = Pattern.compile("xt=urn:btih:([A-Za-z0-9]+)");
    private static final int MAX_TORRENT_BYTES = 8 * 1024 * 1024;
    private static final HttpClient HTTP = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NEVER).connectTimeout(Duration.ofSeconds(8)).build();

    private TorrentHash() {}

    /** Infohash em hexadecimal minúsculo, ou null se não foi possível descobrir. */
    static String of(String source) {
        try {
            String url = source;
            // o Prowlarr costuma responder com redirecionamento para um magnet; segue à mão (no máximo 5 saltos)
            for (int hop = 0; hop < 5; hop++) {
                if (url.startsWith("magnet:")) return fromMagnet(url);
                HttpResponse<java.io.InputStream> res = HTTP.send(HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(15)).GET().build(), HttpResponse.BodyHandlers.ofInputStream());
                try (var in = res.body()) {
                    int code = res.statusCode();
                    if (code >= 300 && code < 400) {
                        String next = res.headers().firstValue("Location").orElse(null);
                        if (next == null) return null;
                        url = next.startsWith("magnet:") ? next : URI.create(url).resolve(next).toString();
                        continue;
                    }
                    if (code != 200) return null;
                    return fromTorrent(in.readNBytes(MAX_TORRENT_BYTES));
                }
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    static String fromMagnet(String magnet) {
        Matcher m = BTIH.matcher(magnet);
        if (!m.find()) return null;
        String h = m.group(1);
        if (h.length() == 40) return h.toLowerCase(Locale.ROOT);
        if (h.length() == 32) return base32ToHex(h.toUpperCase(Locale.ROOT));
        return null;
    }

    private static String base32ToHex(String s) {
        String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        StringBuilder bits = new StringBuilder();
        for (char c : s.toCharArray()) {
            int v = alphabet.indexOf(c);
            if (v < 0) return null;
            bits.append(String.format("%5s", Integer.toBinaryString(v)).replace(' ', '0'));
        }
        StringBuilder hex = new StringBuilder();
        for (int i = 0; i + 8 <= bits.length(); i += 8) hex.append(String.format("%02x", Integer.parseInt(bits.substring(i, i + 8), 2)));
        return hex.toString();
    }

    /** SHA-1 do dicionário "info" (bytes originais do bencode). */
    static String fromTorrent(byte[] data) throws Exception {
        if (data.length == 0 || data[0] != 'd') return null;
        int pos = 1;
        while (pos < data.length && data[pos] != 'e') {
            int keyEnd = skip(data, pos);
            String key = new String(data, pos, keyEnd - pos, java.nio.charset.StandardCharsets.ISO_8859_1);
            int valEnd = skip(data, keyEnd);
            if (key.equals("4:info")) {
                MessageDigest sha = MessageDigest.getInstance("SHA-1");
                sha.update(data, keyEnd, valEnd - keyEnd);
                StringBuilder hex = new StringBuilder();
                for (byte b : sha.digest()) hex.append(String.format("%02x", b));
                return hex.toString();
            }
            pos = valEnd;
        }
        return null;
    }

    /** Retorna a posição logo após o valor bencode que começa em pos. */
    private static int skip(byte[] d, int pos) {
        byte c = d[pos];
        if (c == 'i') {
            while (d[pos] != 'e') pos++;
            return pos + 1;
        }
        if (c == 'l' || c == 'd') {
            pos++;
            while (d[pos] != 'e') pos = skip(d, pos);
            return pos + 1;
        }
        int colon = pos;
        while (d[colon] != ':') colon++;
        int len = Integer.parseInt(new String(d, pos, colon - pos, java.nio.charset.StandardCharsets.ISO_8859_1));
        return colon + 1 + len;
    }
}
