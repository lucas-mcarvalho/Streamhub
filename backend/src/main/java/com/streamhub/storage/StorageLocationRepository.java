package com.streamhub.storage;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StorageLocationRepository extends JpaRepository<StorageLocation, Long> {
    List<StorageLocation> findByKindAndDefaultLocationTrue(String kind);

    List<StorageLocation> findByKind(String kind);

    Optional<StorageLocation> findByName(String name);
}
