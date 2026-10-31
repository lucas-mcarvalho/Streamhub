package com.streamhub.integrations;

public enum Svc {
    TMDB("TMDB"), PROWLARR("Prowlarr"), SONARR("Sonarr"), RADARR("Radarr"), QBITTORRENT("qBittorrent"), JELLYFIN("Jellyfin");

    private final String label;

    Svc(String label) { this.label = label; }

    public String label() { return label; }
    public String key() { return name().toLowerCase(); }
}
