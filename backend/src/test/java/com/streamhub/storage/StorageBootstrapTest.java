package com.streamhub.storage;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StorageBootstrapTest {
    @TempDir
    Path tmp;

    @Test
    void findsMediaFoldersUpToTwoLevels() throws Exception {
        Files.createDirectories(tmp.resolve("StreamDb/Animes/Animes"));   // dentro de uma pasta já reconhecida: ignorada
        Files.createDirectories(tmp.resolve("StreamDb/Séries"));
        Files.createDirectories(tmp.resolve("Filmes"));
        Files.createDirectories(tmp.resolve("Games/Movies/x"));
        Files.createDirectories(tmp.resolve("a/b/Animes"));                // fundo demais
        Files.createDirectories(tmp.resolve(".Trash/Filmes"));

        assertEquals(List.of(tmp.resolve("Filmes"), tmp.resolve("Games/Movies"), tmp.resolve("StreamDb/Animes"),
            tmp.resolve("StreamDb/Séries")), StorageBootstrap.mediaDirs(tmp));
    }

    @Test
    void kindFromFolderName() {
        assertEquals("SERIES", StorageBootstrap.KNOWN.get(StorageBootstrap.normalize("Séries")));
        assertEquals("ANIME", StorageBootstrap.KNOWN.get(StorageBootstrap.normalize("ANIMES")));
    }
}
