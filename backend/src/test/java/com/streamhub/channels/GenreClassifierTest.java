package com.streamhub.channels;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

class GenreClassifierTest {
    @Test
    void usesListCategories() {
        assertEquals(List.of("Desenho"), GenreClassifier.classify("Kids", "Canal X"));
        assertEquals(List.of("Filmes", "Música"), GenreClassifier.classify("Entertainment;Movies;Music", "Canal X"));
    }

    @Test
    void fallsBackToNameKeywords() {
        assertTrue(GenreClassifier.classify("Brazil", "Cartoonito HD").contains("Desenho"));
        assertTrue(GenreClassifier.classify("Brazil", "SporTV 2").contains("Esportes"));
        assertTrue(GenreClassifier.classify("United States", "CNN Headlines").contains("Notícias"));
        assertEquals(List.of("Outros"), GenreClassifier.classify("United States", "Random Channel"));
    }
}
