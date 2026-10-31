CREATE TABLE channel_source (
    id       BIGSERIAL PRIMARY KEY,
    name     VARCHAR(100) NOT NULL,
    url      TEXT NOT NULL,
    builtin  BOOLEAN NOT NULL DEFAULT FALSE
);

-- Listas públicas do projeto iptv-org (canais abertos); servem para teste.
INSERT INTO channel_source (name, url, builtin) VALUES
    ('Brasil',     'https://iptv-org.github.io/iptv/countries/br.m3u', TRUE),
    ('Português',  'https://iptv-org.github.io/iptv/languages/por.m3u', TRUE),
    ('Infantil',   'https://iptv-org.github.io/iptv/categories/kids.m3u', TRUE),
    ('Animação',   'https://iptv-org.github.io/iptv/categories/animation.m3u', TRUE),
    ('Esportes',   'https://iptv-org.github.io/iptv/categories/sports.m3u', TRUE),
    ('Filmes',     'https://iptv-org.github.io/iptv/categories/movies.m3u', TRUE),
    ('Notícias',   'https://iptv-org.github.io/iptv/categories/news.m3u', TRUE);
