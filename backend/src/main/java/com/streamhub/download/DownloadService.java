package com.streamhub.download;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.streamhub.config.ApiException;
import com.streamhub.config.J;
import com.streamhub.integrations.ArrClient;
import com.streamhub.integrations.IntegrationService;
import com.streamhub.integrations.JellyfinClient;
import com.streamhub.integrations.ProwlarrClient;
import com.streamhub.integrations.QbitClient;
import com.streamhub.integrations.Svc;
import com.streamhub.storage.StorageLocation;
import com.streamhub.storage.StorageService;

@Service
public class DownloadService {
    private static final Logger log = LoggerFactory.getLogger(DownloadService.class);
    private static final Set<String> ACTIVE = Set.of("QUEUED", "DOWNLOADING", "PAUSED");

    public record StartRequest(String title, String kind, String catalogRef, String indexer, String magnetUrl,
                               String downloadUrl, long sizeBytes, Long locationId, String relativePath) {}

    private final DownloadRepository repo;
    private final StorageService storage;
    private final QbitClient qbit;
    private final ProwlarrClient prowlarr;
    private final ArrClient arr;
    private final JellyfinClient jellyfin;
    private final IntegrationService integrations;
    private final String pathMap;
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private String lastSnapshot = "";

    public DownloadService(DownloadRepository repo, StorageService storage, QbitClient qbit, ProwlarrClient prowlarr,
                           ArrClient arr, JellyfinClient jellyfin, IntegrationService integrations,
                           @Value("${streamhub.storage.qbit-path-map}") String pathMap) {
        this.repo = repo;
        this.storage = storage;
        this.qbit = qbit;
        this.prowlarr = prowlarr;
        this.arr = arr;
        this.jellyfin = jellyfin;
        this.integrations = integrations;
        this.pathMap = pathMap;
    }

    /** Converte o caminho do backend para o caminho visto pelo qBittorrent (formato "prefixoBackend=prefixoQbit"). */
    String toQbitPath(Path p) {
        String s = p.toString();
        if (pathMap != null && pathMap.contains("=")) {
            String[] kv = pathMap.split("=", 2);
            if (s.startsWith(kv[0])) return kv[1] + s.substring(kv[0].length()).replace('\\', '/');
        }
        return s;
    }

    private String validateSource(StartRequest r) {
        if (r.magnetUrl() != null && r.magnetUrl().startsWith("magnet:?")) return r.magnetUrl();
        String url = r.downloadUrl();
        if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
            // somente URLs servidas pelo próprio Prowlarr, para evitar que o qBittorrent seja usado como proxy (SSRF)
            if (url.startsWith(prowlarr.baseUrl().replaceAll("/+$", "") + "/")) return url;
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_SOURCE", "URL de download não pertence ao Prowlarr configurado");
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_SOURCE", "Informe um magnet ou uma URL de download");
    }

    public DownloadView start(StartRequest r) {
        if (r.title() == null || r.title().isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION", "Título obrigatório");
        String kind = r.kind() == null ? "MOVIE" : r.kind().toUpperCase();
        String source = validateSource(r);
        StorageLocation loc = storage.pick(r.locationId(), kind);
        Path dest = storage.resolveDestination(loc, r.relativePath());
        try {
            Files.createDirectories(dest);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.FORBIDDEN, "NO_PERMISSION", "Não foi possível criar a pasta de destino: " + e.getMessage());
        }
        if (!Files.isWritable(dest)) throw new ApiException(HttpStatus.FORBIDDEN, "NO_PERMISSION", "Sem permissão de gravação no destino");
        storage.requireSpace(dest, r.sizeBytes());

        Download d = new Download();
        d.setTitle(r.title());
        d.setKind(kind);
        d.setCatalogRef(r.catalogRef());
        d.setIndexer(r.indexer());
        d.setSourceUrl(source);
        d.setLocationId(loc.getId());
        d.setRelativePath(r.relativePath() == null ? "" : r.relativePath());
        d.setSavePath(dest.toString());
        d.setSizeBytes(r.sizeBytes());
        d.setTag("pending");
        d = repo.save(d);
        d.setTag("sh-" + d.getId());
        try {
            qbit.add(source, toQbitPath(dest), d.getTag(), "streamhub-" + kind.toLowerCase());
        } catch (RuntimeException e) {
            repo.delete(d);
            throw e;
        }
        d = repo.save(d);
        publish();
        return DownloadView.of(d);
    }

    public List<DownloadView> list() {
        return repo.findAllByOrderByCreatedAtDesc().stream().map(DownloadView::of).toList();
    }

    private Download get(long id) {
        return repo.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NO_DOWNLOAD", "Download não encontrado"));
    }

    private String hashOf(Download d) {
        if (d.getHash() != null) return d.getHash();
        throw new ApiException(HttpStatus.CONFLICT, "NOT_READY", "O qBittorrent ainda não registrou este download");
    }

    public void pause(long id) {
        Download d = get(id);
        qbit.pause(hashOf(d));
        d.setStatus("PAUSED");
        repo.save(d);
        publish();
    }

    public void resume(long id) {
        Download d = get(id);
        qbit.resume(hashOf(d));
        d.setStatus("DOWNLOADING");
        repo.save(d);
        publish();
    }

    public void remove(long id, boolean deleteFiles) {
        Download d = get(id);
        String hash = d.getHash();
        if (hash == null) hash = qbit.info().stream().filter(t -> hasTag(t, d.getTag())).map(t -> J.str(t.get("hash"))).findFirst().orElse(null);
        if (hash != null) {
            try {
                qbit.delete(hash, deleteFiles);
            } catch (RuntimeException e) {
                log.warn("Falha ao remover torrent {} no qBittorrent: {}", hash, e.getMessage());
                throw e;
            }
        }
        repo.delete(d);
        publish();
    }

