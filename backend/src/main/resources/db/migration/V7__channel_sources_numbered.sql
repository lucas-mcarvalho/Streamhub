-- Fontes numeradas (Fonte 1, Fonte 2...) com os gêneros dentro de cada uma.
ALTER TABLE channel_source ADD COLUMN origin VARCHAR(200);
ALTER TABLE channel_source ADD COLUMN position INT NOT NULL DEFAULT 100;

-- listas que passam a ser fontes padrão (inclui instalações novas)
INSERT INTO channel_source (name, url, builtin, origin, position)
SELECT v.name, v.url, TRUE, v.origin, v.position FROM (VALUES
    ('Fonte 2', 'https://iptv-org.github.io/iptv/regions/latam.m3u',  'iptv-org · América Latina', 2),
    ('Fonte 3', 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8', 'Free-TV', 3),
    ('Fonte 4', 'https://iptv-org.github.io/iptv/index.m3u',          'iptv-org · todos os canais', 4)
) AS v(name, url, origin, position)
WHERE NOT EXISTS (SELECT 1 FROM channel_source c WHERE c.url = v.url);

UPDATE channel_source SET name = 'Fonte 1', origin = 'iptv-org · Brasil', position = 1, builtin = TRUE
    WHERE url = 'https://iptv-org.github.io/iptv/countries/br.m3u';
UPDATE channel_source SET name = 'Fonte 2', origin = 'iptv-org · América Latina', position = 2, builtin = TRUE
    WHERE url = 'https://iptv-org.github.io/iptv/regions/latam.m3u';
UPDATE channel_source SET name = 'Fonte 3', origin = 'Free-TV', position = 3, builtin = TRUE
    WHERE url = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';
UPDATE channel_source SET name = 'Fonte 4', origin = 'iptv-org · todos os canais', position = 4, builtin = TRUE
    WHERE url = 'https://iptv-org.github.io/iptv/index.m3u';
UPDATE channel_source SET name = 'Fonte 5', origin = 'Pluto TV', position = 5
    WHERE url LIKE '%/pluto_all.m3u';

-- listas por gênero viram filtros dentro das fontes
DELETE FROM channel_source WHERE url IN (
    'https://iptv-org.github.io/iptv/categories/kids.m3u',
    'https://iptv-org.github.io/iptv/categories/animation.m3u',
    'https://iptv-org.github.io/iptv/categories/sports.m3u',
    'https://iptv-org.github.io/iptv/categories/movies.m3u',
    'https://iptv-org.github.io/iptv/categories/news.m3u',
    'https://iptv-org.github.io/iptv/categories/entertainment.m3u',
    'https://iptv-org.github.io/iptv/languages/por.m3u',
    'https://iptv-org.github.io/iptv/countries/pt.m3u');
