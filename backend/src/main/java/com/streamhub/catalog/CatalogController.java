package com.streamhub.catalog;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog")
public class CatalogController {
    private final CatalogService service;

    public CatalogController(CatalogService service) { this.service = service; }

    @GetMapping("/home")
    public List<Section> home(@RequestParam(required = false) String mode) { return service.home(mode); }

    @GetMapping("/search")
    public List<Section> search(@RequestParam String q) { return service.search(q); }

    @GetMapping("/discover")
    public List<CatalogItem> discover(@RequestParam String kind, @RequestParam(required = false) String q,
                                      @RequestParam(required = false) String sort,
                                      @RequestParam(required = false) String genre,
                                      @RequestParam(defaultValue = "1") int page) {
        return service.discover(kind, q, sort, genre, page);
    }

    @GetMapping("/genres")
    public List<Genre> genres(@RequestParam String kind) { return service.genres(kind); }

    /** Capa e dados do catálogo para o nome de uma pasta da biblioteca; 204 quando não há correspondência. */
    @GetMapping("/match")
    public org.springframework.http.ResponseEntity<CatalogItem> match(@RequestParam String title,
                                                                      @RequestParam(defaultValue = "GENERAL") String kind) {
        return service.match(title, kind).map(org.springframework.http.ResponseEntity::ok)
            .orElseGet(() -> org.springframework.http.ResponseEntity.noContent().build());
    }

    @GetMapping("/title/{source}/{type}/{id}")
    public TitleDetails details(@PathVariable String source, @PathVariable String type, @PathVariable String id) {
        return service.details(source, type, id);
    }

    @GetMapping("/title/tmdb/tv/{id}/seasons/{season}")
    public List<Episode> episodes(@PathVariable String id, @PathVariable int season) {
        return service.episodes(id, season);
    }
}
