package com.streamhub.library;

import java.time.Instant;

/** {@code quality}: resolução do vídeo ("1080p", "4K"...), ou nulo quando não se sabe. */
public record LibraryFile(String id, String name, String group, String kind, long sizeBytes, Instant modified,
                          Integer season, Integer episode, String location, String relativePath, String quality) {}
