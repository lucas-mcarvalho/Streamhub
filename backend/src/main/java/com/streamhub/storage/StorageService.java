package com.streamhub.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.streamhub.config.ApiException;

/**
 * Todos os caminhos aceitos precisam estar dentro de uma raiz autorizada (STORAGE_ALLOWED_ROOTS).
 * O frontend nunca envia caminhos absolutos para download: envia id do local + caminho relativo, validado aqui.
 */
@Service
public class StorageService {
    public static final Set<String> KINDS = Set.of("GENERAL", "MOVIE", "SERIES", "ANIME");

    public record Usage(long total, long free, long used) {}

    public record RootView(int index, String path, boolean exists, Usage usage) {}

    public record DiskView(String name, String fsType, int rootIndex, String relativePath, Usage usage, boolean writable) {}

    public record DirEntry(String name, String relativePath) {}

    public record LocationView(Long id, String name, String path, String kind, boolean isDefault, boolean exists,
                               boolean writable, Usage usage, double percentUsed, boolean lowSpace) {}

    private final StorageLocationRepository repo;
    private final List<Path> roots = new ArrayList<>();
    private final long minFreeBytes;
    private final Path disksDir;

    public StorageService(StorageLocationRepository repo,
                          @Value("${streamhub.storage.allowed-roots}") String allowedRoots,
                          @Value("${streamhub.storage.disks-dir:/disks}") String disksDir,
                          @Value("${streamhub.storage.min-free-gb}") long minFreeGb) {
        this.repo = repo;
        for (String r : allowedRoots.split("[,;]")) {
            if (!r.isBlank()) roots.add(Path.of(r.trim()).toAbsolutePath().normalize());
        }
        this.disksDir = Path.of(disksDir.trim()).toAbsolutePath().normalize();
        this.minFreeBytes = minFreeGb * 1024 * 1024 * 1024;
    }

    // ---------- espaço em disco ----------

    private static Path nearestExisting(Path p) {
        Path cur = p;
        while (cur != null && !Files.exists(cur)) cur = cur.getParent();
        return cur;
    }

    public Usage usage(Path p) {
        Path existing = nearestExisting(p);
        if (existing == null) return new Usage(0, 0, 0);
        try {
            var store = Files.getFileStore(existing);
            long total = store.getTotalSpace();
            long free = store.getUsableSpace();
            return new Usage(total, free, total - free);
        } catch (IOException e) {
            return new Usage(0, 0, 0);
        }
    }

    public List<RootView> roots() {
        List<RootView> out = new ArrayList<>();
        for (int i = 0; i < roots.size(); i++) {
            out.add(new RootView(i, roots.get(i).toString(), Files.isDirectory(roots.get(i)), usage(roots.get(i))));
        }
        return out;
    }

    /** Discos montados no PC (visíveis em DISKS_DIR): só entram pastas que são ponto de montagem de outro dispositivo. */
    public List<DiskView> disks() {
        int idx = roots.indexOf(disksDir);
        if (idx < 0 || !Files.isDirectory(disksDir)) return List.of();
        String baseDev;
        try { baseDev = Files.getFileStore(disksDir).name(); } catch (IOException e) { baseDev = ""; }
        List<DiskView> out = new ArrayList<>();
        try (Stream<Path> s = Files.list(disksDir)) {
            for (Path p : s.filter(Files::isDirectory).sorted().toList()) {
                try {
                    var store = Files.getFileStore(p);
                    boolean mounted = !store.name().equals(baseDev) || store.toString().startsWith(p + " (");
                    if (!mounted || store.getTotalSpace() == 0) continue;
                    out.add(new DiskView(p.getFileName().toString(), store.type(), idx,
                        p.getFileName().toString(), usage(p), Files.isWritable(p)));
                } catch (IOException ignored) { /* disco indisponível: ignora */ }
            }
        } catch (IOException e) {
            return List.of();
        }
        return out;
    }

    // ---------- resolução segura de caminhos ----------

    private Path root(int index) {
        if (index < 0 || index >= roots.size()) throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_ROOT", "Raiz inválida");
        return roots.get(index);
    }

