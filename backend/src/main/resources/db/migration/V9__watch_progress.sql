-- Progresso de reprodução guardado no servidor: vale em qualquer aparelho ou navegador.
CREATE TABLE watch_progress (
    file_id          TEXT PRIMARY KEY,
    position_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
    duration_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
    done             BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at       TIMESTAMPTZ NOT NULL
);
