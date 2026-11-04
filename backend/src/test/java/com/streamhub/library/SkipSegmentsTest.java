package com.streamhub.library;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.streamhub.library.LibraryService.Chapter;
import com.streamhub.library.LibraryService.SkipSegment;
import java.util.List;
import org.junit.jupiter.api.Test;

class SkipSegmentsTest {

    @Test
    void capitulosDeAnimeComIntroEOpening() {
        // One Piece (Anime Time): "Intro" é a cena antes da abertura; a abertura é "Opening"
        List<SkipSegment> s = LibraryService.skipsFromChapters(List.of(
            new Chapter("Intro", 0, 31.365), new Chapter("Opening", 31.365, 111.028),
            new Chapter("Part A", 111.028, 765.974), new Chapter("Eyecatch", 765.974, 780.53),
            new Chapter("Part B", 780.53, 1376), new Chapter("Ending", 1376, 1445.986),
            new Chapter("Preview", 1445.986, 1481.01)));
        assertEquals(List.of(new SkipSegment("intro", 31.365, 111.028), new SkipSegment("credits", 1376, 1445.986),
            new SkipSegment("preview", 1445.986, 1481.01)), s);
    }

    @Test
    void nomesEmMaiusculasEJapones() {
        List<SkipSegment> s = LibraryService.skipsFromChapters(List.of(
            new Chapter("AVANT-TITLE", 0, 152), new Chapter("OPENING", 152, 242), new Chapter("A-PART", 242, 855),
            new Chapter("ENDING", 1289.5, 1389), new Chapter("YOKOKU", 1415, 1432)));
        assertEquals(List.of("intro", "credits", "preview"), s.stream().map(SkipSegment::kind).toList());
    }

    @Test
    void introSemOpeningEhAbertura() {
        List<SkipSegment> s = LibraryService.skipsFromChapters(List.of(
            new Chapter("Recap", 0, 40), new Chapter("Intro", 40, 95), new Chapter("Episode", 95, 2500),
            new Chapter("Credits", 2500, 2600)));
        assertEquals(List.of("recap", "intro", "credits"), s.stream().map(SkipSegment::kind).toList());
    }

    @Test
    void ignoraCapitulosGenericosOuLongosDemais() {
        assertTrue(LibraryService.skipsFromChapters(List.of(
            new Chapter("Chapter 1", 0, 600), new Chapter("Chapter 2", 600, 1200))).isEmpty());
        assertTrue(LibraryService.skipsFromChapters(List.of(new Chapter("Opening", 0, 900))).isEmpty());
    }
}
