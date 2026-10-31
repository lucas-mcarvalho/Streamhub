# StreamHub

Pesquisa, baixa, organiza e reproduz filmes, séries e animes. Spring Boot 4 (Java 21) + React/TypeScript + PostgreSQL,
integrado a TMDB, AniList, Prowlarr, Sonarr, Radarr, qBittorrent e Jellyfin. Use somente conteúdo que você tem autorização para obter.

## Executar

```bash
cp .env.example .env      # ajuste TMDB_API_KEY, MEDIA_ROOT, PUID/PGID e senhas
mkdir -p media data       # (Linux) pastas devem pertencer ao seu usuário
docker compose up -d --build
```

| Serviço     | URL                    | Observação |
|-------------|------------------------|------------|
| StreamHub   | http://localhost:5173  | login `APP_ADMIN_USER` / `APP_ADMIN_PASSWORD` |
| API         | http://localhost:8080  | |
| Prowlarr    | http://localhost:9696  | adicione indexadores (ou pela página Configurações) |
| Sonarr      | http://localhost:8989  | |
| Radarr      | http://localhost:7878  | |
| qBittorrent | http://localhost:8081  | `admin` / `adminadmin` (pré-configurado) |
| Jellyfin    | http://localhost:8096  | requer o assistente inicial; gere uma chave de API e informe em Configurações |

Chaves de API do Prowlarr/Sonarr/Radarr são lidas automaticamente do `config.xml` (volume `DATA_ROOT` montado em `/integrations`).
A chave do TMDB é necessária para filmes e séries (animes usam o AniList, sem chave).

## Armazenamento e Docker

Todos os contêineres montam `MEDIA_ROOT` em **`/media`**, então o caminho enviado ao qBittorrent é igual ao visto pelo backend,
Sonarr, Radarr e Jellyfin. O backend só aceita pastas dentro de `STORAGE_ALLOWED_ROOTS` (padrão `/media`); os destinos são
guardados como *local registrado + caminho relativo*, com proteção contra path traversal e symlinks.
Para usar outro HD, monte-o em todos os serviços (ex.: `/mnt/HD1:/hd1`), inclua `/hd1` em `STORAGE_ALLOWED_ROOTS`
e registre a pasta em **Armazenamento**. Se o qBittorrent enxergar o caminho com outro prefixo, use `QBIT_PATH_MAP=/prefixo_backend=/prefixo_qbit`.
Em Windows, aponte `MEDIA_ROOT` para ex. `D:/Midia`; discos adicionais entram como volumes extras.

## Fluxo

1. Catálogo (TMDB/AniList) → página do título → **Buscar downloads** (Prowlarr).
2. **Baixar** → escolha local/subpasta (bloqueia se faltar espaço) → o backend envia ao qBittorrent com `savepath`.
3. **Downloads** mostra progresso em tempo real (SSE). Ao concluir, o Jellyfin é atualizado e, se `ARR_IMPORT_ON_COMPLETE=true`,
   o Sonarr/Radarr importam **copiando** o arquivo (o original no destino escolhido é preservado).
4. **Filmes/Séries/Animes** listam os arquivos das pastas registradas do tipo correspondente; o player reproduz com Range e retoma de onde parou.

## Limitações conhecidas

- O idioma exibido nos resultados é inferido do nome do release. As faixas reais são lidas com ffprobe no player ("Verificar faixas").
- O player do navegador toca MP4/WebM e MKV com codecs compatíveis; para outros formatos use o Jellyfin (link em "Continuar assistindo").
- "Continuar assistindo" do Jellyfin usa o primeiro usuário do servidor.
- Autenticação: um único administrador (HTTP Basic) definido por variáveis de ambiente.

## Desenvolvimento

```bash
cd backend && ./mvnw test          # testes unitários
cd frontend && npm install && npm run dev
```
