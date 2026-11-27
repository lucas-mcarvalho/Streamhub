package com.streamhub.library;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.streamhub.library.LibraryService.SkipSegment;

class AniSkipSegmentsTest {
    private static Map<String, Object> r(String type, double start, double end, double length) {
        return Map.of("skipType", type, "interval", Map.of("startTime", start, "endTime", end), "episodeLength", length);
    }

    @Test
    void aberturaEEncerramentoDoAniSkip() {
        // Kanojo, Okarishimasu S01E03 (resposta real do AniSkip)
        List<SkipSegment> s = AniSkipService.toSegments(List.of(
            r("ed", 1347.083, 1437.083, 1467.0544), r("op", 98.958, 188.958, 1467)), 1467.059);
        assertEquals(List.of(new SkipSegment("intro", 98.958, 188.958), new SkipSegment("credits", 1347.083, 1437.083)), s);
    }

    @Test
    void descartaTemposDeOutroCorte() {
        // a versão de TV tem outra duração: os tempos não batem com o nosso arquivo
        assertTrue(AniSkipService.toSegments(List.of(r("op", 98, 188, 1420)), 1467).isEmpty());
    }

    @Test
    void umTrechoPorTipoELimitadoADuracao() {
        // com abertura "pura" e misturada, fica a pura
        List<SkipSegment> s = AniSkipService.toSegments(List.of(
            r("mixed-op", 10, 100, 0), r("op", 12, 102, 0), r("ed", 1400, 1500, 0)), 1450);
        assertEquals(List.of(new SkipSegment("intro", 12, 102), new SkipSegment("credits", 1400, 1450)), s);
    }

    @Test
    void aberturaComCenasNovasFicaMarcada() {
        List<SkipSegment> s = AniSkipService.toSegments(List.of(r("recap", 0, 60, 0), r("mixed-op", 60, 150, 0)), 1440);
        assertEquals(List.of(new SkipSegment("recap", 0, 60, false), new SkipSegment("intro", 60, 150, true)), s);
    }

    @Test
    void temporadaEEpisodioPeloCaminho() {
        var a = LibraryService.episodeRef("Rent-a-Girlfriend (2020)/[Judas] Pack/[Judas] Kanojo, Okarishimasu - S01E03.mkv");
        assertEquals(new LibraryService.EpisodeRef("Rent-a-Girlfriend (2020)", 1, 3), a);
        var b = LibraryService.episodeRef("Black Clover (2017)/[Anime Time] Black Clover - 009.mkv");
        assertEquals(new LibraryService.EpisodeRef("Black Clover (2017)", null, 9), b);
    }
}
