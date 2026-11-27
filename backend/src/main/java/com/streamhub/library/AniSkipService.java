package com.streamhub.library;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import com.streamhub.catalog.AniListClient;
import com.streamhub.catalog.CatalogItem;
import com.streamhub.catalog.CatalogService;
import com.streamhub.config.J;
import com.streamhub.library.LibraryService.SkipSegment;

/**
 * Abertura, encerramento e recapitulação enviados pela comunidade ao AniSkip (api.aniskip.com), para animes cujo
 * arquivo não tem capítulos. O AniSkip usa o id do MyAnimeList; ele vem do AniList, seguindo as sequências para
 * chegar à temporada do arquivo.
 */
@Service
public class AniSkipService {
    private static final Logger log = LoggerFactory.getLogger(AniSkipService.class);
    private static final String URL = "https://api.aniskip.com/v2/skip-times/";
    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};
    /** Diferença máxima de duração entre o nosso arquivo e o de quem marcou os tempos (outro corte = tempos errados). */
    private static final double MAX_LENGTH_DIFF = 6;
    private static final long HIT_TTL = 7 * 86400_000L, MISS_TTL = 6 * 3600_000L;

    private final CatalogService catalog;
    private final AniListClient anilist;
    private final RestClient http;

    private record Cached<T>(T value, long expires) {}

    private final ConcurrentHashMap<String, Cached<List<SkipSegment>>> results = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, AniListClient.Entry> entries = new ConcurrentHashMap<>();

    public AniSkipService(CatalogService catalog, AniListClient anilist) {
        this.catalog = catalog;
        this.anilist = anilist;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(4));
        factory.setReadTimeout(Duration.ofSeconds(8));   // o player continua sem o botão se o AniSkip demorar
        this.http = RestClient.builder().requestFactory(factory).build();
    }

    /** Trechos para o episódio {@code episode} (temporada {@code season}, ou numeração absoluta) da pasta {@code group}. */
    public List<SkipSegment> lookup(String group, Integer season, Integer episode, double duration) {
        if (group == null || episode == null || episode <= 0 || !(duration > 0)) return List.of();
        String key = group.toLowerCase() + "|" + season + "|" + episode + "|" + Math.round(duration);
        Cached<List<SkipSegment>> c = results.get(key);
        if (c != null && c.expires() > System.currentTimeMillis()) return c.value();
        try {
            List<SkipSegment> found = find(group, season, episode, duration);
            results.put(key, new Cached<>(found, System.currentTimeMillis() + (found.isEmpty() ? MISS_TTL : HIT_TTL)));
            return found;
        } catch (RuntimeException e) {
            log.debug("AniSkip indisponível para '{}' T{} E{}: {}", group, season, episode, e.toString());
            return List.of();   // falha de rede não fica em cache: tenta de novo na próxima vez
        }
    }

    private List<SkipSegment> find(String group, Integer season, int episode, double duration) {
        Optional<CatalogItem> match = catalog.match(group, "ANIME");
        if (match.isEmpty() || !"anilist".equals(match.get().source())) return List.of();
        AniListClient.Entry e = entry(Integer.parseInt(match.get().id()));
        // "S03E05": anda até a 3ª temporada
        for (int s = 1; season != null && s < season; s++) {
            if (e.sequelId() == null) return List.of();
            e = entry(e.sequelId());
        }
        // numeração contínua ("- 030" com 24 episódios na 1ª temporada): passa para as temporadas seguintes
        int ep = episode;
        while (e.episodes() != null && ep > e.episodes() && e.sequelId() != null) {
            ep -= e.episodes();
            e = entry(e.sequelId());
        }
        if (e.idMal() == null) return List.of();
        List<Map<String, Object>> found = query(e.idMal(), ep, Math.round(duration));
        if (found.isEmpty()) found = query(e.idMal(), ep, 0);   // sem filtro; toSegments descarta durações diferentes
        return toSegments(found, duration);
    }

    private AniListClient.Entry entry(int id) {
        return entries.computeIfAbsent(id, anilist::entry);
    }

    private List<Map<String, Object>> query(int malId, int episode, long length) {
        URI uri = URI.create(URL + malId + "/" + episode + "?types%5B%5D=op&types%5B%5D=ed&types%5B%5D=mixed-op"
            + "&types%5B%5D=mixed-ed&types%5B%5D=recap&episodeLength=" + length);
        try {
            return J.maps(J.at(http.get().uri(uri).retrieve().body(MAP), "results"));
        } catch (HttpClientErrorException.NotFound e) {
            return List.of();   // o AniSkip responde 404 quando não há tempos para o episódio
        }
    }

    /**
     * Converte os resultados do AniSkip; um trecho por tipo, só de arquivos com a mesma duração do nosso.
     * "mixed-op"/"mixed-ed" são abertura/encerramento com cenas novas do episódio por cima: ficam marcados como
     * {@code mixed}, e a versão "pura" (op/ed) tem preferência quando as duas existem.
     */
    static List<SkipSegment> toSegments(List<Map<String, Object>> results, double duration) {
        List<SkipSegment> out = new ArrayList<>();
        List<Map<String, Object>> ordered = new ArrayList<>(results);
        ordered.sort((a, b) -> Boolean.compare(String.valueOf(a.get("skipType")).startsWith("mixed"), String.valueOf(b.get("skipType")).startsWith("mixed")));
        for (Map<String, Object> r : ordered) {
            String type = String.valueOf(r.get("skipType"));
            String kind = switch (type) {
                case "op", "mixed-op" -> "intro";
                case "ed", "mixed-ed" -> "credits";
                case "recap" -> "recap";
                default -> null;
            };
            Double start = J.dbl(J.at(r, "interval", "startTime")), end = J.dbl(J.at(r, "interval", "endTime"));
            Double length = J.dbl(r.get("episodeLength"));
            if (kind == null || start == null || end == null) continue;
            if (length != null && length > 0 && Math.abs(length - duration) > MAX_LENGTH_DIFF) continue;
            double s = Math.max(0, start), en = Math.min(end, duration);
            if (en - s < 5 || out.stream().anyMatch(x -> x.kind().equals(kind))) continue;
            out.add(new SkipSegment(kind, s, en, type.startsWith("mixed")));
        }
        out.sort((a, b) -> Double.compare(a.start(), b.start()));
        return out;
    }
}
