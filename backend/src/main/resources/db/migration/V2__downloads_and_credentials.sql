ALTER TABLE integration_setting ADD COLUMN username VARCHAR(255);

CREATE TABLE download (
    id               BIGSERIAL PRIMARY KEY,
    title            VARCHAR(512) NOT NULL,
    kind             VARCHAR(20) NOT NULL,
    catalog_ref      VARCHAR(100),
    indexer          VARCHAR(100),
    source_url       TEXT NOT NULL,
    tag              VARCHAR(40) NOT NULL,
    hash             VARCHAR(64),
    location_id      BIGINT REFERENCES storage_location(id) ON DELETE SET NULL,
    relative_path    VARCHAR(1024) NOT NULL DEFAULT '',
    save_path        VARCHAR(2048) NOT NULL,
    content_path     VARCHAR(2048),
    size_bytes       BIGINT NOT NULL DEFAULT 0,
    downloaded_bytes BIGINT NOT NULL DEFAULT 0,
    progress         DOUBLE PRECISION NOT NULL DEFAULT 0,
    dl_speed         BIGINT NOT NULL DEFAULT 0,
    up_speed         BIGINT NOT NULL DEFAULT 0,
    eta_seconds      BIGINT,
    status           VARCHAR(20) NOT NULL,
    error_message    TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT now(),
    completed_at     TIMESTAMP
);
