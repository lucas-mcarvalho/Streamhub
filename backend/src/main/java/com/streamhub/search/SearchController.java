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
    public List<Release> releases(@RequestParam String query, @RequestParam(defaultValue = "MOVIE") String kind,
                                  @RequestParam(required = false) List<Long> indexerIds,
                                  @RequestParam(required = false) String resolution) {
        List<Integer> cats = switch (kind.toUpperCase()) {
            case "MOVIE" -> List.of(2000);
            case "ANIME" -> List.of(5000, 5070);
            default -> List.of(5000);
        };
        List<Release> out = new ArrayList<>();
        for (Map<String, Object> r : prowlarr.search(query, indexerIds == null ? List.of() : indexerIds, cats)) {
            String title = J.str(r.get("title"));
            if (title == null) continue;
            String magnet = J.str(r.get("magnetUrl"));
            String dl = J.str(r.get("downloadUrl"));
            if (magnet == null && dl == null) continue;
            String res = ReleaseParser.resolution(title);
            if (resolution != null && !resolution.isBlank() && !resolution.equalsIgnoreCase(res)) continue;
            out.add(new Release(J.str(r.get("guid")), title, res, ReleaseParser.source(title), ReleaseParser.codec(title),
                J.lng(r.get("size")) == null ? 0 : J.lng(r.get("size")), J.integer(r.get("seeders")), J.integer(r.get("leechers")),
                J.str(r.get("indexer")), J.lng(r.get("indexerId")), J.str(r.get("publishDate")), magnet, dl,
                J.str(r.get("infoUrl")), ReleaseParser.audio(title), ReleaseParser.subs(title), false));
        }
        out.sort(Comparator.comparing((Release x) -> x.seeders() == null ? -1 : x.seeders()).reversed());
        return out;
    }
}
