package com.streamhub.channels;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/channels")
public class ChannelController {
    public record SourceView(Long id, String name, String url, boolean builtin) {}

    public record AddSource(String name, String url) {}

    private final ChannelService service;

    public ChannelController(ChannelService service) { this.service = service; }

    @GetMapping("/sources")
    public List<SourceView> sources() {
        return service.sources().stream().map(s -> new SourceView(s.getId(), s.getName(), s.getUrl(), s.isBuiltin())).toList();
    }

    @PostMapping("/sources")
    public SourceView add(@RequestBody AddSource req) {
        ChannelSource s = service.addSource(req.name(), req.url());
        return new SourceView(s.getId(), s.getName(), s.getUrl(), s.isBuiltin());
    }

    @DeleteMapping("/sources/{id}")
    public void delete(@PathVariable long id) { service.deleteSource(id); }

    @GetMapping
    public List<Channel> channels(@RequestParam long source) { return service.channels(source); }

    /** Públicos e assinados/imprevisíveis: o hls.js e a tag de vídeo não enviam o cabeçalho de autenticação. */
    @GetMapping("/play/{source}/{index}")
    public ResponseEntity<StreamingResponseBody> play(@PathVariable long source, @PathVariable int index, @RequestParam("t") String t) {
        return respond(service.proxyEntry(source, index, t));
    }

    @GetMapping("/r/{id}")
    public ResponseEntity<StreamingResponseBody> relay(@PathVariable String id) {
        return respond(service.proxyShort(id));
    }

    private static ResponseEntity<StreamingResponseBody> respond(ChannelService.Proxied p) {
        MediaType type = MediaType.parseMediaType(p.contentType());
        StreamingResponseBody body = out -> {
            if (p.body() != null) {
                out.write(p.body());
            } else {
                try (var in = p.stream()) {
                    in.transferTo(out);
                }
            }
        };
        return ResponseEntity.status(p.status()).contentType(type).header("Cache-Control", "no-store").body(body);
    }
}
