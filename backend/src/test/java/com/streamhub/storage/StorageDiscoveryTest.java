package com.streamhub.storage;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StorageDiscoveryTest {
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
        Files.createDirectories(tmp.resolve("$RECYCLE.BIN/Filmes"));

        assertEquals(List.of(tmp.resolve("Filmes"), tmp.resolve("Games/Movies"), tmp.resolve("StreamDb/Animes"),
            tmp.resolve("StreamDb/Séries")), StorageDiscovery.mediaDirs(tmp));
    }

    @Test
    void ignoreKeySurvivesRemountWithAnotherName() {
        Path disks = Path.of("/disks");
        assertEquals(StorageDiscovery.ignoreKey(disks, Path.of("/disks/HDEXTERNO/StreamDb/Animes")),
            StorageDiscovery.ignoreKey(disks, Path.of("/disks/HDEXTERNO1/StreamDb/Animes")));
        assertEquals("/media/Filmes", StorageDiscovery.ignoreKey(disks, Path.of("/media/Filmes")));
    }

    @Test
    void kindFromFolderName() {
        assertEquals("SERIES", StorageDiscovery.KNOWN.get(StorageDiscovery.normalize("Séries")));
        assertEquals("ANIME", StorageDiscovery.KNOWN.get(StorageDiscovery.normalize("ANIMES")));
    }
}
