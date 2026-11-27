package com.streamhub.catalog;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;

import com.streamhub.config.Http;
import com.streamhub.config.J;

@Component
public class AniListClient {
    private static final String URL = "https://graphql.anilist.co";
    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};
    private static final String FIELDS = """
        id title { romaji english } description(asHtml: false) coverImage { extraLarge } bannerImage
        startDate { year } averageScore genres episodes duration status format studios(isMain: true) { nodes { name } }""";

    private Map<String, Object> query(String q, Map<String, Object> vars) {
        Map<String, Object> res = Http.builder(URL).build().post().uri(URL)
            .body(Map.of("query", q, "variables", vars)).retrieve().body(MAP);
        return J.map(J.at(res, "data"));
    }

    private CatalogItem map(Map<String, Object> m) {
        String id = J.str(J.integer(m.get("id")));
        String romaji = J.str(J.at(m, "title", "romaji"));
        String english = J.str(J.at(m, "title", "english"));
        Integer score = J.integer(m.get("averageScore"));
        List<String> genres = new ArrayList<>();
        for (Object g : J.list(m.get("genres"))) genres.add(g.toString());
        String desc = J.str(m.get("description"));
        return new CatalogItem("anilist:anime:" + id, "anilist", "anime", id, "ANIME", english != null ? english : romaji,
            romaji, desc == null ? null : desc.replaceAll("<[^>]+>", ""), J.str(J.at(m, "coverImage", "extraLarge")),
            J.str(m.get("bannerImage")), J.integer(J.at(m, "startDate", "year")), score == null ? null : score / 10.0,
            genres, J.integer(m.get("episodes")), null, J.str(m.get("status")), J.integer(m.get("duration")),
            J.str(m.get("format")), J.str(J.at(J.list(J.at(m, "studios", "nodes")).stream().findFirst().orElse(null), "name")));
    }

    /** Consulta paginada; variáveis só são declaradas quando usadas (o AniList recusa variáveis não usadas). */
    private List<CatalogItem> page(String sort, String search, String genre, String status, int page) {
        StringBuilder decl = new StringBuilder("$page:Int");
        StringBuilder args = new StringBuilder("type:ANIME,isAdult:false,");
        Map<String, Object> vars = new java.util.HashMap<>();
        vars.put("page", page);
        if (search != null) { decl.append(",$search:String"); args.append("search:$search,"); vars.put("search", search); }
        if (genre != null) { decl.append(",$genre:String"); args.append("genre:$genre,"); vars.put("genre", genre); }
        if (status != null) { decl.append(",$status:MediaStatus"); args.append("status:$status,"); vars.put("status", status); }
        String q = "query(" + decl + "){Page(page:$page,perPage:24){media(" + args + "sort:" + sort + "){" + FIELDS + "}}}";
        List<CatalogItem> out = new ArrayList<>();
        for (Map<String, Object> m : J.maps(J.at(query(q, vars), "Page", "media"))) out.add(map(m));
        return out;
    }

    public List<CatalogItem> trending() { return page("TRENDING_DESC", null, null, null, 1); }

    public List<CatalogItem> popular(int page) { return page("POPULARITY_DESC", null, null, null, page); }

    public List<CatalogItem> topRated() { return page("SCORE_DESC", null, null, null, 1); }

    public List<CatalogItem> airing() { return page("POPULARITY_DESC", null, null, "RELEASING", 1); }

    public List<CatalogItem> search(String q, int page) { return page("SEARCH_MATCH", q, null, null, page); }

    /** sort: POPULAR, SCORE, TRENDING ou AIRING. */
    public List<CatalogItem> discover(String sort, String genre, int page) {
        return switch (sort == null ? "POPULAR" : sort) {
            case "SCORE" -> page("SCORE_DESC", null, genre, null, page);
            case "TRENDING" -> page("TRENDING_DESC", null, genre, null, page);
            case "AIRING" -> page("POPULARITY_DESC", null, genre, "RELEASING", page);
            default -> page("POPULARITY_DESC", null, genre, null, page);
        };
    }

    public List<Genre> genres() {
        List<Genre> out = new ArrayList<>();
        for (Object g : J.list(query("{GenreCollection}", Map.of()).get("GenreCollection"))) {
            String n = g.toString();
            if (!n.equals("Hentai")) out.add(new Genre(n, n));
        }
        return out;
    }

    /** Entrada do AniList com o id do MyAnimeList e as temporadas vizinhas (sequência/prequência em formato de série). */
    public record Entry(int id, Integer idMal, Integer episodes, Integer sequelId, Integer prequelId, Integer year) {}

    private static final java.util.Set<String> SERIES_FORMATS = java.util.Set.of("TV", "TV_SHORT", "ONA");

    public Entry entry(int id) {
        String q = "query($id:Int){Media(id:$id,type:ANIME){id idMal episodes startDate{year} relations{edges{relationType node{id type format}}}}}";
        Map<String, Object> m = J.map(J.at(query(q, Map.of("id", id)), "Media"));
        Integer sequel = null, prequel = null;
        for (Map<String, Object> e : J.maps(J.at(m, "relations", "edges"))) {
            Map<String, Object> n = J.map(e.get("node"));
            String format = J.str(n.get("format"));   // pode vir nulo; Set.of(...).contains(null) lança exceção
            if (!"ANIME".equals(n.get("type")) || format == null || !SERIES_FORMATS.contains(format)) continue;
            if (sequel == null && "SEQUEL".equals(e.get("relationType"))) sequel = J.integer(n.get("id"));
            if (prequel == null && "PREQUEL".equals(e.get("relationType"))) prequel = J.integer(n.get("id"));
        }
        return new Entry(id, J.integer(m.get("idMal")), J.integer(m.get("episodes")), sequel, prequel, J.integer(J.at(m, "startDate", "year")));
    }

    /** Temporadas da franquia: volta pelas prequências até a 1ª e segue as sequências (no máximo 12). */
    public List<Season> seasonChain(int id) {
        java.util.Set<Integer> seen = new java.util.HashSet<>();
        Entry e = entry(id);
        seen.add(e.id());
        while (e.prequelId() != null && seen.add(e.prequelId()) && seen.size() < 12) e = entry(e.prequelId());
        List<Season> out = new ArrayList<>();
        seen.clear();
        while (e != null && seen.add(e.id()) && out.size() < 12) {
            out.add(new Season(out.size() + 1, "Temporada " + (out.size() + 1), e.episodes() == null ? 0 : e.episodes(),
                e.year() == null ? null : e.year() + "-01-01"));
            e = e.sequelId() == null ? null : entry(e.sequelId());
        }
        return out;
    }

    public CatalogItem details(String id) {
        String q = "query($id:Int){Media(id:$id,type:ANIME){" + FIELDS + "}}";
        return map(J.map(J.at(query(q, Map.of("id", Integer.parseInt(id))), "Media")));
    }
}
