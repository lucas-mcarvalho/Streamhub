package com.streamhub.channels;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.streamhub.config.ApiException;

/**
 * TV ao vivo a partir de listas M3U. O navegador nunca fala direto com os servidores dos canais: o
 * StreamHub faz o proxy (resolve CORS e conteúdo misto http/https). Cada URL repassada é assinada e
 * endereços internos da rede são bloqueados.
 */
@Service
public class ChannelService {
    private static final Pattern URI_ATTR = Pattern.compile("URI=\"([^\"]+)\"");
    private static final int MAX_PLAYLIST_BYTES = 8 * 1024 * 1024;       // playlists HLS
    private static final int MAX_LIST_BYTES = 48 * 1024 * 1024;          // listas M3U de canais
    private static final int MAX_SHORT_LINKS = 30_000;

    public record Proxied(int status, String contentType, byte[] body, InputStream stream) {}

    private record Cached(List<M3uParser.Entry> entries, long expires) {}

    private final ChannelSourceRepository repo;
    private final String secret;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NEVER).build();
    private final ConcurrentHashMap<Long, Cached> cache = new ConcurrentHashMap<>();
    /** Endereços reescritos das playlists HLS, por id curto (LRU): evita links gigantes com tokens longos. */
    private final java.util.Map<String, String> shortLinks = java.util.Collections.synchronizedMap(
        new java.util.LinkedHashMap<>(1024, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(java.util.Map.Entry<String, String> eldest) { return size() > MAX_SHORT_LINKS; }
        });

    public ChannelService(ChannelSourceRepository repo, @Value("${streamhub.secret}") String secret) {
        this.repo = repo;
        this.secret = secret;
    }

    // ---------- fontes ----------

    public List<ChannelSource> sources() { return repo.findAllByOrderByBuiltinDescIdAsc(); }

    public ChannelSource addSource(String name, String url) {
        if (name == null || name.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION", "Informe um nome");
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION", "A URL da lista precisa começar com http:// ou https://");
        }
        ChannelSource s = new ChannelSource();
        s.setName(name.trim());
        s.setUrl(url.trim());
        return repo.save(s);
    }

    public void deleteSource(long id) {
        ChannelSource s = repo.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NO_SOURCE", "Lista não encontrada"));
        if (s.isBuiltin()) throw new ApiException(HttpStatus.BAD_REQUEST, "BUILTIN", "Listas padrão não podem ser removidas");
        repo.delete(s);
        cache.remove(id);
    }

    // ---------- canais ----------

    public List<Channel> channels(long sourceId) {
        ChannelSource src = repo.findById(sourceId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NO_SOURCE", "Lista não encontrada"));
        Cached c = cache.get(sourceId);
        if (c == null || c.expires() < System.currentTimeMillis()) {
            String text = new String(fetch(URI.create(src.getUrl()), MAX_LIST_BYTES), StandardCharsets.UTF_8);
            c = new Cached(M3uParser.parse(text), System.currentTimeMillis() + 3600_000);
            cache.put(sourceId, c);
        }
        List<Channel> out = new ArrayList<>();
        List<M3uParser.Entry> entries = c.entries();
        for (int i = 0; i < entries.size(); i++) {
            M3uParser.Entry e = entries.get(i);
            out.add(new Channel(i, e.name(), e.logo(), e.group().split(";")[0], e.url().toLowerCase().contains(".m3u8"),
                "/api/channels/play/" + sourceId + "/" + i + "?t=" + sign("entry:" + sourceId + ":" + i)));
        }
        return out;
    }

    private byte[] fetch(URI uri, int limit) {
        try {
            HttpResponse<InputStream> r = open(uri);
            try (InputStream in = r.body()) {
                byte[] data = in.readNBytes(limit + 1);
                if (data.length > limit) throw new ApiException(HttpStatus.BAD_GATEWAY, "TOO_BIG", "Lista grande demais (limite de " + limit / (1024 * 1024) + " MB)");
                return data;
            }
        } catch (IOException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "FETCH_FAILED", "Não foi possível baixar a lista: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERRUPTED", "Interrompido");
        }
    }

    // ---------- proxy de reprodução ----------

    /** Abre a URL seguindo redirecionamentos manualmente, validando cada destino contra SSRF. */
    private HttpResponse<InputStream> open(URI start) throws IOException, InterruptedException {
        URI uri = start;
        for (int hop = 0; hop < 5; hop++) {
            assertPublic(uri);
            HttpRequest req = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(25))
                .header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) StreamHub").header("Accept-Encoding", "identity").GET().build();
            HttpResponse<InputStream> r = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
            int code = r.statusCode();
            if (code >= 300 && code < 400 && r.headers().firstValue("Location").isPresent()) {
                r.body().close();
                uri = uri.resolve(r.headers().firstValue("Location").get());
                continue;
            }
            return r;
        }
        throw new IOException("redirecionamentos demais");
    }

    private static void assertPublic(URI uri) throws IOException {
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equals("http") || scheme.equals("https")) || uri.getHost() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_URL", "URL inválida");
        }
        for (InetAddress a : InetAddress.getAllByName(uri.getHost())) {
            byte[] b = a.getAddress();
            boolean uniqueLocal6 = b.length == 16 && (b[0] & 0xFE) == 0xFC;
            if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress()
                || a.isMulticastAddress() || uniqueLocal6) {
                throw new ApiException(HttpStatus.FORBIDDEN, "PRIVATE_ADDRESS", "Endereços da rede local não são permitidos");
            }
        }
    }

    /** Entrada de um canal da lista: o endereço original fica só no servidor. */
    public Proxied proxyEntry(long sourceId, int index, String token) {
        if (!MessageDigest.isEqual(sign("entry:" + sourceId + ":" + index).getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "BAD_TOKEN", "Assinatura inválida");
        }
        channels(sourceId); // garante a lista em cache
        List<M3uParser.Entry> entries = cache.get(sourceId).entries();
        if (index < 0 || index >= entries.size()) throw new ApiException(HttpStatus.NOT_FOUND, "NO_CHANNEL", "Canal não encontrado");
        return proxyUrl(entries.get(index).url());
    }

    /** Itens reescritos das playlists (sub-playlists, segmentos, chaves). */
    public Proxied proxyShort(String id) {
        String url = shortLinks.get(id);
        if (url == null) throw new ApiException(HttpStatus.NOT_FOUND, "LINK_EXPIRED", "Link expirado: reabra o canal");
        return proxyUrl(url);
    }

    private Proxied proxyUrl(String url) {
        try {
            URI uri = URI.create(url);
            HttpResponse<InputStream> r = open(uri);
            InputStream upstream = r.body();
            if (r.headers().firstValue("Content-Encoding").orElse("").toLowerCase().contains("gzip")) {
                upstream = new java.util.zip.GZIPInputStream(upstream); // alguns servidores comprimem mesmo sem pedir
            }
            String type = r.headers().firstValue("Content-Type").orElse("application/octet-stream");
            boolean playlist = uri.getPath().toLowerCase().endsWith(".m3u8") || type.toLowerCase().contains("mpegurl");
            if (!playlist) return new Proxied(r.statusCode(), type, null, upstream);
            byte[] data;
            try (InputStream in = upstream) {
                data = in.readNBytes(MAX_PLAYLIST_BYTES);
            }
            String text = new String(data, StandardCharsets.UTF_8);
            if (!text.startsWith("#EXTM3U")) return new Proxied(r.statusCode(), type, data, null);
            return new Proxied(r.statusCode(), "application/vnd.apple.mpegurl", rewrite(text, uri).getBytes(StandardCharsets.UTF_8), null);
        } catch (ApiException e) {
            throw e;
        } catch (IOException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "CHANNEL_DOWN", "Canal indisponível: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERRUPTED", "Interrompido");
        }
    }

    /** Reescreve os endereços da playlist HLS para passarem pelo proxy. */
    private String rewrite(String playlist, URI base) {
        StringBuilder out = new StringBuilder();
        for (String line : playlist.split("\\r?\\n")) {
            if (line.isBlank()) {
                out.append('\n');
            } else if (line.startsWith("#")) {
                Matcher m = URI_ATTR.matcher(line);
                out.append(m.replaceAll(mr -> Matcher.quoteReplacement("URI=\"" + signedUrl(base.resolve(mr.group(1)).toString()) + "\""))).append('\n');
            } else {
                out.append(signedUrl(base.resolve(line.trim()).toString())).append('\n');
            }
        }
        return out.toString();
    }

    private String signedUrl(String url) {
        String id = sign("r:" + url).substring(0, 22);
        shortLinks.put(id, url);
        return "/api/channels/r/" + id;
    }

    private String sign(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(MessageDigest.getInstance("SHA-256").digest(("channels|" + secret).getBytes(StandardCharsets.UTF_8)), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
