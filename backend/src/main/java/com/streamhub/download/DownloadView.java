package com.streamhub.download;

import java.time.LocalDateTime;

public record DownloadView(Long id, String title, String kind, String indexer, String status, double progress,
                           long sizeBytes, long downloadedBytes, long dlSpeed, long upSpeed, Long etaSeconds,
                           String destination, String errorMessage, LocalDateTime createdAt, LocalDateTime completedAt) {
    static DownloadView of(Download d) {
        return new DownloadView(d.getId(), d.getTitle(), d.getKind(), d.getIndexer(), d.getStatus(), d.getProgress(),
            d.getSizeBytes(), d.getDownloadedBytes(), d.getDlSpeed(), d.getUpSpeed(), d.getEtaSeconds(), d.getSavePath(),
            d.getErrorMessage(), d.getCreatedAt(), d.getCompletedAt());
    }
}
