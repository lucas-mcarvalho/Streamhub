package com.streamhub.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.streamhub.config.ApiException;
import com.streamhub.config.AppSettingsService;

/**
 * Encontra as pastas de mídia (Animes, Filmes, Séries...) em cada disco conectado e nas raízes autorizadas, até dois
 * níveis abaixo do disco (ex.: HDEXTERNO/Animes ou HDEXTERNO/StreamDb/Animes), cada uma com o tipo pelo nome.
 * Com o registro automático ligado, pastas novas entram sozinhas na biblioteca assim que o disco é conectado;
 * pastas removidas pelo usuário ficam na lista de ignoradas e não voltam.
 */
@Component
public class StorageDiscovery {
    private static final Logger log = LoggerFactory.getLogger(StorageDiscovery.class);
    static final String AUTO_KEY = "storage.auto-register";
    static final String IGNORED_KEY = "storage.ignored";
    /** Nome da pasta (minúsculo, sem acento) → tipo do local. */
    static final Map<String, String> KNOWN = Map.of(
        "animes", "ANIME", "anime", "ANIME",
        "series", "SERIES", "shows", "SERIES", "tv", "SERIES",
        "filmes", "MOVIE", "movies", "MOVIE");

    public record Folder(String name, String path, int rootIndex, String relativePath, String kind, Long locationId, boolean ignored) {}

    public record Source(String name, String path, String fsType, boolean disk, StorageService.Usage usage, boolean writable,
                         List<Folder> folders) {}

    public record Warning(String code, String message) {}

    public record Report(boolean autoRegister, List<Source> sources, List<Warning> warnings) {}

    public record Pick(int rootIndex, String relativePath, String kind, String name) {}

    private final StorageService storage;
    private final StorageLocationRepository repo;
    private final AppSettingsService settings;
    private final String hostDisksDir;

    public StorageDiscovery(StorageService storage, StorageLocationRepository repo, AppSettingsService settings,
                            @Value("${streamhub.storage.disks-host-dir:}") String hostDisksDir) {
        this.storage = storage;
        this.repo = repo;
        this.settings = settings;
        this.hostDisksDir = hostDisksDir.trim().replaceAll("/+$", "");
    }

    // ---------- descoberta ----------

    public synchronized Report report() {
        Map<Object, Long> registered = new HashMap<>();
        for (StorageLocation l : storage.all()) {
            Object key = fileKey(Path.of(l.getPath()));
            if (key != null) registered.put(key, l.getId());
        }
        Set<String> ignored = ignored();
        Set<Object> seen = new HashSet<>();   // /hd1 e /disks/HD podem ser o mesmo disco
        List<Source> out = new ArrayList<>();
        Path disksDir = storage.disksDir();

        for (StorageService.DiskView d : storage.disks()) {
            Path base = disksDir.resolve(d.name());
            out.add(new Source(d.name(), base.toString(), d.fsType(), true, d.usage(), d.writable(),
                folders(base, d.rootIndex(), disksDir, registered, ignored, seen)));
        }
        for (StorageService.RootView r : storage.roots()) {
            Path base = Path.of(r.path());
            if (base.equals(disksDir) || !r.exists() || StorageService.ramBacked(base)) continue;
            List<Folder> f = folders(base, r.index(), base, registered, ignored, seen);
            if (!f.isEmpty()) out.add(new Source(r.path(), r.path(), "", false, r.usage(), Files.isWritable(base), f));
        }
        return new Report(autoRegister(), out, warnings(out));
    }

    private List<Folder> folders(Path base, int rootIndex, Path rootPath, Map<Object, Long> registered, Set<String> ignored,
                                 Set<Object> seen) {
        List<Folder> out = new ArrayList<>();
        for (Path dir : mediaDirs(base)) {
            Object key = fileKey(dir);
            if (!seen.add(key != null ? key : dir)) continue;
            String rel = rootPath.relativize(dir).toString().replace('\\', '/');
            out.add(new Folder(dir.getFileName().toString(), dir.toString(), rootIndex, rel,
                KNOWN.get(normalize(dir.getFileName().toString())), registered.get(key),
                ignored.contains(ignoreKey(storage.disksDir(), dir))));
        }
        return out;
    }

    private List<Warning> warnings(List<Source> sources) {
        List<Warning> out = new ArrayList<>();
        List<String> diskNames = sources.stream().filter(Source::disk).map(Source::name).toList();
        for (StorageService.RootView r : storage.roots()) {
            Path p = Path.of(r.path());
            if (r.index() == 0 || p.equals(storage.disksDir()) || !StorageService.ramBacked(p)) continue;
            String hint = diskNames.size() == 1 && !hostDisksDir.isEmpty() && !hostDisksDir.startsWith(".")
                ? " Ajuste EXTRA_STORAGE no .env para " + hostDisksDir + "/" + diskNames.get(0) + " e reinicie com docker compose up -d."
                : " Ajuste EXTRA_STORAGE no .env para a pasta atual do disco e reinicie com docker compose up -d.";
            out.add(new Warning("ROOT_EMPTY", "A pasta " + r.path() + " (EXTRA_STORAGE) aponta para um lugar vazio: o HD foi "
                + "desconectado ou o sistema o montou com outro nome. O StreamHub continua lendo o disco pela lista abaixo, "
                + "mas o Jellyfin, o Sonarr e o Radarr só o enxergam por " + r.path() + "." + hint));
        }
        if (diskNames.isEmpty()) {
            out.add(new Warning("NO_DISKS", "Nenhum disco externo detectado. Conecte e monte o disco (ele precisa aparecer no "
                + "gerenciador de arquivos do computador) e toque em Atualizar. Se ele já aparece, confira DISKS_DIR no .env."));
        }
        return out;
    }

