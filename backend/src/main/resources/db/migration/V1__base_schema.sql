CREATE TABLE storage_location (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    root_path     VARCHAR(1024) NOT NULL,
    kind          VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE integration_setting (
    id            BIGSERIAL PRIMARY KEY,
    service       VARCHAR(40) NOT NULL UNIQUE,
    base_url      VARCHAR(512),
    api_key_enc   TEXT,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at    TIMESTAMP NOT NULL DEFAULT now()
);
