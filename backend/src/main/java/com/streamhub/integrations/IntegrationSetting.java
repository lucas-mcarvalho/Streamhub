package com.streamhub.integrations;

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
@Table(name = "integration_setting")
@Getter
@Setter
public class IntegrationSetting {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String service;
    @Column(name = "base_url")
    private String baseUrl;
    private String username;
    @Column(name = "api_key_enc")
    private String apiKeyEnc;
    private boolean enabled = true;
    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();
}
