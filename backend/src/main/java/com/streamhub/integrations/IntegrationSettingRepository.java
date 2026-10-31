package com.streamhub.integrations;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface IntegrationSettingRepository extends JpaRepository<IntegrationSetting, Long> {
    Optional<IntegrationSetting> findByService(String service);
}
