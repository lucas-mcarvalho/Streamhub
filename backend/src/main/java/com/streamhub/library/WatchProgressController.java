package com.streamhub.library;

import java.time.Instant;
import java.util.List;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Progresso de reprodução compartilhado entre aparelhos. */
@RestController
@RequestMapping("/api/library/progress")
public class WatchProgressController {
    /** {@code last}: quando o progresso foi registrado no aparelho, em milissegundos desde 1970. */
    public record Entry(String id, double pos, double dur, boolean done, long last) {}

    private final WatchProgressRepository repo;

    public WatchProgressController(WatchProgressRepository repo) { this.repo = repo; }

    @GetMapping
    public List<Entry> list() {
        return repo.findAll().stream()
            .map(p -> new Entry(p.getFileId(), p.getPosition(), p.getDuration(), p.isDone(), p.getUpdatedAt().toEpochMilli()))
            .toList();
    }

    /** Grava os registros recebidos; o mais recente de cada arquivo vence, então aparelhos atrasados não desfazem nada. */
    @PutMapping
    @Transactional
    public void save(@RequestBody List<Entry> entries) {
        for (Entry e : entries) {
            if (e.id() == null || e.id().isBlank() || e.id().length() > 2000) continue;
            Instant at = Instant.ofEpochMilli(Math.min(Math.max(0, e.last()), System.currentTimeMillis()));
            WatchProgress p = repo.findById(e.id()).orElse(null);
            if (p != null && p.getUpdatedAt().isAfter(at)) continue;
            if (p == null) { p = new WatchProgress(); p.setFileId(e.id()); }
            p.setPosition(Double.isFinite(e.pos()) ? Math.max(0, e.pos()) : 0);
            p.setDuration(Double.isFinite(e.dur()) ? Math.max(0, e.dur()) : 0);
            p.setDone(e.done());
            p.setUpdatedAt(at);
            repo.save(p);
        }
    }
}
