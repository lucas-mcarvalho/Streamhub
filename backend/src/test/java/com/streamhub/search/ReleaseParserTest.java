package com.streamhub.search;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ReleaseParserTest {
    @Test
    void parsesResolutionSourceCodec() {
        String t = "Movie.2023.2160p.BluRay.REMUX.HEVC.DUAL";
        assertEquals("4K", ReleaseParser.resolution(t));
        assertEquals("REMUX", ReleaseParser.source(t));
        assertEquals("HEVC", ReleaseParser.codec(t));
        assertTrue(ReleaseParser.audio(t).contains("Português"));
    }

    @Test
    void unknownResolution() {
        assertEquals("?", ReleaseParser.resolution("Some Title"));
    }

    @Test
    void detectsPortugueseSubtitles() {
        assertTrue(ReleaseParser.subs("Anime.S01.1080p.Legendado").contains(ReleaseParser.SUB_PT_BR));
        assertTrue(ReleaseParser.subs("Anime.S01.1080p.PT-BR.Sub").contains(ReleaseParser.SUB_PT_BR));
        assertTrue(ReleaseParser.subs("Anime.S01.1080p.MULTI-SUBS").contains(ReleaseParser.SUB_MULTI));
        assertTrue(ReleaseParser.audio("Anime.S01.PT-BR.Sub").isEmpty());
        assertTrue(ReleaseParser.audio("Movie.2020.DUAL").contains("Português"));
    }
}