    // ---------- registro ----------

    public synchronized List<StorageService.LocationView> register(List<Pick> picks) {
        Set<String> ignored = ignored();
        List<StorageService.LocationView> out = new ArrayList<>();
        List<StorageService.RootView> roots = storage.roots();
        for (Pick p : picks) {
            if (p.relativePath() == null || p.relativePath().isBlank() || p.rootIndex() < 0 || p.rootIndex() >= roots.size()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_PICK", "Pasta inválida");
            }
            Path rel = Path.of(p.relativePath());
            Path root = Path.of(roots.get(p.rootIndex()).path());
            String folder = rel.getFileName().toString();
            String disk = root.equals(storage.disksDir()) ? rel.getName(0).toString() : root.getFileName().toString();
            String name = p.name() != null && !p.name().isBlank() ? p.name().trim() : uniqueName(folder, disk);
            String kind = p.kind() != null ? p.kind() : KNOWN.getOrDefault(normalize(folder), "GENERAL");
            StorageService.LocationView v = storage.create(name, p.rootIndex(), p.relativePath(), kind, false, false);
            ignored.remove(ignoreKey(storage.disksDir(), Path.of(v.path())));
            out.add(v);
        }
        saveIgnored(ignored);
        return out;
    }

    private String uniqueName(String folder, String disk) {
        if (repo.findByName(folder).isEmpty()) return folder;
        String base = folder + " (" + disk + ")";
        String name = base;
        for (int i = 2; repo.findByName(name).isPresent(); i++) name = base + " " + i;
        return name;
    }

    /** Local removido pelo usuário: não é registrado de novo automaticamente. */
    public synchronized void ignore(String path) {
        Set<String> ignored = ignored();
        if (ignored.add(ignoreKey(storage.disksDir(), Path.of(path)))) saveIgnored(ignored);
    }

    public boolean autoRegister() { return !"false".equals(settings.getString(AUTO_KEY, "true")); }

    public void setAutoRegister(boolean enabled) {
        settings.setString(AUTO_KEY, String.valueOf(enabled));
        if (enabled) autoRun();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStart() { autoRun(); }

    /** Confere a cada minuto se um disco foi conectado com pastas de mídia novas. */
    @Scheduled(initialDelay = 60_000, fixedDelay = 60_000)
    public void autoRun() {
        if (repo.count() > 0 && !autoRegister()) return;
        try {
            List<Pick> picks = report().sources().stream().flatMap(s -> s.folders().stream())
                .filter(f -> f.locationId() == null && !f.ignored())
                .map(f -> new Pick(f.rootIndex(), f.relativePath(), f.kind(), null)).toList();
            for (Pick p : picks) {
                try {
                    StorageService.LocationView v = register(List.of(p)).get(0);
                    log.info("Local de armazenamento registrado automaticamente: {} -> {}", v.name(), v.path());
                } catch (RuntimeException e) {
                    log.warn("Não foi possível registrar {}: {}", p.relativePath(), e.getMessage());
                }
            }
        } catch (RuntimeException e) {
            log.warn("Registro automático das pastas de mídia falhou: {}", e.getMessage());
        }
    }

    private Set<String> ignored() {
        return Arrays.stream(settings.getString(IGNORED_KEY, "").split("\n")).filter(s -> !s.isBlank())
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private void saveIgnored(Set<String> ignored) { settings.setString(IGNORED_KEY, String.join("\n", ignored)); }

    // ---------- utilitários ----------

    /** Chave que sobrevive ao disco remontado com outro nome (HDEXTERNO1 → HDEXTERNO). */
    static String ignoreKey(Path disksDir, Path p) {
        if (!p.startsWith(disksDir) || p.equals(disksDir)) return p.toString();
        Path rel = disksDir.relativize(p);
        String first = rel.getName(0).toString().replaceAll("\\d+$", "");
        Path rest = rel.getNameCount() > 1 ? rel.subpath(1, rel.getNameCount()) : Path.of("");
        return disksDir.resolve(first).resolve(rest).toString();
    }

    private static Object fileKey(Path p) {
        try {
            Object key = Files.readAttributes(p, BasicFileAttributes.class).fileKey();
            return key != null ? key : p.toRealPath();
        } catch (IOException e) {
            return null;
        }
    }

    /** Pastas com nome conhecido até dois níveis abaixo da raiz; não entra em uma pasta já reconhecida. */
    static List<Path> mediaDirs(Path base) {
        List<Path> out = new ArrayList<>();
        for (Path p : subdirs(base)) {
            if (KNOWN.containsKey(normalize(p.getFileName().toString()))) out.add(p);
        }
        for (Path parent : subdirs(base)) {
            if (out.contains(parent)) continue;
            for (Path p : subdirs(parent)) {
                if (KNOWN.containsKey(normalize(p.getFileName().toString()))) out.add(p);
            }
        }
        return out;
    }

    /** Subpastas visíveis, em ordem; pasta ilegível (ex.: "System Volume Information") conta como vazia. */
    private static List<Path> subdirs(Path dir) {
        try (Stream<Path> s = Files.list(dir)) {
            return s.filter(Files::isDirectory).filter(p -> !p.getFileName().toString().startsWith("."))
                .filter(p -> !p.getFileName().toString().startsWith("$"))
                .sorted(Comparator.comparing(Path::toString)).toList();
        } catch (IOException | RuntimeException e) {
            return List.of();
        }
    }

    static String normalize(String name) {
        return Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase();
    }
}
