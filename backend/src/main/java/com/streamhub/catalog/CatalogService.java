package com.streamhub.catalog;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.streamhub.config.ApiException;

@Service
public class CatalogService {
    private static final Pattern YEAR = Pattern.compile("\\((\\d{4})\\)");
    private static final Pattern NOISE = Pattern.compile(
        "(?i)\\b(1080p|720p|2160p|4k|web-?dl|web-?rip|blu-?ray|dual|multi|legendado|dublado|hevc|x26[45]|h\\.?26[45]|aac\\d?(\\.\\d)?|complete|completo|batch)\\b.*|\\[[^\\]]*\\]|\\([^)]*\\)|[-_.]+");

    private final TmdbClient tmdb;
    private final AniListClient anilist;
    private record Entry(Object value, long expires) {}

    private final ConcurrentHashMap<String, Entry> cache = new ConcurrentHashMap<>();

    /** Cache em memória com validade: evita estourar o limite de requisições do AniList/TMDB. Falhas não são guardadas. */
    @SuppressWarnings("unchecked")
    private <T> T cached(String key, long ttlSeconds, Supplier<T> loader) {
        Entry e = cache.get(key);
        if (e != null && e.expires() > System.currentTimeMillis()) return (T) e.value();
        T v = loader.get();
        cache.put(key, new Entry(v, System.currentTimeMillis() + ttlSeconds * 1000));
        return v;
    }

    private final ConcurrentHashMap<String, Optional<CatalogItem>> matchCache = new ConcurrentHashMap<>();

    public CatalogService(TmdbClient tmdb, AniListClient anilist) {
        this.tmdb = tmdb;
        this.anilist = anilist;
    }

    private Section section(String key, String title, Supplier<List<CatalogItem>> s) {
        return section("section:" + key + ":" + title, key, title, s);
    }

    private Section section(String cacheKey, String key, String title, Supplier<List<CatalogItem>> s) {
        try {
            return new Section(key, title, cached(cacheKey, 600, s), null);
        } catch (Exception e) {
            return new Section(key, title, List.of(), e.getMessage());
        }
    }

    /** mode: cinema (filmes e séries), anime, ou vazio (uma amostra de cada, para a tela inicial). */
    public List<Section> home(String mode) {
        if ("anime".equals(mode)) {
            return List.of(
                section("trending", "Em alta agora", anilist::trending),
                section("airing", "Em exibição", anilist::airing),
                section("top", "Mais bem avaliados", anilist::topRated),
                section("popular", "Populares de todos os tempos", () -> anilist.popular(1)));
        }
        if ("cinema".equals(mode)) {
            return List.of(
                section("movies", "Filmes em alta", () -> tmdb.trending("movie")),
                section("series", "Séries em alta", () -> tmdb.trending("tv")),
                section("topMovies", "Filmes mais bem avaliados", () -> tmdb.topRated("movie", 1)),
                section("topSeries", "Séries mais bem avaliadas", () -> tmdb.topRated("tv", 1)));
        }
        return List.of(
            section("movies", "Filmes em alta", () -> tmdb.trending("movie")),
            section("series", "Séries em alta", () -> tmdb.trending("tv")),
            section("anime", "Animes em alta", anilist::trending));
    }

    public List<Section> search(String q) {
        return List.of(
            section("search:m:" + q, "movies", "Filmes", () -> tmdb.search("movie", q, 1)),
            section("search:s:" + q, "series", "Séries", () -> tmdb.search("tv", q, 1)),
            section("search:a:" + q, "anime", "Animes", () -> anilist.search(q, 1)));
    }

    public List<CatalogItem> discover(String kind, String q, String sort, String genre, int page) {
        return cached("discover:" + kind + "|" + q + "|" + sort + "|" + genre + "|" + page, 600, () -> doDiscover(kind, q, sort, genre, page));
    }

