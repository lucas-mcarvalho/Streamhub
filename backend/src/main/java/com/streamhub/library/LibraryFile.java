package com.streamhub.library;

import java.time.Instant;

public record LibraryFile(String id, String name, String group, String kind, long sizeBytes, Instant modified,
                          Integer season, Integer episode, String location, String relativePath) {}