    private static boolean hasTag(Map<String, Object> t, String tag) {
        String tags = J.str(t.get("tags"));
        if (tags == null) return false;
        for (String s : tags.split(",")) if (s.trim().equals(tag)) return true;
        return false;
    }

    private static String mapState(String s, double progress) {
        return switch (s == null ? "" : s) {
            case "error", "missingFiles" -> "ERROR";
            case "pausedDL", "stoppedDL" -> "PAUSED";
            case "queuedDL" -> "QUEUED";
            case "pausedUP", "stoppedUP", "uploading", "stalledUP", "queuedUP", "forcedUP", "checkingUP" ->
                progress >= 1.0 ? "COMPLETED" : "PAUSED";
            default -> "DOWNLOADING";
        };
    }

    @Scheduled(fixedDelay = 2000)
    public synchronized void sync() {
        List<Download> active = repo.findByStatusIn(ACTIVE);
        if (!active.isEmpty() && integrations.isConfigured(Svc.QBITTORRENT)) {
            try {
                List<Map<String, Object>> torrents = qbit.info();
                for (Download d : active) applyTorrent(d, torrents);
            } catch (Exception e) {
                log.debug("Sincronização com qBittorrent falhou: {}", e.getMessage());
            }
        }
        publish();
    }

    private void applyTorrent(Download d, List<Map<String, Object>> torrents) {
        Map<String, Object> t = torrents.stream().filter(x -> hasTag(x, d.getTag())).findFirst().orElse(null);
        if (t == null) {
            if (d.getHash() != null || d.getCreatedAt().isBefore(LocalDateTime.now().minusSeconds(90))) {
                d.setStatus("ERROR");
                d.setErrorMessage("Torrent não encontrado no qBittorrent (removido ou rejeitado)");
                repo.save(d);
            }
            return;
        }
        double progress = J.dbl(t.get("progress")) == null ? 0 : J.dbl(t.get("progress"));
        String prev = d.getStatus();
        d.setHash(J.str(t.get("hash")));
        d.setProgress(progress);
        d.setDownloadedBytes(J.lng(t.get("downloaded")) == null ? 0 : J.lng(t.get("downloaded")));
        long total = J.lng(t.get("size")) == null ? 0 : J.lng(t.get("size"));
        if (total > 0) d.setSizeBytes(total);
        d.setDlSpeed(J.lng(t.get("dlspeed")) == null ? 0 : J.lng(t.get("dlspeed")));
        d.setUpSpeed(J.lng(t.get("upspeed")) == null ? 0 : J.lng(t.get("upspeed")));
        Long eta = J.lng(t.get("eta"));
        d.setEtaSeconds(eta == null || eta >= 8640000 ? null : eta);
        d.setContentPath(J.str(t.get("content_path")));
        String status = mapState(J.str(t.get("state")), progress);
        d.setStatus(status);
        if (status.equals("ERROR")) d.setErrorMessage("Erro reportado pelo qBittorrent (" + t.get("state") + ")");
        if (status.equals("COMPLETED") && !prev.equals("COMPLETED")) {
            d.setCompletedAt(LocalDateTime.now());
            d.setDlSpeed(0);
            d.setEtaSeconds(0L);
            repo.save(d);
            onCompleted(d);
            return;
        }
        repo.save(d);
    }

    /** Pós-processamento opcional; falhas são registradas, sem afetar o download. */
    private void onCompleted(Download d) {
        log.info("Download {} concluído: {}", d.getId(), d.getTitle());
        if (integrations.arrImportOnComplete() && d.getContentPath() != null && !d.getKind().equals("ANIME")) {
            Svc svc = d.getKind().equals("MOVIE") ? Svc.RADARR : Svc.SONARR;
            runQuietly(() -> arr.scanImport(svc, d.getContentPath()), svc.label());
        } else if (integrations.arrImportOnComplete() && d.getContentPath() != null) {
            runQuietly(() -> arr.scanImport(Svc.SONARR, d.getContentPath()), "Sonarr");
        }
        if (integrations.isConfigured(Svc.JELLYFIN)) runQuietly(jellyfin::refreshLibrary, "Jellyfin");
    }

    private void runQuietly(Runnable r, String name) {
        try {
            r.run();
        } catch (Exception e) {
            log.warn("Pós-processamento em {} falhou: {}", name, e.getMessage());
        }
    }

    // ---------- tempo real (SSE) ----------

    public SseEmitter subscribe() {
        SseEmitter em = new SseEmitter(0L);
        emitters.add(em);
        em.onCompletion(() -> emitters.remove(em));
        em.onTimeout(() -> emitters.remove(em));
        em.onError(e -> emitters.remove(em));
        try {
            em.send(SseEmitter.event().name("downloads").data(list()));
        } catch (Exception e) {
            emitters.remove(em);
        }
        return em;
    }

    private void publish() {
        if (emitters.isEmpty()) return;
        List<DownloadView> views = list();
        String snapshot = views.toString();
        if (snapshot.equals(lastSnapshot)) return;
        lastSnapshot = snapshot;
        for (SseEmitter em : emitters) {
            try {
                em.send(SseEmitter.event().name("downloads").data(views));
            } catch (Exception e) {
                emitters.remove(em);
            }
        }
    }

    @Scheduled(fixedDelay = 15000)
    void heartbeat() {
        for (SseEmitter em : emitters) {
            try {
                em.send(SseEmitter.event().comment("ping"));
            } catch (Exception e) {
                emitters.remove(em);
            }
        }
    }
}
