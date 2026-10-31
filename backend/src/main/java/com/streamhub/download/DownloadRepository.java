package com.streamhub.download;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DownloadRepository extends JpaRepository<Download, Long> {
    List<Download> findAllByOrderByCreatedAtDesc();

    List<Download> findByStatusIn(Collection<String> statuses);
}
