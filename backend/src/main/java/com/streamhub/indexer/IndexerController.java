package com.streamhub.indexer;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.streamhub.config.ApiException;
import com.streamhub.config.J;
import com.streamhub.integrations.ProwlarrClient;

/** Gerenciamento de indexadores delegado ao Prowlarr. Não há contorno de autenticação: credenciais vão como campos do Prowlarr. */
@RestController
@RequestMapping("/api/indexers")
public class IndexerController {
    public record EnableRequest(boolean enabled) {}
    public record AddRequest(String definitionName, String name, Map<String, Object> fields) {}

    private final ProwlarrClient prowlarr;

    public IndexerController(ProwlarrClient prowlarr) { this.prowlarr = prowlarr; }

    @GetMapping
    public List<Map<String, Object>> list() {
        Set<Long> failing = new HashSet<>();
        try {
            for (Map<String, Object> s : prowlarr.failingStatus()) failing.add(J.lng(s.get("indexerId")));
        } catch (Exception ignored) {
            // status é informativo
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> i : prowlarr.indexers()) {
            Map<String, Object> v = new HashMap<>();
            v.put("id", i.get("id"));
            v.put("name", i.get("name"));
            v.put("enabled", i.get("enable"));
            v.put("protocol", i.get("protocol"));
            v.put("privacy", i.get("privacy"));
            v.put("implementation", i.get("implementationName"));
            v.put("failing", failing.contains(J.lng(i.get("id"))));
            out.add(v);
        }
        return out;
    }

    @PutMapping("/{id}/enabled")
    public void enable(@PathVariable long id, @RequestBody EnableRequest req) { prowlarr.setEnabled(id, req.enabled()); }

    @PostMapping("/{id}/test")
    public Map<String, Object> test(@PathVariable long id) {
        String err = prowlarr.test(id);
        return err == null ? Map.of("ok", true, "message", "Conexão OK") : Map.of("ok", false, "message", err);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable long id) { prowlarr.delete(id); }

    /** Definições de indexadores disponíveis para adicionar (resumo do schema do Prowlarr). */
    @GetMapping("/schema")
    public List<Map<String, Object>> schema() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> s : prowlarr.schema()) {
            List<Map<String, Object>> fields = new ArrayList<>();
            for (Map<String, Object> f : J.maps(s.get("fields"))) {
                fields.add(Map.of("name", String.valueOf(f.get("name")), "label", String.valueOf(f.getOrDefault("label", f.get("name"))),
                    "type", String.valueOf(f.getOrDefault("type", "textbox")), "privacy", String.valueOf(f.getOrDefault("privacy", "normal"))));
            }
            out.add(Map.of("definitionName", String.valueOf(s.get("definitionName")), "name", String.valueOf(s.get("name")),
                "privacy", String.valueOf(s.get("privacy")), "protocol", String.valueOf(s.get("protocol")), "fields", fields));
        }
        return out;
    }

    @PostMapping
    public Map<String, Object> add(@RequestBody AddRequest req) {
        Map<String, Object> template = prowlarr.schema().stream()
            .filter(s -> req.definitionName().equals(J.str(s.get("definitionName")))).findFirst()
            .map(s -> new HashMap<>(s))
            .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "UNKNOWN_INDEXER", "Indexador desconhecido"));
        List<Map<String, Object>> fields = new ArrayList<>();
        for (Map<String, Object> f : J.maps(template.get("fields"))) {
            Map<String, Object> copy = new HashMap<>(f);
            if (req.fields() != null && req.fields().containsKey(String.valueOf(f.get("name")))) {
                copy.put("value", req.fields().get(String.valueOf(f.get("name"))));
            }
            fields.add(copy);
        }
        template.put("fields", fields);
        template.put("enable", true);
        template.put("appProfileId", prowlarr.defaultAppProfileId());
        if (req.name() != null && !req.name().isBlank()) template.put("name", req.name());
        try {
            return prowlarr.add(template);
        } catch (org.springframework.web.client.RestClientResponseException e) {
            var m = java.util.regex.Pattern.compile("\"errorMessage\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(e.getResponseBodyAsString());
            if (e.getStatusCode().value() == 400 && m.find()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INDEXER_REJECTED",
                    "O Prowlarr recusou o indexador: " + m.group(1).replace("\\u0027", "'").replace("\\u0026", "&"));
            }
            throw e;
        }
    }
}
