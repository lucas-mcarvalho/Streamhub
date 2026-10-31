package com.streamhub.storage;

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
@Table(name = "storage_location")
@Getter
@Setter
public class StorageLocation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    @Column(name = "root_path")
    private String path;
    /** GENERAL, MOVIE, SERIES ou ANIME */
    private String kind = "GENERAL";
    @Column(name = "is_default")
    private boolean defaultLocation;
    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
