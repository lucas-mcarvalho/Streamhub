package com.streamhub.channels;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ChannelSourceRepository extends JpaRepository<ChannelSource, Long> {
    List<ChannelSource> findAllByOrderByBuiltinDescIdAsc();
}
