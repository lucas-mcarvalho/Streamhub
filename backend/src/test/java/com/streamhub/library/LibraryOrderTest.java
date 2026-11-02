package com.streamhub.library;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class LibraryOrderTest {
    @Test
    void naturalOrderPutsEpisode2Before10() {
        List<String> names = new ArrayList<>(List.of("Ep 10.mkv", "Ep 2.mkv", "Ep 1.mkv", "Ep 100.mkv"));
        names.sort(LibraryService::naturalCompare);
        assertEquals(List.of("Ep 1.mkv", "Ep 2.mkv", "Ep 10.mkv", "Ep 100.mkv"), names);
    }

    @Test
    void naturalCompareIsStableForEqualNames() {
        assertEquals(0, LibraryService.naturalCompare("a1", "A1"));
        assertTrue(LibraryService.naturalCompare("ED 03.mkv", "ED 10.mkv") < 0);
    }
}
