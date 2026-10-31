package com.streamhub.library;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.streamhub.integrations.JellyfinClient;

@RestController
@RequestMapping("/api/library")
public class LibraryController {
    private final LibraryService service;
    private final JellyfinClient jellyfin;

    public LibraryController(LibraryService service, JellyfinClient jellyfin) {
        this.service = service;
        this.jellyfin = jellyfin;
    }

    @GetMapping
    public List<LibraryFile> list(@RequestParam(required = false) String kind) { return service.list(kind); }

    @GetMapping("/{id}/token")
    public Map<String, String> token(@PathVariable String id) { return Map.of("token", service.issueToken(id)); }

    @GetMapping("/{id}/tracks")
    public List<LibraryService.Track> tracks(@PathVariable String id) { return service.tracks(id); }

    /** Streaming com suporte a Range (o Spring trata o cabeçalho Range para Resource). */
    @GetMapping("/stream/{id}")
    public ResponseEntity<Resource> stream(@PathVariable String id, @RequestParam String token) {
        service.verifyToken(id, token);
        Path p = service.resolve(id);
        String name = p.getFileName().toString().toLowerCase();
        MediaType type = name.endsWith(".mp4") || name.endsWith(".m4v") ? MediaType.parseMediaType("video/mp4")
            : name.endsWith(".webm") ? MediaType.parseMediaType("video/webm")
            : name.endsWith(".mkv") ? MediaType.parseMediaType("video/x-matroska") : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok().contentType(type).body(new FileSystemResource(p));
    }

    @GetMapping("/{id}/info")
    public LibraryService.MediaInfo info(@PathVariable String id) { return service.info(id); }

    /** Reprodução com conversão: o navegador recebe MP4 fragmentado a partir de `start` segundos. */
    @GetMapping("/stream/{id}/transcode")
    public ResponseEntity<StreamingResponseBody> transcode(@PathVariable String id, @RequestParam String token,
                                                           @RequestParam(defaultValue = "0") double start,
                                                           @RequestParam(defaultValue = "0") int audio) {
        service.verifyToken(id, token);
        Process pr = service.startTranscode(id, Math.max(0, start), audio);
        StreamingResponseBody body = out -> {
            try (var in = pr.getInputStream()) {
                in.transferTo(out);
            } finally {
                pr.destroyForcibly();
            }
        };
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("video/mp4")).body(body);
    }

    @GetMapping(value = "/stream/{id}/subtitle/{index}", produces = "text/vtt;charset=UTF-8")
    public String subtitle(@PathVariable String id, @PathVariable int index, @RequestParam String token) {
        service.verifyToken(id, token);
        return service.subtitleVtt(id, index);
    }

    @PostMapping("/refresh")
    public void refresh() { jellyfin.refreshLibrary(); }

    @GetMapping("/resume")
    public List<JellyfinClient.ResumeItem> resume() { return jellyfin.resume(); }
}
