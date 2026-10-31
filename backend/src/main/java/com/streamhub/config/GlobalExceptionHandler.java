package com.streamhub.config;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, String>> api(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("code", e.code(), "message", e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
            .map(f -> f.getField() + ": " + f.getDefaultMessage()).reduce((a, b) -> a + "; " + b).orElse("Requisição inválida");
        return ResponseEntity.badRequest().body(Map.of("code", "VALIDATION", "message", msg));
    }

    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> unreadable(org.springframework.http.converter.HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest().body(Map.of("code", "VALIDATION", "message", "Corpo da requisição inválido"));
    }

    @ExceptionHandler(RestClientResponseException.class)
    ResponseEntity<Map<String, String>> upstream(RestClientResponseException e) {
        log.warn("Serviço externo respondeu {}: {}", e.getStatusCode(), e.getResponseBodyAsString());
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("code", "UPSTREAM_ERROR",
            "message", "Serviço externo respondeu " + e.getStatusCode().value()));
    }

    @ExceptionHandler(ResourceAccessException.class)
    ResponseEntity<Map<String, String>> unreachable(ResourceAccessException e) {
        log.warn("Serviço externo indisponível: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("code", "UPSTREAM_UNAVAILABLE",
            "message", "Serviço externo indisponível: " + e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> other(Exception e) {
        log.error("Erro inesperado", e);
        return ResponseEntity.internalServerError().body(Map.of("code", "INTERNAL", "message", "Erro interno"));
    }
}
