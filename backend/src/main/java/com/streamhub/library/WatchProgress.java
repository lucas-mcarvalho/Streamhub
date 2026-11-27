package com.streamhub.library;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** Até onde um arquivo da biblioteca foi assistido e se já foi visto até o fim. */
@Entity
@Table(name = "watch_progress")
@Getter
@Setter
public class WatchProgress {
    @Id
    @Column(name = "file_id", columnDefinition = "text")
    private String fileId;
    @Column(name = "position_seconds")
    private double position;
    @Column(name = "duration_seconds")
    private double duration;
    private boolean done;
    @Column(name = "updated_at")
    private Instant updatedAt;
}
