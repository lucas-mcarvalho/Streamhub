package com.streamhub.channels;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "channel_source")
@Getter
@Setter
public class ChannelSource {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    @Column(columnDefinition = "text")
    private String url;
    private boolean builtin;
    /** De onde vem a lista (ex.: "iptv-org · Brasil"). */
    private String origin;
    private int position = 100;
}
