CREATE TABLE overview_translation (
    item_ref VARCHAR(100) PRIMARY KEY,
    text     TEXT NOT NULL,
    source   VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
