package com.streamhub.integrations;

import java.util.List;
import java.util.Map;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.streamhub.config.Http;
import com.streamhub.config.J;

/** Cliente comum do Sonarr e do Radarr (API v3). */
@Component
public class ArrClient {
    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST = new ParameterizedTypeReference<>() {};

    private final IntegrationService integrations;

    public ArrClient(IntegrationService integrations) { this.integrations = integrations; }

    private RestClient rc(IntegrationService.Conn c) {
        return Http.builder(c.baseUrl()).defaultHeader("X-Api-Key", c.secret()).build();
    }

    public String version(Svc s) {
        var c = integrations.require(s);
        return J.str(rc(c).get().uri(Http.uri(c.baseUrl(), "/api/v3/system/status")).retrieve().body(MAP).get("version"));
    }

    public List<Map<String, Object>> rootFolders(Svc s) {
        var c = integrations.require(s);
        return rc(c).get().uri(Http.uri(c.baseUrl(), "/api/v3/rootfolder")).retrieve().body(LIST);
    }

    /** Pede ao Sonarr/Radarr que importe o conteúdo concluído, preservando o arquivo original (Copy). */
    public void scanImport(Svc s, String path) {
        var c = integrations.require(s);
        String name = s == Svc.RADARR ? "DownloadedMoviesScan" : "DownloadedEpisodesScan";
        rc(c).post().uri(Http.uri(c.baseUrl(), "/api/v3/command"))
            .body(Map.of("name", name, "path", path, "importMode", "Copy")).retrieve().toBodilessEntity();
    }
}
