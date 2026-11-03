package com.streamhub.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.streamhub.config.ApiException;

/**
 * Primeira execução: sem nenhum local registrado, cadastra sozinho as pastas de mídia encontradas nas raízes
 * autorizadas (até dois níveis, ex.: /hd1/Animes ou /hd1/StreamDb/Animes), cada uma com o tipo pelo nome.
 */
@Component
public class StorageBootstrap {
    private static final Logger log = LoggerFactory.getLogger(StorageBootstrap.class);
    /** Nome da pasta (minúsculo, sem acento) → tipo do local. */
    static final Map<String, String> KNOWN = Map.of(
        "animes", "ANIME", "anime", "ANIME",
        "series", "SERIES", "shows", "SERIES", "tv", "SERIES",
        "filmes", "MOVIE", "movies", "MOVIE");

    private final StorageService storage;
    private final StorageLocationRepository repo;

    public StorageBootstrap(StorageService storage, StorageLocationRepository repo) {
        this.storage = storage;
        this.repo = repo;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void registerOnFirstRun() {
        if (repo.count() > 0) return;
        Set<Object> seen = new HashSet<>();   // /media e /hd1 podem ser a mesma pasta do computador
        for (StorageService.RootView root : storage.roots()) {
            if (!root.exists()) continue;
            Path base = Path.of(root.path());
            for (Path dir : mediaDirs(base)) {
                try {
                    Object key = Files.readAttributes(dir, BasicFileAttributes.class).fileKey();
                    if (!seen.add(key != null ? key : dir.toRealPath())) continue;
                    String folder = dir.getFileName().toString();
                    String name = repo.findByName(folder).isEmpty() ? folder : folder + " (" + base.getFileName() + ")";
                    storage.create(name, root.index(), base.relativize(dir).toString(), KNOWN.get(normalize(folder)), false, false);
                    log.info("Local de armazenamento registrado automaticamente: {} -> {}", name, dir);
                } catch (IOException | ApiException e) {
                    log.warn("Não foi possível registrar {}: {}", dir, e.getMessage());
                }
            }
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
                .sorted(Comparator.comparing(Path::toString)).toList();
        } catch (IOException | RuntimeException e) {
            return List.of();
        }
    }

    static String normalize(String name) {
        return Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase();
    }
}
