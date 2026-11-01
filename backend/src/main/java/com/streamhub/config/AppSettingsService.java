package com.streamhub.config;

import org.springframework.stereotype.Service;

/** Ajustes simples (chave/valor) editáveis pela interface e guardados no banco. */
@Service
public class AppSettingsService {
    private final AppSettingRepository repo;

    public AppSettingsService(AppSettingRepository repo) { this.repo = repo; }

    public int getInt(String key, int defaultValue) {
        return repo.findById(key).map(s -> {
            try {
                return Integer.parseInt(s.getValue().trim());
            } catch (NumberFormatException e) {
                return defaultValue;
            }
        }).orElse(defaultValue);
    }

    public void setInt(String key, int value) {
        AppSetting s = repo.findById(key).orElseGet(() -> {
            AppSetting n = new AppSetting();
            n.setKey(key);
            return n;
        });
        s.setValue(String.valueOf(value));
        repo.save(s);
    }
}
