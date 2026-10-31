package com.streamhub.download;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/downloads")
public class DownloadController {
    private final DownloadService service;

    public DownloadController(DownloadService service) { this.service = service; }

    @GetMapping
    public List<DownloadView> list() { return service.list(); }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() { return service.subscribe(); }

    @PostMapping
    public DownloadView start(@RequestBody DownloadService.StartRequest req) { return service.start(req); }

    public record SelectRequest(List<Integer> selected) {}

    @GetMapping("/{id}/files")
    public List<DownloadService.FileEntry> files(@PathVariable long id) { return service.files(id); }

    @PostMapping("/{id}/files")
    public void selectFiles(@PathVariable long id, @RequestBody SelectRequest req) { service.selectFiles(id, req.selected()); }

    @PostMapping("/{id}/pause")
    public void pause(@PathVariable long id) { service.pause(id); }

    @PostMapping("/{id}/resume")
    public void resume(@PathVariable long id) { service.resume(id); }

    @DeleteMapping("/{id}")
    public void remove(@PathVariable long id, @RequestParam(defaultValue = "false") boolean deleteFiles) {
        service.remove(id, deleteFiles);
    }
}
