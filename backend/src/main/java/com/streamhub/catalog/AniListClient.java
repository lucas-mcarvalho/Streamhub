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
        startDate { year } averageScore genres episodes duration status""";

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
            genres, J.integer(m.get("episodes")), null, J.str(m.get("status")), J.integer(m.get("duration")));
    }

    private List<CatalogItem> page(String sort, String search, int page) {
        String q = "query($page:Int" + (search == null ? "" : ",$search:String") + "){Page(page:$page,perPage:24){media(type:ANIME,isAdult:false,"
            + (search == null ? "" : "search:$search,") + "sort:" + sort + "){" + FIELDS + "}}}";
        Map<String, Object> vars = new java.util.HashMap<>();
        vars.put("page", page);
        if (search != null) vars.put("search", search);
        List<CatalogItem> out = new ArrayList<>();
        for (Map<String, Object> m : J.maps(J.at(query(q, vars), "Page", "media"))) out.add(map(m));
        return out;
    }

    public List<CatalogItem> trending() { return page("TRENDING_DESC", null, 1); }

    public List<CatalogItem> popular(int page) { return page("POPULARITY_DESC", null, page); }

    public List<CatalogItem> search(String q, int page) { return page("SEARCH_MATCH", q, page); }

    public CatalogItem details(String id) {
        String q = "query($id:Int){Media(id:$id,type:ANIME){" + FIELDS + "}}";
        return map(J.map(J.at(query(q, Map.of("id", Integer.parseInt(id))), "Media")));
    }
}
