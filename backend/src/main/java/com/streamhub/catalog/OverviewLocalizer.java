package com.streamhub.catalog;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.streamhub.config.Http;
import com.streamhub.config.J;

/**
 * O AniList só fornece sinopses em inglês. Aqui elas viram português: primeiro a sinopse pt-BR do TMDB
 * (tradução humana), depois tradução automática (MyMemory) como alternativa. Tudo fica salvo no banco.
 */
@Service
public class OverviewLocalizer {
    private static final Logger log = LoggerFactory.getLogger(OverviewLocalizer.class);
    private static final Pattern SOURCE_TAG = Pattern.compile("\\s*\\((Source|Fonte|Written by)[^)]*\\)\\s*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SENTENCE = Pattern.compile("(?<=[.!?…])\\s+");
    private static final long NEGATIVE_TTL_MS = 30 * 60 * 1000;

    private final TmdbClient tmdb;
    private final OverviewTranslationRepository repo;
    private final ExecutorService pool = Executors.newFixedThreadPool(12);
    private final Map<String, String> memory = new ConcurrentHashMap<>();
    private final Map<String, Long> failed = new ConcurrentHashMap<>();

    public OverviewLocalizer(TmdbClient tmdb, OverviewTranslationRepository repo) {
        this.tmdb = tmdb;
        this.repo = repo;
    }

    private static boolean needsTranslation(CatalogItem it) {
        return "anilist".equals(it.source()) && it.overview() != null && !it.overview().isBlank();
    }

    /** Traduz as sinopses em paralelo; espera no máximo `waitSeconds` e o que faltar termina em segundo plano. */
    public List<CatalogItem> localize(List<CatalogItem> items, int waitSeconds) {
        List<CompletableFuture<CatalogItem>> jobs = new ArrayList<>();
        for (CatalogItem it : items) {
            jobs.add(needsTranslation(it) ? CompletableFuture.supplyAsync(() -> localize(it), pool) : CompletableFuture.completedFuture(it));
        }
        try {
            CompletableFuture.allOf(jobs.toArray(new CompletableFuture[0])).get(waitSeconds, TimeUnit.SECONDS);
        } catch (Exception ignored) {
            // tempo esgotado: usa o que já ficou pronto
        }
        List<CatalogItem> out = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            CompletableFuture<CatalogItem> j = jobs.get(i);
            out.add(j.isDone() && !j.isCompletedExceptionally() ? j.join() : items.get(i));
        }
        return out;
    }

    public CatalogItem localize(CatalogItem it) {
        if (!needsTranslation(it)) return it;
        String pt = portuguese(it);
        return pt == null ? it : it.withOverview(pt);
    }

    private String portuguese(CatalogItem it) {
        String ref = it.ref();
        String cached = memory.get(ref);
        if (cached != null) return cached;
        Optional<OverviewTranslation> saved = repo.findById(ref);
        if (saved.isPresent()) {
            memory.put(ref, saved.get().getText());
            return saved.get().getText();
        }
        Long lastFail = failed.get(ref);
        if (lastFail != null && System.currentTimeMillis() - lastFail < NEGATIVE_TTL_MS) return null;

        String text = null, source = null;
        try {
            boolean movie = "MOVIE".equals(it.format());
            String type = movie ? "movie" : "tv";
            for (String q : new String[] {it.title(), it.originalTitle()}) {
                if (q == null || q.isBlank() || text != null) continue;
                Optional<String> ov = tmdb.overviewPt(type, q, it.year());
                if (ov.isPresent()) { text = ov.get(); source = "tmdb"; }
            }
        } catch (Exception e) {
            log.debug("TMDB indisponível para a sinopse de {}: {}", ref, e.getMessage());
        }
        if (text == null) {
            text = machineTranslate(SOURCE_TAG.matcher(it.overview()).replaceAll("").trim());
            if (text != null) source = "mymemory";
        }
        if (text == null) {
            failed.put(ref, System.currentTimeMillis());
            return null;
        }
        OverviewTranslation row = new OverviewTranslation();
        row.setItemRef(ref);
        row.setText(text);
        row.setSource(source);
        try {
            repo.save(row);
        } catch (Exception e) {
            log.debug("Não foi possível salvar a tradução de {}: {}", ref, e.getMessage());
        }
        memory.put(ref, text);
        return text;
    }

    /** Tradução automática gratuita (MyMemory), em blocos de até ~450 caracteres. Retorna null se a cota acabar. */
    private String machineTranslate(String text) {
        if (text.isBlank()) return null;
        StringBuilder out = new StringBuilder();
        StringBuilder chunk = new StringBuilder();
        List<String> chunks = new ArrayList<>();
        for (String sentence : SENTENCE.split(text)) {
            if (chunk.length() + sentence.length() > 450 && chunk.length() > 0) { chunks.add(chunk.toString()); chunk.setLength(0); }
            if (sentence.length() > 450) sentence = sentence.substring(0, 450);
            chunk.append(chunk.length() > 0 ? " " : "").append(sentence);
        }
        if (chunk.length() > 0) chunks.add(chunk.toString());
        for (String c : chunks) {
            try {
                Map<String, Object> res = Http.builder("https://api.mymemory.translated.net").build().get()
                    .uri(Http.uri("https://api.mymemory.translated.net", "/get", "q", c, "langpair", "en|pt-BR"))
                    .retrieve().body(new org.springframework.core.ParameterizedTypeReference<Map<String, Object>>() {});
                String t = J.str(J.at(res, "responseData", "translatedText"));
                if (t == null || t.isBlank() || t.toUpperCase().contains("MYMEMORY WARNING") || t.toUpperCase().startsWith("PLEASE SELECT")) return null;
                out.append(out.length() > 0 ? " " : "").append(unescape(t));
            } catch (Exception e) {
                log.debug("Tradução automática falhou: {}", e.getMessage());
                return null;
            }
        }
        return out.toString();
    }

    private static String unescape(String s) {
        return s.replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">");
    }
}
