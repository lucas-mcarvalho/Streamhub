package com.streamhub.catalog;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.streamhub.config.ApiException;

@Service
public class CatalogService {
    private final TmdbClient tmdb;
    private final AniListClient anilist;

    public CatalogService(TmdbClient tmdb, AniListClient anilist) {
        this.tmdb = tmdb;
        this.anilist = anilist;
    }

    private static Section section(String key, String title, Supplier<List<CatalogItem>> s) {
        try {
            return new Section(key, title, s.get(), null);
        } catch (Exception e) {
            return new Section(key, title, List.of(), e.getMessage());
        }
    }

    public List<Section> home() {
        return List.of(
            section("movies", "Filmes em alta", () -> tmdb.trending("movie")),
            section("series", "Séries em alta", () -> tmdb.trending("tv")),
            section("anime", "Animes em alta", anilist::trending));
    }

    public List<Section> search(String q) {
        return List.of(
            section("movies", "Filmes", () -> tmdb.search("movie", q, 1)),
            section("series", "Séries", () -> tmdb.search("tv", q, 1)),
            section("anime", "Animes", () -> anilist.search(q, 1)));
    }

    public List<CatalogItem> discover(String kind, String q, int page) {
        boolean hasQ = q != null && !q.isBlank();
        return switch (kind.toUpperCase()) {
            case "MOVIE" -> hasQ ? tmdb.search("movie", q, page) : tmdb.popular("movie", page);
            case "SERIES" -> hasQ ? tmdb.search("tv", q, page) : tmdb.popular("tv", page);
            case "ANIME" -> hasQ ? anilist.search(q, page) : anilist.popular(page);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_KIND", "Tipo inválido: " + kind);
        };
    }

    public TitleDetails details(String source, String type, String id) {
        if (source.equals("anilist")) return new TitleDetails(anilist.details(id), List.of());
        CatalogItem item = tmdb.details(type, id);
        return new TitleDetails(item, type.equals("tv") ? new ArrayList<>(tmdb.seasons(id)) : List.of());
    }

    public List<Episode> episodes(String id, int season) { return tmdb.episodes(id, season); }
}
