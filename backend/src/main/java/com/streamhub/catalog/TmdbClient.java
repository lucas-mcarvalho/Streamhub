package com.streamhub.catalog;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.streamhub.config.Http;
import com.streamhub.config.J;
import com.streamhub.integrations.IntegrationService;
import com.streamhub.integrations.Svc;

@Component
public class TmdbClient {
    private static final String BASE = "https://api.themoviedb.org/3";
    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};

    private final IntegrationService integrations;
    private final Map<String, Map<Integer, String>> genreCache = new ConcurrentHashMap<>();

    public TmdbClient(IntegrationService integrations) { this.integrations = integrations; }

    private Map<String, Object> get(String path, Object... kv) {
        String key = integrations.require(Svc.TMDB).secret();
        boolean bearer = key.length() > 40;
        List<Object> params = new ArrayList<>(List.of("language", "pt-BR"));
        for (Object o : kv) params.add(o);
        if (!bearer) { params.add("api_key"); params.add(key); }
        RestClient.Builder b = Http.builder(BASE);
        if (bearer) b.defaultHeader("Authorization", "Bearer " + key);
        return b.build().get().uri(Http.uri(BASE, path, params.toArray())).retrieve().body(MAP);
    }

    public void ping() { get("/configuration"); }

    private Map<Integer, String> genres(String type) {
        return genreCache.computeIfAbsent(type, t -> {
            Map<Integer, String> m = new ConcurrentHashMap<>();
            for (Map<String, Object> g : J.maps(get("/genre/" + t + "/list").get("genres"))) {
                m.put(J.integer(g.get("id")), J.str(g.get("name")));
            }
            return m;
        });
    }

    private static Integer year(String date) {
        return date != null && date.length() >= 4 ? Integer.valueOf(date.substring(0, 4)) : null;
    }

    private static String img(Object path, String size) {
        return path == null ? null : "https://image.tmdb.org/t/p/" + size + path;
    }

    private CatalogItem map(Map<String, Object> m, String type) {
        boolean movie = type.equals("movie");
        List<String> genres = new ArrayList<>();
        if (m.get("genres") != null) {
            for (Map<String, Object> g : J.maps(m.get("genres"))) genres.add(J.str(g.get("name")));
        } else {
            Map<Integer, String> names = genres(type);
            for (Object gid : J.list(m.get("genre_ids"))) {
                String n = names.get(((Number) gid).intValue());
                if (n != null) genres.add(n);
            }
        }
        Integer runtime = J.integer(m.get("runtime"));
        if (runtime == null) {
            List<Object> rt = J.list(m.get("episode_run_time"));
            if (!rt.isEmpty()) runtime = J.integer(rt.get(0));
        }
        String id = J.str(J.integer(m.get("id")));
        return new CatalogItem("tmdb:" + type + ":" + id, "tmdb", type, id, movie ? "MOVIE" : "SERIES",
            J.str(movie ? m.get("title") : m.get("name")),
            J.str(movie ? m.get("original_title") : m.get("original_name")), J.str(m.get("overview")),
            img(m.get("poster_path"), "w342"), img(m.get("backdrop_path"), "w1280"),
            year(J.str(movie ? m.get("release_date") : m.get("first_air_date"))), J.dbl(m.get("vote_average")), genres,
            J.integer(m.get("number_of_episodes")), J.integer(m.get("number_of_seasons")), J.str(m.get("status")), runtime, null,
            J.str(J.at(J.list(m.get("production_companies")).stream().findFirst().orElse(null), "name")));
    }

    /** Animes japoneses (animação + origem JP) são tratados pelo AniList, não pela lista de séries. */
    private static boolean isAnime(Map<String, Object> m) {
        boolean jp = J.list(m.get("origin_country")).contains("JP") || "ja".equals(m.get("original_language"));
        return jp && J.list(m.get("genre_ids")).stream().anyMatch(g -> g instanceof Number n && n.intValue() == 16);
    }

    private List<CatalogItem> mapList(Map<String, Object> res, String type) {
        List<CatalogItem> out = new ArrayList<>();
        for (Map<String, Object> m : J.maps(res.get("results"))) {
            if (type.equals("tv") && isAnime(m)) continue;
            out.add(map(m, type));
        }
        return out;
    }

    public List<CatalogItem> trending(String type) { return mapList(get("/trending/" + type + "/week"), type); }

    public List<CatalogItem> popular(String type, int page) { return mapList(get("/" + type + "/popular", "page", page), type); }

    public List<CatalogItem> search(String type, String q, int page) {
        return mapList(get("/search/" + type, "query", q, "page", page), type);
    }

    public List<CatalogItem> topRated(String type, int page) { return mapList(get("/" + type + "/top_rated", "page", page), type); }

    public List<Genre> genreList(String type) {
        List<Genre> out = new ArrayList<>();
        genres(type).forEach((id, name) -> out.add(new Genre(String.valueOf(id), name)));
        out.sort(java.util.Comparator.comparing(Genre::name));
        return out;
    }

    /** sort: POPULAR, SCORE ou NEW; genreId opcional. */
    public List<CatalogItem> discover(String type, String sort, String genreId, int page) {
        boolean movie = type.equals("movie");
        String sortBy = switch (sort == null ? "POPULAR" : sort) {
            case "SCORE" -> "vote_average.desc";
            case "NEW" -> movie ? "primary_release_date.desc" : "first_air_date.desc";
            default -> "popularity.desc";
        };
        String today = java.time.LocalDate.now().toString();
        return mapList(get("/discover/" + type, "page", page, "sort_by", sortBy, "with_genres", genreId,
            "vote_count.gte", "SCORE".equals(sort) ? 500 : ("NEW".equals(sort) ? 20 : 0),
            movie ? "primary_release_date.lte" : "first_air_date.lte", "NEW".equals(sort) ? today : null), type);
    }

    public CatalogItem details(String type, String id) { return map(get("/" + type + "/" + id), type); }

    private static Person person(Map<String, Object> m, String role) {
        return new Person(J.str(m.get("name")), role, img(m.get("profile_path"), "w185"));
    }

    /** Diretores (ou criadores, em séries) e os principais atores. */
    public Map.Entry<List<Person>, List<Person>> credits(String type, String id) {
        Map<String, Object> credits = get("/" + type + "/" + id + "/credits");
        List<Person> directors = new ArrayList<>();
        if (type.equals("tv")) {
            for (Map<String, Object> c : J.maps(get("/tv/" + id).get("created_by"))) directors.add(person(c, "Criação"));
        }
        for (Map<String, Object> c : J.maps(credits.get("crew"))) {
            if ("Director".equals(c.get("job")) && directors.stream().noneMatch(d -> d.name().equals(J.str(c.get("name"))))) {
                directors.add(person(c, "Direção"));
            }
        }
        List<Person> cast = new ArrayList<>();
        for (Map<String, Object> c : J.maps(credits.get("cast"))) {
            if (cast.size() >= 14) break;
            cast.add(person(c, J.str(c.get("character"))));
        }
        return Map.entry(directors.size() > 4 ? directors.subList(0, 4) : directors, cast);
    }

    public List<Season> seasons(String id) {
        List<Season> out = new ArrayList<>();
        for (Map<String, Object> s : J.maps(get("/tv/" + id).get("seasons"))) {
            int n = J.integer(s.get("season_number"));
            if (n == 0) continue;
            out.add(new Season(n, J.str(s.get("name")), J.integer(s.get("episode_count")), J.str(s.get("air_date"))));
        }
        return out;
    }

    public List<Episode> episodes(String id, int season) {
        List<Episode> out = new ArrayList<>();
        for (Map<String, Object> e : J.maps(get("/tv/" + id + "/season/" + season).get("episodes"))) {
            out.add(new Episode(J.integer(e.get("episode_number")), J.str(e.get("name")), J.str(e.get("overview")),
                J.str(e.get("air_date")), img(e.get("still_path"), "w300"), J.integer(e.get("runtime"))));
        }
        return out;
    }
}
