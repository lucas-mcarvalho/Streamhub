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
    public List<Section> home() { return service.home(); }

    @GetMapping("/search")
    public List<Section> search(@RequestParam String q) { return service.search(q); }

    @GetMapping("/discover")
    public List<CatalogItem> discover(@RequestParam String kind, @RequestParam(required = false) String q,
                                      @RequestParam(defaultValue = "1") int page) {
        return service.discover(kind, q, page);
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
