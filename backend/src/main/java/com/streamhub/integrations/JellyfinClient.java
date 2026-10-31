package com.streamhub.integrations;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.streamhub.config.Http;
import com.streamhub.config.J;

@Component
public class JellyfinClient {
    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST = new ParameterizedTypeReference<>() {};

    public record ResumeItem(String id, String title, String subtitle, long positionSeconds, long durationSeconds,
                             String imageUrl, String webUrl) {}

    private final IntegrationService integrations;

    public JellyfinClient(IntegrationService integrations) { this.integrations = integrations; }

    private RestClient rc(IntegrationService.Conn c) {
        return Http.builder(c.baseUrl()).defaultHeader("X-Emby-Token", c.secret()).build();
    }

    public String version() {
        var c = integrations.require(Svc.JELLYFIN);
        return J.str(rc(c).get().uri(Http.uri(c.baseUrl(), "/System/Info")).retrieve().body(MAP).get("Version"));
    }

    public void refreshLibrary() {
        var c = integrations.require(Svc.JELLYFIN);
        rc(c).post().uri(Http.uri(c.baseUrl(), "/Library/Refresh")).retrieve().toBodilessEntity();
    }

    /** Itens "continuar assistindo" do primeiro usuário do Jellyfin. */
    public List<ResumeItem> resume() {
        var c = integrations.require(Svc.JELLYFIN);
        RestClient rc = rc(c);
        List<Map<String, Object>> users = rc.get().uri(Http.uri(c.baseUrl(), "/Users")).retrieve().body(LIST);
        if (users == null || users.isEmpty()) return List.of();
        String userId = J.str(users.get(0).get("Id"));
        Map<String, Object> res;
        try {
            res = rc.get().uri(Http.uri(c.baseUrl(), "/UserItems/Resume", "userId", userId, "Limit", 12, "MediaTypes", "Video"))
                .retrieve().body(MAP);
        } catch (RestClientResponseException e) {
            res = rc.get().uri(Http.uri(c.baseUrl(), "/Users/" + userId + "/Items/Resume", "Limit", 12, "MediaTypes", "Video"))
                .retrieve().body(MAP);
        }
        String pub = integrations.publicJellyfinUrl().replaceAll("/+$", "");
        List<ResumeItem> out = new ArrayList<>();
        for (Map<String, Object> it : J.maps(res.get("Items"))) {
            String id = J.str(it.get("Id"));
            long pos = J.lng(J.at(it, "UserData", "PlaybackPositionTicks")) == null ? 0 : J.lng(J.at(it, "UserData", "PlaybackPositionTicks")) / 10_000_000L;
            long dur = J.lng(it.get("RunTimeTicks")) == null ? 0 : J.lng(it.get("RunTimeTicks")) / 10_000_000L;
            String series = J.str(it.get("SeriesName"));
            out.add(new ResumeItem(id, series != null ? series : J.str(it.get("Name")),
                series != null ? J.str(it.get("Name")) : J.str(it.get("ProductionYear")), pos, dur,
                pub + "/Items/" + id + "/Images/Primary?maxWidth=400", pub + "/web/index.html#!/details?id=" + id));
        }
        return out;
    }
}
