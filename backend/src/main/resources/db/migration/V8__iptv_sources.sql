-- Listas IPTV (filmes, séries e canais) ficam separadas das listas da TV ao vivo.
ALTER TABLE channel_source ADD COLUMN section VARCHAR(10) NOT NULL DEFAULT 'TV';
