package com.streamhub.integrations;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.streamhub.config.ApiException;
import com.streamhub.config.CryptoService;

/**
 * Resolve a conexão de cada serviço externo: banco (editado pela interface) > variáveis de ambiente >
 * descoberta da chave em config.xml dos apps *arr (quando o diretório de configuração está montado).
 */
@Service
public class IntegrationService {
    private static final Pattern API_KEY = Pattern.compile("<ApiKey>([^<]+)</ApiKey>");

    public record Conn(String baseUrl, String username, String secret) {}

    public record View(String service, String label, String baseUrl, String username, boolean hasSecret,
                       boolean enabled, boolean configured, String source) {}

    private final IntegrationSettingRepository repo;
    private final CryptoService crypto;
    private final Environment env;

    public IntegrationService(IntegrationSettingRepository repo, CryptoService crypto, Environment env) {
        this.repo = repo;
        this.crypto = crypto;
        this.env = env;
    }

    private String prop(Svc s, String name) {
        String v = env.getProperty("streamhub.integrations." + s.key() + "." + name);
        return v == null || v.isBlank() ? null : v;
    }

    private static String blankToNull(String v) { return v == null || v.isBlank() ? null : v; }

    private String discover(Svc s) {
        if (s != Svc.PROWLARR && s != Svc.SONARR && s != Svc.RADARR) return null;
        Path f = Path.of(env.getProperty("streamhub.integrations.config-dir", "/integrations"), s.key(), "config.xml");
        try {
            if (Files.isReadable(f)) {
                Matcher m = API_KEY.matcher(Files.readString(f));
                if (m.find()) return m.group(1);
            }
        } catch (Exception ignored) {
            // sem acesso ao arquivo: segue como não configurado
        }
        return null;
    }

    public Optional<Conn> resolve(Svc s) {
        Optional<IntegrationSetting> row = repo.findByService(s.key());
        if (row.isPresent() && !row.get().isEnabled()) return Optional.empty();
        String url = row.map(IntegrationSetting::getBaseUrl).map(IntegrationService::blankToNull).orElse(prop(s, "url"));
        String user = row.map(IntegrationSetting::getUsername).map(IntegrationService::blankToNull).orElse(prop(s, "username"));
        String secret = row.map(IntegrationSetting::getApiKeyEnc).map(IntegrationService::blankToNull)
            .map(crypto::decrypt).orElse(null);
        if (secret == null) secret = prop(s, "key");
        if (secret == null) secret = discover(s);
        boolean needsUrl = s != Svc.TMDB;
        if ((needsUrl && url == null) || (secret == null && s != Svc.QBITTORRENT)) return Optional.empty();
        return Optional.of(new Conn(url, user, secret));
    }

    public Conn require(Svc s) {
        return resolve(s).orElseThrow(() -> new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "NOT_CONFIGURED",
            s.label() + " não está configurado. Ajuste em Configurações > Integrações."));
    }

    public boolean isConfigured(Svc s) { return resolve(s).isPresent(); }

    public String publicJellyfinUrl() {
        return env.getProperty("streamhub.integrations.jellyfin.public-url", "http://localhost:8096");
    }

    public boolean arrImportOnComplete() {
        return Boolean.parseBoolean(env.getProperty("streamhub.integrations.arr-import-on-complete", "false"));
    }

    public List<View> list() {
        List<View> out = new ArrayList<>();
        for (Svc s : Svc.values()) {
            Optional<IntegrationSetting> row = repo.findByService(s.key());
            Optional<Conn> c = resolve(s);
            String source = row.isPresent() ? "banco" : c.isPresent() ? "ambiente/automático" : "-";
            out.add(new View(s.key(), s.label(),
                c.map(Conn::baseUrl).orElse(row.map(IntegrationSetting::getBaseUrl).orElse(prop(s, "url"))),
                c.map(Conn::username).orElse(null),
                c.map(x -> x.secret() != null).orElse(false),
                row.map(IntegrationSetting::isEnabled).orElse(true), c.isPresent(), source));
        }
        return out;
    }

    public void save(Svc s, String baseUrl, String username, String secret, boolean enabled) {
        IntegrationSetting row = repo.findByService(s.key()).orElseGet(() -> {
            IntegrationSetting n = new IntegrationSetting();
            n.setService(s.key());
            return n;
        });
        row.setBaseUrl(blankToNull(baseUrl));
        row.setUsername(blankToNull(username));
        if (secret != null && !secret.isBlank()) row.setApiKeyEnc(crypto.encrypt(secret));
        row.setEnabled(enabled);
        row.setUpdatedAt(LocalDateTime.now());
        repo.save(row);
    }
}
