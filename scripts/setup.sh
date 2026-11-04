#!/usr/bin/env bash
# Prepara o computador e sobe o StreamHub (Linux ou WSL). Pode ser executado de novo a qualquer momento.
# Uso: ./scripts/setup.sh [pasta-do-hd-externo]
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n== %s\n' "$*"; }
envget() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
envset() { if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
is_wsl() { grep -qi microsoft /proc/version; }
# disco com pastas de mídia (Animes, Series, Filmes...) até dois níveis abaixo
has_media() {
  find "$1" -mindepth 1 -maxdepth 2 -type d \( -iname animes -o -iname anime -o -iname series -o -iname 'séries' \
    -o -iname filmes -o -iname movies \) -print -quit 2>/dev/null | grep -q .
}

say ".env"
if [ ! -f .env ]; then
  cp .env.example .env
  envset APP_SECRET "$(head -c 32 /dev/urandom | base64 | tr -d '/+=')"
  echo "criado a partir do .env.example (APP_SECRET gerado)"
fi
envset PUID "$(id -u)"
envset PGID "$(id -g)"

say "HD externo"
extra="${1:-}"
if [ -z "$extra" ] && [ "$(envget EXTRA_STORAGE)" = "./media" ]; then
  cands=()
  for d in /mnt/[d-z] /run/media/"$USER"/* /media/"$USER"/*; do
    [ -d "$d" ] && has_media "$d" && cands+=("$d")
  done
  if [ ${#cands[@]} -eq 1 ]; then
    extra=${cands[0]}
  elif [ ${#cands[@]} -gt 1 ]; then
    echo "vários discos com mídia (${cands[*]}); escolha um: $0 <pasta>"
  fi
fi
if [ -n "$extra" ]; then
  [ -d "$extra" ] || { echo "pasta não encontrada: $extra"; exit 1; }
  envset EXTRA_STORAGE "$extra"
fi
echo "EXTRA_STORAGE=$(envget EXTRA_STORAGE)  (aparece como /hd1 nos contêineres)"

say "pastas"
data=$(envget DATA_ROOT); data=${data:-./data}
media=$(envget MEDIA_ROOT); media=${media:-./media}
disks=$(envget DISKS_DIR); disks=${disks:-./disks}
# criadas antes do Docker, senão ele as cria como root e o Jellyfin não consegue gravar
mkdir -p "$media" "$disks" "$data"/{prowlarr,sonarr,radarr,qbittorrent/qBittorrent,jellyfin/config,jellyfin/cache} 2>/dev/null \
  || sudo mkdir -p "$media" "$disks" "$data"/{prowlarr,sonarr,radarr,qbittorrent/qBittorrent,jellyfin/config,jellyfin/cache}
if [ -n "$(find "$data" ! -user "$(id -u)" -print -quit)" ]; then sudo chown -R "$(id -u):$(id -g)" "$data"; fi
for d in "$media" "$disks"; do [ -O "$d" ] || sudo chown "$(id -u):$(id -g)" "$d"; done
echo "ok"

say "montagem compartilhada (discos conectados depois aparecem em /disks)"
if [ "$(findmnt -no PROPAGATION /)" != shared ]; then sudo mount --make-rshared /; fi
if is_wsl && ! grep -q 'make-rshared' /etc/wsl.conf 2>/dev/null; then
  if grep -qE '^command=' /etc/wsl.conf 2>/dev/null; then
    echo "AVISO: /etc/wsl.conf já tem um command= em [boot]; acrescente 'mount --make-rshared /' a ele"
  elif grep -q '^\[boot\]' /etc/wsl.conf 2>/dev/null; then
    sudo sed -i '/^\[boot\]/a command="mount --make-rshared /"' /etc/wsl.conf
  else
    printf '\n[boot]\ncommand="mount --make-rshared /"\n' | sudo tee -a /etc/wsl.conf >/dev/null
  fi
fi
echo "/ = $(findmnt -no PROPAGATION /)"

say "qBittorrent"
conf="$data/qbittorrent/qBittorrent/qBittorrent.conf"
if ! grep -q '^Password_PBKDF2=' "$conf" 2>/dev/null || ! grep -q '^HostHeaderValidation=false' "$conf"; then
  # Sem senha salva, o qBittorrent gera uma temporária a cada início e o backend não consegue entrar.
  # A validação de Host recusa o acesso pela porta 8081 do compose (por dentro ele escuta na 8080).
  docker compose stop qbittorrent >/dev/null 2>&1 || true
  python3 - "$conf" "$(envget QBIT_USER)" "$(envget QBIT_PASSWORD)" <<'PY'
import base64, hashlib, os, re, sys
path, user, password = sys.argv[1], sys.argv[2] or "admin", sys.argv[3] or "adminadmin"
text = open(path).read() if os.path.exists(path) else (
    "[LegalNotice]\nAccepted=true\n\n[BitTorrent]\nSession\\MaxConnections=2000\n"
    "Session\\MaxConnectionsPerTorrent=300\nSession\\Port=6881\n")
def put(text, section, lines):
    if re.search(r"(?m)^\[%s\]$" % section, text):
        return re.sub(r"(?m)^\[%s\]\n" % section, lambda m: m.group(0) + lines, text, count=1)
    return text.rstrip("\n") + "\n\n[%s]\n" % section + lines
# qBittorrent 5.x lê a seção [WebUI]; versões anteriores, WebUI\... em [Preferences]
def setting(text, key, value):
    text = re.sub(r"(?m)^(WebUI\\)?%s=.*\n?" % key, "", text)
    text = put(text, "WebUI", "%s=%s\n" % (key, value))
    return put(text, "Preferences", "WebUI\\%s=%s\n" % (key, value))
if not re.search(r"(?m)^Password_PBKDF2=", text):   # senha trocada depois pelo WebUI é mantida
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha512", password.encode(), salt, 100000)
    text = setting(text, "Username", user)
    text = setting(text, "Password_PBKDF2", '"@ByteArray(%s:%s)"' % (base64.b64encode(salt).decode(), base64.b64encode(digest).decode()))
    print("login do WebUI definido com QBIT_USER/QBIT_PASSWORD do .env")
text = setting(text, "HostHeaderValidation", "false")
open(path, "w").write(text)
PY
else
  echo "já configurado"
fi

say "subindo os contêineres"
docker compose up -d --build

say "pronto"
port=5173
if is_wsl; then
  mode=$(wslinfo --networking-mode 2>/dev/null || echo nat)
  if [ "$mode" != mirrored ]; then
    echo "Para abrir no celular, rode uma vez no Windows (PowerShell como administrador):"
    echo "  powershell -ExecutionPolicy Bypass -File \"$(wslpath -w "$PWD/scripts/setup-windows.ps1")\""
  fi
fi
for ip in $(hostname -I 2>/dev/null); do
  case $ip in 172.1[6-9].*|172.2[0-9].*|172.3[01].*|10.255.*) ;; *.*.*.*) echo "No celular (mesma rede): http://$ip:$port";; esac
done
echo "Neste computador: http://localhost:$port"
