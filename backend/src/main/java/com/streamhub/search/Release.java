package com.streamhub.search;

import java.util.List;

/**
 * Resultado de indexador. `audioHints`/`subtitleHints` são inferidos do nome do release e NÃO
 * garantem o conteúdo real (use a verificação de faixas após o download).
 */
public record Release(String guid, String title, String resolution, String source, String codec, long sizeBytes,
                      Integer seeders, Integer leechers, String indexer, Long indexerId, String publishDate,
                      String magnetUrl, String downloadUrl, String infoUrl, List<String> audioHints,
                      List<String> subtitleHints, boolean languagesVerified, Integer season, Integer seasonEnd,
                      Integer episode) {}
