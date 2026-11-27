package com.streamhub.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.streamhub.search.SearchController;

class SearchTitlesTest {
    @Test
    void inglesPrimeiroSemRepetirESemOutraEscrita() {
        assertEquals(List.of("Dune: Part Two", "Duna: Parte Dois"), CatalogService.searchTitles("Dune: Part Two", "Dune: Part Two", "Duna: Parte Dois"));
        assertEquals(List.of("Spirited Away", "A Viagem de Chihiro"), CatalogService.searchTitles("Spirited Away", "千と千尋の神隠し", "A Viagem de Chihiro"));
        assertEquals(List.of("La Casa de Papel"), CatalogService.searchTitles(null, "La Casa de Papel", "la casa de papel"));
    }

    @Test
    void mesmoTorrentEmBuscasDiferentesEhUmSo() {
        String a = SearchController.dedupeKey(Map.of("magnetUrl", "magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01&dn=x"), "Dune.Part.Two.2024");
        String b = SearchController.dedupeKey(Map.of("infoHash", "abcdef0123456789abcdef0123456789abcdef01"), "Duna Parte Dois 2024");
        assertEquals(a, b);
    }
}
