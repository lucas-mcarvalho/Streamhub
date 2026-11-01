package com.streamhub.channels;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Gênero dos canais (em português): primeiro pela categoria da lista, depois por palavras do nome. */
final class GenreClassifier {
    private GenreClassifier() {}

    /** Ordem de exibição dos gêneros. */
    static final List<String> ORDER = List.of("Desenho", "Filmes", "Séries", "Esportes", "Notícias", "Música", "Documentários",
        "Entretenimento", "Religioso", "Educação", "Culinária", "Compras", "Outros");

    private static final Map<String, String> CATEGORY = Map.ofEntries(
        Map.entry("kids", "Desenho"), Map.entry("animation", "Desenho"), Map.entry("children", "Desenho"),
        Map.entry("movies", "Filmes"), Map.entry("series", "Séries"), Map.entry("sports", "Esportes"),
        Map.entry("news", "Notícias"), Map.entry("music", "Música"), Map.entry("documentary", "Documentários"),
        Map.entry("religious", "Religioso"), Map.entry("education", "Educação"), Map.entry("culture", "Educação"),
        Map.entry("cooking", "Culinária"), Map.entry("shop", "Compras"),
        Map.entry("entertainment", "Entretenimento"), Map.entry("comedy", "Entretenimento"), Map.entry("lifestyle", "Entretenimento"),
        Map.entry("family", "Entretenimento"), Map.entry("classic", "Entretenimento"), Map.entry("relax", "Entretenimento"));

    private static final Map<String, Pattern> KEYWORDS = new LinkedHashMap<>();

    static {
        KEYWORDS.put("Desenho", p("kids|cartoon|anime|disney|nick|nickelodeon|boomerang|cartoonito|gloob|gloobinho|baby|junior|toon|pocoyo|peppa|infantil|mickey|turma|patrulha|discovery kids|pequenos"));
        KEYWORDS.put("Esportes", p("sport|sports|esporte|esportes|futebol|football|soccer|espn|premiere|combate|nba|nfl|ufc|tennis|golf|racing|f1|sportv|dazn|eurosport|wrestling|motor|fight|bein"));
        KEYWORDS.put("Filmes", p("movie|movies|film|filmes|cine|cinema|telecine|hbo|cinemax|megapix|tcm|studio universal|filmex|kino"));
        KEYWORDS.put("Séries", p("series|serie|sitcom|novela|telenovela"));
        KEYWORDS.put("Notícias", p("news|noticia|noticias|jornal|cnn|globonews|record news|bbc|al jazeera|euronews|sky news|reuters|tv senado|tv camara"));
        KEYWORDS.put("Música", p("music|musica|mtv|vevo|radio|hits|fm|rock|sertanejo|kiss|rap|jazz|clips"));
        KEYWORDS.put("Documentários", p("doc|docs|documentary|documentario|discovery|history|nat geo|national geographic|animal planet|science|curiosity|travel|viagem"));
        KEYWORDS.put("Religioso", p("relig|gospel|igreja|cancao nova|aparecida|rede vida|church|catolic|cristo|biblia|god"));
        KEYWORDS.put("Culinária", p("cook|food|culin|gourmet|receita|chef"));
        KEYWORDS.put("Educação", p("educa|escola|univesp|aula|curso|cultura"));
    }

    private static Pattern p(String alternatives) { return Pattern.compile("\\b(" + alternatives + ")\\b"); }

    private static String plain(String s) {
        return Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase();
    }

    static List<String> classify(String rawGroup, String name) {
        List<String> out = new ArrayList<>();
        for (String part : plain(rawGroup).split(";")) {
            String g = CATEGORY.get(part.trim());
            if (g != null && !out.contains(g)) out.add(g);
        }
        if (out.size() > 1) out.remove("Entretenimento"); // genérico: só vale quando não há gênero específico
        boolean onlyGeneric = out.isEmpty() || (out.size() == 1 && out.get(0).equals("Entretenimento"));
        if (onlyGeneric) {
            String n = plain(name);
            for (Map.Entry<String, Pattern> e : KEYWORDS.entrySet()) {
                if (e.getValue().matcher(n).find() && !out.contains(e.getKey())) out.add(e.getKey());
            }
        }
        if (out.isEmpty()) out.add("Outros");
        out.sort((a, b) -> Integer.compare(ORDER.indexOf(a), ORDER.indexOf(b)));
        return out;
    }
}
