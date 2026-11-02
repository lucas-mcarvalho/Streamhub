package com.streamhub.integrations;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.streamhub.config.ApiException;
import com.streamhub.config.Http;

/** Cliente da Web API do qBittorrent (v4 e v5). Mantém o cookie de sessão e reloga em caso de 403. */
@Component
public class QbitClient {
    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST = new ParameterizedTypeReference<>() {};

    private final IntegrationService integrations;
    private volatile String sid;

    public QbitClient(IntegrationService integrations) { this.integrations = integrations; }

    private RestClient rc(IntegrationService.Conn c) {
        RestClient.Builder b = Http.builder(c.baseUrl()).defaultHeader("Referer", c.baseUrl());
        if (sid != null) b.defaultHeader("Cookie", sid);
        return b.build();
    }

    private synchronized void login(IntegrationService.Conn c) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("username", c.username() == null ? "admin" : c.username());
        form.add("password", c.secret() == null ? "" : c.secret());
        sid = null;
        var resp = rc(c).post().uri(Http.uri(c.baseUrl(), "/api/v2/auth/login"))
            .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().toEntity(String.class);
        List<String> cookies = resp.getHeaders().get("Set-Cookie");
        if (cookies != null) {
            for (String ck : cookies) {
                if (ck.startsWith("SID=") || ck.startsWith("QBT_SID")) sid = ck.split(";")[0];
            }
        }
        if (sid == null) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "QBIT_AUTH", "Usuário ou senha do qBittorrent inválidos");
        }
    }

    private <T> T call(Function<RestClient, T> fn) {
        var c = integrations.require(Svc.QBITTORRENT);
        if (sid == null) login(c);
        try {
            return fn.apply(rc(c));
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 403) {
                login(c);
                return fn.apply(rc(c));
            }
            throw e;
        }
    }

    private String base() { return integrations.require(Svc.QBITTORRENT).baseUrl(); }

    public String version() {
        return call(r -> r.get().uri(Http.uri(base(), "/api/v2/app/version")).retrieve().body(String.class));
    }

    public void add(String url, String savePath, String tag, String category) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("urls", url);
        form.add("savepath", savePath);
        form.add("tags", tag);
        form.add("category", category);
        form.add("autoTMM", "false");
        String result;
        try {
            result = call(r -> r.post().uri(Http.uri(base(), "/api/v2/torrents/add"))
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(String.class));
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 409) {
                throw new ApiException(HttpStatus.CONFLICT, "QBIT_DUPLICATE", "Este torrent já existe no qBittorrent");
            }
            throw e;
        }
        // v4 responde "Ok."/"Fails."; v5 responde JSON com success_count/failure_count
        boolean failed = result != null && (result.trim().equals("Fails.")
            || (result.contains("\"success_count\":0") && !result.contains("\"pending_count\":1")));
        if (failed) throw new ApiException(HttpStatus.BAD_GATEWAY, "QBIT_ADD", "O qBittorrent recusou o torrent");
    }

    public List<Map<String, Object>> info() {
        return call(r -> r.get().uri(Http.uri(base(), "/api/v2/torrents/info")).retrieve().body(LIST));
    }

    private void hashesAction(String v5, String v4, String hash) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("hashes", hash);
        try {
            call(r -> r.post().uri(Http.uri(base(), "/api/v2/torrents/" + v5))
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().toBodilessEntity());
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() != 404) throw e;
            call(r -> r.post().uri(Http.uri(base(), "/api/v2/torrents/" + v4))
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().toBodilessEntity());
        }
    }

    /** Arquivos do torrent (vazio enquanto os metadados do magnet não chegaram). */
    public List<Map<String, Object>> files(String hash) {
        return call(r -> r.get().uri(Http.uri(base(), "/api/v2/torrents/files", "hash", hash)).retrieve().body(LIST));
    }

    /** priority 0 = não baixar; 1 = baixar. */
    public void setFilePriority(String hash, List<Integer> indexes, int priority) {
        if (indexes.isEmpty()) return;
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("hash", hash);
        form.add("id", indexes.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining("|")));
        form.add("priority", String.valueOf(priority));
        call(r -> r.post().uri(Http.uri(base(), "/api/v2/torrents/filePrio"))
            .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().toBodilessEntity());
    }

    public void addTags(String hash, String tag) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("hashes", hash);
        form.add("tags", tag);
        call(r -> r.post().uri(Http.uri(base(), "/api/v2/torrents/addTags"))
            .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().toBodilessEntity());
    }

    public void pause(String hash) { hashesAction("stop", "pause", hash); }

    public void resume(String hash) { hashesAction("start", "resume", hash); }

    public void delete(String hash, boolean deleteFiles) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("hashes", hash);
        form.add("deleteFiles", String.valueOf(deleteFiles));
        call(r -> r.post().uri(Http.uri(base(), "/api/v2/torrents/delete"))
            .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().toBodilessEntity());
    }
}
