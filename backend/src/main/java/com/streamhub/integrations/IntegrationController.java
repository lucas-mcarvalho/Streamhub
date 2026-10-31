package com.streamhub.integrations;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.streamhub.catalog.TmdbClient;

@RestController
@RequestMapping("/api/integrations")
public class IntegrationController {
    public record SaveRequest(String baseUrl, String username, String secret, Boolean enabled) {}

    private final IntegrationService service;
    private final ProwlarrClient prowlarr;
    private final ArrClient arr;
    private final QbitClient qbit;
    private final JellyfinClient jellyfin;
    private final TmdbClient tmdb;

    public IntegrationController(IntegrationService service, ProwlarrClient prowlarr, ArrClient arr, QbitClient qbit,
                                 JellyfinClient jellyfin, TmdbClient tmdb) {
        this.service = service;
        this.prowlarr = prowlarr;
        this.arr = arr;
        this.qbit = qbit;
        this.jellyfin = jellyfin;
        this.tmdb = tmdb;
    }

    @GetMapping
    public List<IntegrationService.View> list() { return service.list(); }

    @PutMapping("/{svc}")
    public List<IntegrationService.View> save(@PathVariable String svc, @RequestBody SaveRequest req) {
        service.save(Svc.valueOf(svc.toUpperCase()), req.baseUrl(), req.username(), req.secret(),
            req.enabled() == null || req.enabled());
        return service.list();
    }

    @PostMapping("/{svc}/test")
    public Map<String, Object> test(@PathVariable String svc) {
        Svc s = Svc.valueOf(svc.toUpperCase());
        try {
            String detail = switch (s) {
                case TMDB -> { tmdb.ping(); yield "Chave válida"; }
                case PROWLARR -> "Versão " + prowlarr.version();
                case SONARR, RADARR -> "Versão " + arr.version(s);
                case QBITTORRENT -> "Versão " + qbit.version();
                case JELLYFIN -> "Versão " + jellyfin.version();
            };
            return Map.of("ok", true, "message", detail);
        } catch (Exception e) {
            return Map.of("ok", false, "message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
    }
}
