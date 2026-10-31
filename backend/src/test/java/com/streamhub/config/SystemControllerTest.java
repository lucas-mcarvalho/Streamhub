package com.streamhub.config;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SystemControllerTest {

    @Test
    void statusReportsUp() {
        assertEquals("UP", new SystemController().status().get("status"));
    }
}
