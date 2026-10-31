package com.streamhub.storage;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping("/api/storage")
public class StorageController {
    public record CreateRequest(@NotBlank String name, Integer rootIndex, String relativePath, String kind,
                                Boolean makeDefault, Boolean createIfMissing) {}

    private final StorageService service;

    public StorageController(StorageService service) { this.service = service; }

    @GetMapping("/roots")
    public List<StorageService.RootView> roots() { return service.roots(); }

    @GetMapping("/browse")
    public List<StorageService.DirEntry> browse(@RequestParam int root, @RequestParam(defaultValue = "") String path) {
        return service.browse(root, path);
    }

    @GetMapping("/locations")
    public List<StorageService.LocationView> list() { return service.list(); }

    @PostMapping("/locations")
    public StorageService.LocationView create(@Valid @RequestBody CreateRequest r) {
        return service.create(r.name(), r.rootIndex() == null ? 0 : r.rootIndex(), r.relativePath(), r.kind(),
            Boolean.TRUE.equals(r.makeDefault()), !Boolean.FALSE.equals(r.createIfMissing()));
    }

    @PostMapping("/locations/{id}/default")
    public StorageService.LocationView setDefault(@PathVariable long id) { return service.setDefault(id); }

    @PostMapping("/locations/{id}/test")
    public StorageService.LocationView test(@PathVariable long id) { return service.test(id); }

    @DeleteMapping("/locations/{id}")
    public void delete(@PathVariable long id) { service.delete(id); }
}
