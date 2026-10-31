package com.streamhub.storage;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.streamhub.config.ApiException;

class StorageServiceTest {
    @TempDir
    Path tmp;

    private StorageService service() { return new StorageService(null, tmp.toString(), 1); }

    @Test
    void resolvesInsideBase() {
        Path base = tmp.toAbsolutePath().normalize();
        assertEquals(base.resolve("Filmes/X"), service().safeResolve(base, "Filmes/X"));
    }

    @Test
    void rejectsTraversalAndAbsolute() {
        Path base = tmp.toAbsolutePath().normalize();
        assertThrows(ApiException.class, () -> service().safeResolve(base, "../etc"));
        assertThrows(ApiException.class, () -> service().safeResolve(base, "a/../../etc"));
        assertThrows(ApiException.class, () -> service().safeResolve(base, "/etc"));
    }

    @Test
    void rejectsSymlinkEscape() throws Exception {
        Path base = Files.createDirectory(tmp.resolve("base"));
        Path outside = Files.createDirectory(tmp.resolve("outside"));
        Files.createSymbolicLink(base.resolve("link"), outside);
        assertThrows(ApiException.class, () -> service().safeResolve(base.toAbsolutePath().normalize(), "link/x"));
    }
}
