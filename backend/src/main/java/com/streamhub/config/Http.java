package com.streamhub.config;

import java.net.URI;
import java.time.Duration;

import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

public final class Http {
    private Http() {}

    public static RestClient.Builder builder(String baseUrl) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(60));
        return RestClient.builder().baseUrl(baseUrl.replaceAll("/+$", "")).requestFactory(factory);
    }

    /** Monta a URI com query string; pares chave/valor com valor nulo são ignorados. */
    public static URI uri(String base, String path, Object... kv) {
        UriComponentsBuilder b = UriComponentsBuilder.fromUriString(base.replaceAll("/+$", "") + path);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            if (kv[i + 1] != null) b.queryParam((String) kv[i], kv[i + 1]);
        }
        return b.build().encode().toUri();
    }
}
