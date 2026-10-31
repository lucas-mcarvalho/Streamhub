package com.streamhub.integrations;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.streamhub.config.Http;
import com.streamhub.config.J;

@Component
public class ProwlarrClient {
    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST = new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};

    private final IntegrationService integrations;

    public ProwlarrClient(IntegrationService integrations) { this.integrations = integrations; }

    private IntegrationService.Conn conn() { return integrations.require(Svc.PROWLARR); }

    private RestClient rc(IntegrationService.Conn c) {
        return Http.builder(c.baseUrl()).defaultHeader("X-Api-Key", c.secret()).build();
    }

    public String baseUrl() { return conn().baseUrl(); }

    public String version() {
        var c = conn();
        return J.str(rc(c).get().uri(Http.uri(c.baseUrl(), "/api/v1/system/status")).retrieve().body(MAP).get("version"));
    }

    public List<Map<String, Object>> indexers() {
        var c = conn();
        return rc(c).get().uri(Http.uri(c.baseUrl(), "/api/v1/indexer")).retrieve().body(LIST);
    }

    public Map<String, Object> indexer(long id) {
        var c = conn();
        return rc(c).get().uri(Http.uri(c.baseUrl(), "/api/v1/indexer/" + id)).retrieve().body(MAP);
    }

    public void setEnabled(long id, boolean enabled) {
        var c = conn();
        Map<String, Object> body = new java.util.HashMap<>(indexer(id));
        body.put("enable", enabled);
        rc(c).put().uri(Http.uri(c.baseUrl(), "/api/v1/indexer/" + id)).body(body).retrieve().toBodilessEntity();
    }

    /** Retorna null se o teste passou, ou a mensagem de falha. */
    public String test(long id) {
        var c = conn();
        try {
            rc(c).post().uri(Http.uri(c.baseUrl(), "/api/v1/indexer/test")).body(indexer(id)).retrieve().toBodilessEntity();
            return null;
        } catch (org.springframework.web.client.RestClientResponseException e) {
            String body = e.getResponseBodyAsString();
            return body.isBlank() ? "Falha (HTTP " + e.getStatusCode().value() + ")" : body;
        }
    }

    public List<Map<String, Object>> schema() {
        var c = conn();
        return rc(c).get().uri(Http.uri(c.baseUrl(), "/api/v1/indexer/schema")).retrieve().body(LIST);
    }

    /** Id do primeiro perfil de aplicativo do Prowlarr (obrigatório ao criar indexadores). */
    public long defaultAppProfileId() {
        var c = conn();
        List<Map<String, Object>> profiles = rc(c).get().uri(Http.uri(c.baseUrl(), "/api/v1/appprofile")).retrieve().body(LIST);
        if (profiles == null || profiles.isEmpty()) {
            throw new com.streamhub.config.ApiException(org.springframework.http.HttpStatus.CONFLICT, "NO_APP_PROFILE",
                "O Prowlarr não tem nenhum App Profile. Crie um em Settings > Apps no Prowlarr.");
        }
        return J.lng(profiles.get(0).get("id"));
    }

    public Map<String, Object> add(Map<String, Object> body) {
        var c = conn();
        return rc(c).post().uri(Http.uri(c.baseUrl(), "/api/v1/indexer")).body(body).retrieve().body(MAP);
    }

    public void delete(long id) {
        var c = conn();
        rc(c).delete().uri(Http.uri(c.baseUrl(), "/api/v1/indexer/" + id)).retrieve().toBodilessEntity();
    }

    public List<Map<String, Object>> failingStatus() {
        var c = conn();
        return rc(c).get().uri(Http.uri(c.baseUrl(), "/api/v1/indexerstatus")).retrieve().body(LIST);
    }

    public List<Map<String, Object>> search(String query, List<Long> indexerIds, List<Integer> categories) {
        var c = conn();
        if (indexers().stream().noneMatch(i -> Boolean.TRUE.equals(i.get("enable")))) {
            throw new com.streamhub.config.ApiException(org.springframework.http.HttpStatus.CONFLICT, "NO_INDEXERS",
                "Nenhum indexador ativo no Prowlarr. Adicione um em Configurações > Indexadores.");
        }
        List<Object> kv = new ArrayList<>(List.of("query", query, "type", "search", "limit", 100));
        for (Long id : indexerIds) { kv.add("indexerIds"); kv.add(id); }
        if (indexerIds.isEmpty()) { kv.add("indexerIds"); kv.add(-2); }
        for (Integer cat : categories) { kv.add("categories"); kv.add(cat); }
        try {
            return rc(c).get().uri(Http.uri(c.baseUrl(), "/api/v1/search", kv.toArray())).retrieve().body(LIST);
        } catch (org.springframework.web.client.RestClientResponseException e) {
            if (e.getStatusCode().value() == 400 && e.getResponseBodyAsString().contains("unavailable")) {
                throw new com.streamhub.config.ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, "INDEXERS_UNAVAILABLE",
                    "Os indexadores selecionados estão indisponíveis (verifique em Configurações > Indexadores > Testar).");
            }
            throw e;
        }
    }
}
