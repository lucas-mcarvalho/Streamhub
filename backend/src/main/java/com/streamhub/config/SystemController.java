package com.streamhub.config;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SystemController {

    @GetMapping("/api/system/status")
    public Map<String, Object> status() {
        return Map.of("app", "streamhub", "status", "UP", "javaVersion", System.getProperty("java.version"));
    }
}
