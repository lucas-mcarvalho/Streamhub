package com.streamhub.catalog;

import java.util.List;

public record CatalogItem(String ref, String source, String type, String id, String kind, String title,
                          String originalTitle, String overview, String posterUrl, String backdropUrl, Integer year,
                          Double rating, List<String> genres, Integer episodes, Integer seasons, String status,
                          Integer runtime, String format, String studio) {}
