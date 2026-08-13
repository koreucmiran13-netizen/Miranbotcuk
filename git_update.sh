#!/usr/bin/env bash
# ============================================================
# MiranBot — Git tabanlı kurulum & güncelleme betiği (v3.7+)
#
# Dosyalar tam Git protokolüyle gelir; CDN/proxy önbelleği
# hiçbiri zaman arada kalamaz. Her güncellemede commit SHA
# doğrulanır, böylece eski kodun çalışması imkansızdır.
#
# KULLANIM (VDS'te tek satır):
#   sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/git_update.sh)"
#
# İlk çalıştırmada depo klonlanır, bağımlılıklar kurulur,
# panel derlenir ve systemd servisi ayağa kalkar.
# Sonraki çalıştırmalarda git pull ile sadece değişen
# dosyalar yenilenir.
# ============================================================
set -u
export DEBIAN_FRONTEND=noninteractive
REPO="https://github.com/koreucmiran13-netizen/Miranbotcuk.git"
API="https://api.github.com/repos/koreucmiran13-netizen/Miranbotcuk"
BOT_DIR="/home/miranbot"
GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${GREEN}[MiranBot] Kurulum/Güncelleme başlıyor (Git protokolü)...${NC}"

# --- 1. VDS tarafında GÜNCEL commit SHA'yı al (API, cache-control kısa) ---
MAIN_SHA=$(curl -sSL -m 20 -H "Accept: application/vnd.github+json" "${API}/commits/main" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])")
if [ -z "$MAIN_SHA" ]; then
  echo -e "${RED}[MiranBot] GitHub'a erişilemedi. Çıkılıyor.${NC}"
  exit 1
fi
echo "[MiranBot] Güncel commit: ${MAIN_SHA}"

# --- 2. Sistem bağımlılıkları ---
if ! command -v git >/dev/null 2>&1; then
  echo "[MiranBot] Git kurulumu..."
  apt-get update -qq && apt-get install -y -qq git curl >/dev/null 2>&1
fi

# --- 3. Deponun olması: klon veya pull ---
mkdir -p "$BOT_DIR"
if [ -d "$BOT_DIR/.git" ]; then
  echo "[MiranBot] Mevcut depo bulundu, güncelleniyor..."
  cd "$BOT_DIR"
  git fetch origin main --depth 1
  git reset --hard origin/main
else
  echo "[MiranBot] Depo klonlanıyor..."
  git clone "$REPO" "$BOT_DIR" 2>/dev/null || {
    # klon klasör zaten varsa temizle ve yeniden klonla
    rm -rf "$BOT_DIR"
    git clone "$REPO" "$BOT_DIR"
  }
  cd "$BOT_DIR"
fi

# --- 4. Doğrulama: yerel kod güncel commit mi? ---
LOCAL_SHA=$(git rev-parse HEAD)
if [ "$LOCAL_SHA" != "$MAIN_SHA" ]; then
  echo -e "${RED}[MiranBot] HATA: Yerel commit $LOCAL_SHA, beklenen $MAIN_SHA${NC}"
  exit 1
fi
echo "[MiranBot] Kod doğrulandı: commit $LOCAL_SHA"

# --- 5. Node.js kontrolü ---
if ! command -v node >/dev/null 2>&1; then
  echo "[MiranBot] Node.js kurulumu..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null 2>&1
fi
echo "[MiranBot] Node.js $(node -v)"

# --- 6. Bağımlılıklar + panel ---
echo "[MiranBot] Bağımlılıklar kuruluyor..."
npm install --no-audit --no-fund
echo "[MiranBot] Panel derleniyor..."
npm run build >/dev/null 2>&1 || npm run build

# --- 7. Ortam dosyaları (ilk kurulumda örnekler; var olanları koru) ---
for f in bot_config.json users.json; do
  if [ ! -f "$BOT_DIR/$f" ] && [ -f "$BOT_DIR/${f}.example" ]; then
    cp "$BOT_DIR/${f}.example" "$BOT_DIR/$f"
  fi
done

# --- 8. systemd servisi ---
cat > /etc/systemd/system/miranbot.service <<EOF
[Unit]
Description=MiranBot — WhatsApp Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${BOT_DIR}
Environment=NODE_ENV=production
ExecStart=/usr/bin/npx tsx server.ts
Restart=always
RestartSec=8
SyslogIdentifier=miranbot

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable miranbot >/dev/null 2>&1
systemctl restart miranbot
sleep 6

# --- 9. Sonuç ---
if systemctl is-active --quiet miranbot; then
  echo -e "${GREEN}=============================================${NC}"
  echo -e "${GREEN}MiranBot kuruldu/güncellendi!${NC}"
  echo -e "${GREEN}=============================================${NC}"
  echo "Commit: $LOCAL_SHA"
  echo "Sürüm bilgisi:"
  curl -s -m 10 http://localhost:3000/api/version
  echo ""
else
  echo -e "${RED}[MiranBot] Servis başlatılamadı!${NC}"
  journalctl -u miranbot -n 30 --no-pager
  exit 1
fi