    private List<CatalogItem> doDiscover(String kind, String q, String sort, String genre, int page) {
        boolean hasQ = q != null && !q.isBlank();
        String g = genre == null || genre.isBlank() ? null : genre;
        return switch (kind.toUpperCase()) {
            case "MOVIE" -> hasQ ? tmdb.search("movie", q, page) : tmdb.discover("movie", sort, g, page);
            case "SERIES" -> hasQ ? tmdb.search("tv", q, page) : tmdb.discover("tv", sort, g, page);
            case "ANIME" -> hasQ ? anilist.search(q, page) : anilist.discover(sort, g, page);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_KIND", "Tipo inválido: " + kind);
        };
    }

    public List<Genre> genres(String kind) {
        return cached("genres:" + kind, 86400, () -> doGenres(kind));
    }

    private List<Genre> doGenres(String kind) {
        return switch (kind.toUpperCase()) {
            case "MOVIE" -> tmdb.genreList("movie");
            case "SERIES" -> tmdb.genreList("tv");
            case "ANIME" -> anilist.genres();
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_KIND", "Tipo inválido: " + kind);
        };
    }

    public TitleDetails details(String source, String type, String id) {
        return cached("details:" + source + type + id, 1800, () -> doDetails(source, type, id));
    }

    private TitleDetails doDetails(String source, String type, String id) {
        if (source.equals("anilist")) return new TitleDetails(anilist.details(id), List.of(), List.of(), List.of());
        CatalogItem item = tmdb.details(type, id);
        List<Person> directors = List.of(), cast = List.of();
        try {
            var credits = tmdb.credits(type, id);
            directors = credits.getKey();
            cast = credits.getValue();
        } catch (Exception ignored) {
            // elenco é complementar: a página abre mesmo sem ele
        }
        return new TitleDetails(item, type.equals("tv") ? new ArrayList<>(tmdb.seasons(id)) : List.of(), directors, cast);
    }

    public List<Episode> episodes(String id, int season) { return tmdb.episodes(id, season); }

    /** Encontra o título do catálogo que corresponde ao nome de uma pasta da biblioteca (ex.: "ONE PIECE (1999)"). */
    public Optional<CatalogItem> match(String folderName, String kind) {
        String key = (folderName + "|" + kind).toLowerCase();
        Optional<CatalogItem> cached = matchCache.get(key);
        if (cached != null) return cached;
        Matcher ym = YEAR.matcher(folderName);
        Integer year = ym.find() ? Integer.valueOf(ym.group(1)) : null;
        String name = NOISE.matcher(folderName).replaceAll(" ").replaceAll("\\s+", " ").trim();
        if (name.isBlank()) return Optional.empty();
        List<CatalogItem> candidates = new ArrayList<>();
        boolean anyOk = false;
        String k = kind == null ? "GENERAL" : kind.toUpperCase();
        if (k.equals("ANIME") || k.equals("GENERAL")) {
            try { candidates.addAll(anilist.search(name, 1)); anyOk = true; } catch (Exception ignored) { }
        }
        if (k.equals("SERIES") || k.equals("GENERAL")) {
            try { candidates.addAll(tmdb.search("tv", name, 1)); anyOk = true; } catch (Exception ignored) { }
        }
        if (k.equals("MOVIE") || k.equals("GENERAL")) {
            try { candidates.addAll(tmdb.search("movie", name, 1)); anyOk = true; } catch (Exception ignored) { }
        }
        Optional<CatalogItem> best = Optional.empty();
        String norm = name.toLowerCase();
        if (year != null) {
            final Integer y = year;
            best = candidates.stream().filter(c -> y.equals(c.year()) && titleMatches(c, norm)).findFirst();
        }
        if (best.isEmpty()) best = candidates.stream().filter(c -> titleMatches(c, norm)).findFirst();
        if (best.isEmpty()) best = candidates.stream().findFirst();
        if (anyOk) matchCache.put(key, best);
        return best;
    }

    private static boolean titleMatches(CatalogItem c, String norm) {
        return (c.title() != null && c.title().toLowerCase().contains(norm))
            || (c.originalTitle() != null && c.originalTitle().toLowerCase().contains(norm));
    }
}
