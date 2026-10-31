package com.streamhub.download;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "download")
@Getter
@Setter
public class Download {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String title;
    private String kind;
    @Column(name = "catalog_ref")
    private String catalogRef;
    private String indexer;
    @Column(name = "source_url", columnDefinition = "text")
    private String sourceUrl;
    private String tag;
    private String hash;
    @Column(name = "location_id")
    private Long locationId;
    @Column(name = "relative_path")
    private String relativePath = "";
    @Column(name = "save_path")
    private String savePath;
    @Column(name = "content_path")
    private String contentPath;
    @Column(name = "size_bytes")
    private long sizeBytes;
    @Column(name = "downloaded_bytes")
    private long downloadedBytes;
    private double progress;
    @Column(name = "dl_speed")
    private long dlSpeed;
    @Column(name = "up_speed")
    private long upSpeed;
    @Column(name = "eta_seconds")
    private Long etaSeconds;
    /** QUEUED, DOWNLOADING, PAUSED, COMPLETED, ERROR */
    private String status = "QUEUED";
    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;
    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "completed_at")
    private LocalDateTime completedAt;
}