    /** Resolve `relative` dentro de `base`, rejeitando path traversal e symlinks que escapem da base. */
    Path safeResolve(Path base, String relative) {
        String rel = relative == null ? "" : relative.replace('\\', '/');
        if (rel.startsWith("/") || rel.matches("^[A-Za-z]:.*")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PATH_INVALID", "Caminho relativo inválido");
        }
        Path resolved = base.resolve(rel).normalize();
        if (!resolved.startsWith(base)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PATH_TRAVERSAL", "Caminho fora do local autorizado");
        }
        Path existing = nearestExisting(resolved);
        try {
            if (existing != null && !existing.toRealPath().startsWith(base.toRealPath())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "PATH_TRAVERSAL", "Caminho fora do local autorizado");
            }
        } catch (IOException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PATH_INVALID", "Caminho inacessível");
        }
        return resolved;
    }

    public List<DirEntry> browse(int rootIndex, String relative) {
        Path dir = safeResolve(root(rootIndex), relative);
        if (!Files.isDirectory(dir)) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_DIR", "Pasta não encontrada");
        try (Stream<Path> s = Files.list(dir)) {
            return s.filter(Files::isDirectory).filter(p -> !p.getFileName().toString().startsWith("."))
                .sorted(Comparator.comparing(p -> p.getFileName().toString().toLowerCase()))
                .map(p -> new DirEntry(p.getFileName().toString(), root(rootIndex).relativize(p).toString().replace('\\', '/')))
                .toList();
        } catch (IOException e) {
            throw new ApiException(HttpStatus.FORBIDDEN, "NO_PERMISSION", "Sem permissão para listar a pasta");
        }
    }

    // ---------- locais registrados ----------

    public LocationView view(StorageLocation l) {
        Path p = Path.of(l.getPath());
        boolean exists = Files.isDirectory(p);
        Usage u = usage(p);
        double pct = u.total() == 0 ? 0 : u.used() * 100.0 / u.total();
        return new LocationView(l.getId(), l.getName(), l.getPath(), l.getKind(), l.isDefaultLocation(), exists,
            exists && Files.isWritable(p), u, pct, exists && u.free() < minFreeBytes);
    }

    public List<LocationView> list() { return repo.findAll().stream().map(this::view).toList(); }

    public StorageLocation get(long id) {
        return repo.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NO_LOCATION", "Local de armazenamento não encontrado"));
    }

    @Transactional
    public LocationView create(String name, int rootIndex, String relative, String kind, boolean makeDefault, boolean createIfMissing) {
        String k = kind == null ? "GENERAL" : kind.toUpperCase();
        if (!KINDS.contains(k)) throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_KIND", "Tipo inválido");
        if (repo.findByName(name).isPresent()) throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE", "Já existe um local com esse nome");
        Path dir = safeResolve(root(rootIndex), relative);
        try {
            if (createIfMissing) Files.createDirectories(dir);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.FORBIDDEN, "NO_PERMISSION", "Não foi possível criar a pasta: " + e.getMessage());
        }
        if (!Files.isDirectory(dir)) throw new ApiException(HttpStatus.BAD_REQUEST, "NOT_DIR", "A pasta não existe");
        StorageLocation l = new StorageLocation();
        l.setName(name);
        l.setPath(dir.toString());
        l.setKind(k);
        boolean first = repo.findByKindAndDefaultLocationTrue(k).isEmpty();
        l.setDefaultLocation(makeDefault || first);
        if (l.isDefaultLocation()) clearDefaults(k);
        return view(repo.save(l));
    }

    private void clearDefaults(String kind) {
        for (StorageLocation o : repo.findByKindAndDefaultLocationTrue(kind)) {
            o.setDefaultLocation(false);
            repo.save(o);
        }
    }

    @Transactional
    public LocationView setDefault(long id) {
        StorageLocation l = get(id);
        clearDefaults(l.getKind());
        l.setDefaultLocation(true);
        return view(repo.save(l));
    }

    @Transactional
    public void delete(long id) { repo.delete(get(id)); }

    /** Cria um arquivo temporário para provar permissão de escrita. */
    public LocationView test(long id) {
        StorageLocation l = get(id);
        Path p = Path.of(l.getPath());
        if (!Files.isDirectory(p)) throw new ApiException(HttpStatus.BAD_REQUEST, "NOT_DIR", "A pasta não existe no servidor");
        try {
            Files.delete(Files.createTempFile(p, ".streamhub-write-test", ".tmp"));
        } catch (IOException e) {
            throw new ApiException(HttpStatus.FORBIDDEN, "NO_PERMISSION", "Sem permissão de gravação: " + e.getMessage());
        }
        return view(l);
    }

    /** Escolhe o destino: id informado > padrão do tipo > padrão geral. */
    public StorageLocation pick(Long id, String kind) {
        if (id != null) return get(id);
        List<StorageLocation> byKind = repo.findByKindAndDefaultLocationTrue(kind);
        if (!byKind.isEmpty()) return byKind.get(0);
        List<StorageLocation> general = repo.findByKindAndDefaultLocationTrue("GENERAL");
        if (!general.isEmpty()) return general.get(0);
        throw new ApiException(HttpStatus.BAD_REQUEST, "NO_DEFAULT",
            "Nenhuma pasta de download configurada. Cadastre uma em Armazenamento.");
    }

    public Path resolveDestination(StorageLocation l, String relative) {
        return safeResolve(Path.of(l.getPath()), relative);
    }

    public void requireSpace(Path destination, long sizeBytes) {
        long free = usage(destination).free();
        if (sizeBytes > 0 && free - sizeBytes < minFreeBytes / 5) {
            throw new ApiException(HttpStatus.CONFLICT, "INSUFFICIENT_SPACE", "Espaço insuficiente: livre "
                + free / (1024 * 1024) + " MB, necessário " + sizeBytes / (1024 * 1024) + " MB");
        }
    }
}
