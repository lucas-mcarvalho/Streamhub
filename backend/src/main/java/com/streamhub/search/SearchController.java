package com.streamhub.search;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.streamhub.config.J;
import com.streamhub.integrations.ProwlarrClient;

@RestController
@RequestMapping("/api/search")
public class SearchController {
    private final ProwlarrClient prowlarr;

    public SearchController(ProwlarrClient prowlarr) { this.prowlarr = prowlarr; }

    @GetMapping("/releases")
    /** {@code alt}: outros nomes do mesmo título (ex.: original e em português); os resultados são somados, sem repetir. */
    public List<Release> releases(@RequestParam String query, @RequestParam(defaultValue = "MOVIE") String kind,
                                  @RequestParam(required = false) List<Long> indexerIds,
                                  @RequestParam(required = false) String resolution,
                                  @RequestParam(required = false) List<String> alt) {
        List<Integer> cats = switch (kind.toUpperCase()) {
            case "MOVIE" -> List.of(2000);
            case "ANIME" -> List.of(5000, 5070);
            default -> List.of(5000);
        };
        List<Release> out = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (Map<String, Object> r : searchAll(query, alt, indexerIds == null ? List.of() : indexerIds, cats)) {
            String title = J.str(r.get("title"));
            if (title == null) continue;
            String magnet = J.str(r.get("magnetUrl"));
            String dl = J.str(r.get("downloadUrl"));
            if (magnet == null && dl == null) continue;
            String res = ReleaseParser.resolution(title);
            if (resolution != null && !resolution.isBlank() && !resolution.equalsIgnoreCase(res)) continue;
            if (!seen.add(dedupeKey(r, title))) continue;
            var se = ReleaseParser.season(title);
            out.add(new Release(J.str(r.get("guid")), title, res, ReleaseParser.source(title), ReleaseParser.codec(title),
                J.lng(r.get("size")) == null ? 0 : J.lng(r.get("size")), J.integer(r.get("seeders")), J.integer(r.get("leechers")),
                J.str(r.get("indexer")), J.lng(r.get("indexerId")), J.str(r.get("publishDate")), magnet, dl,
                J.str(r.get("infoUrl")), ReleaseParser.audio(title), ReleaseParser.subs(title), false,
                se.season(), se.seasonEnd(), se.episode()));
        }
        out.sort(Comparator.comparing((Release x) -> x.seeders() == null ? -1 : x.seeders()).reversed());
        return out;
    }

    private static final java.util.regex.Pattern BTIH = java.util.regex.Pattern.compile("(?i)btih:([a-z0-9]{32,40})");

    /** O mesmo torrent achado por nomes diferentes (ou em indexadores diferentes) aparece uma vez só. */
    public static String dedupeKey(Map<String, Object> r, String title) {
        String magnet = J.str(r.get("magnetUrl"));
        String hash = J.str(r.get("infoHash"));
        if (hash == null && magnet != null) {
            var m = BTIH.matcher(magnet);
            if (m.find()) hash = m.group(1);
        }
        return hash != null ? "h:" + hash.toLowerCase() : "t:" + title.toLowerCase() + "|" + r.get("size");
    }

    /** Busca o nome principal e os alternativos em paralelo; um nome que falhar não derruba os outros. */
    private List<Map<String, Object>> searchAll(String query, List<String> alt, List<Long> indexerIds, List<Integer> cats) {
        List<String> queries = new ArrayList<>(List.of(query));
        if (alt != null) for (String a : alt) {
            if (a != null && !a.isBlank() && queries.stream().noneMatch(q -> q.equalsIgnoreCase(a.trim())) && queries.size() < 4) queries.add(a.trim());
        }
        if (queries.size() == 1) return prowlarr.search(query, indexerIds, cats);
        var futures = queries.stream().map(q -> java.util.concurrent.CompletableFuture.supplyAsync(() -> prowlarr.search(q, indexerIds, cats))).toList();
        List<Map<String, Object>> all = new ArrayList<>();
        RuntimeException first = null;
        int ok = 0;
        for (var f : futures) {
            try { all.addAll(f.join()); ok++; }
            catch (java.util.concurrent.CompletionException e) { if (first == null) first = e.getCause() instanceof RuntimeException re ? re : e; }
        }
        if (ok == 0 && first != null) throw first;
        return all;
    }
}
