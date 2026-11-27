package com.streamhub.catalog;

import java.util.List;

/**
 * {@code tvId}: série do TMDB de onde vêm as temporadas (num anime do AniList, a correspondente encontrada pelo título).
 * {@code searchTitles}: nomes para buscar downloads, do mais provável no nome dos releases (inglês) ao menos provável.
 */
public record TitleDetails(CatalogItem item, List<Season> seasons, List<Person> directors, List<Person> cast, String tvId,
                           List<String> searchTitles) {}
