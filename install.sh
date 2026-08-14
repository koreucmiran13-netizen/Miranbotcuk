#!/usr/bin/env bash
# ============================================================
# MiranBot — whatsapp-web.js tabanlı kurulum betiği
# VDS'te tek satır:
#   sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/install.sh)"
# ============================================================
set -e

BOT_DIR="/home/miranbot"
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

echo -e "${GREEN}[MiranBot] Kurulum başlıyor...${NC}"

# --- 1. Sistem bağımlılıkları ---
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null 2>&1
apt-get install -y -qq git curl >/dev/null 2>&1

# Puppeteer için Chromium bağımlılıkları (Ubuntu 20.04)
apt-get install -y -qq \
  ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 \
  libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 \
  libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
  libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \
  libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release \
  wget xdg-utils >/dev/null 2>&1 || true

# --- 2. Node.js 22 ---
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" < v22 ]]; then
  echo "[MiranBot] Node.js kuruluyor..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null 2>&1
fi
echo "[MiranBot] Node.js $(node -v)"

# --- 3. Depo ---
if [ -d "$BOT_DIR/.git" ]; then
  cd "$BOT_DIR"
  git fetch origin main
  git reset --hard origin/main
else
  rm -rf "$BOT_DIR"
  mkdir -p "$BOT_DIR"
  git clone --depth 1 https://github.com/koreucmiran13-netizen/Miranbotcuk.git "$BOT_DIR"
fi
cd "$BOT_DIR"

# Eski .mjs kalıntılarını temizle (servis her zaman server.js çalıştırır)
rm -f "$BOT_DIR"/server.mjs

# --- 4. Bağımlılıklar ---
echo "[MiranBot] Bağımlılıklar kuruluyor..."
npm install --no-audit --no-fund

# --- 5. systemd servisi ---
cat > /etc/systemd/system/miranbot.service <<'EOF'
[Unit]
Description=MiranBot — WhatsApp Bot (whatsapp-web.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/miranbot
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable miranbot >/dev/null 2>&1
systemctl restart miranbot
sleep 3

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}MiranBot kuruldu ve çalışıyor!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Panel: http://$(curl -s ifconfig.me):3000"
echo "Kontrol: systemctl status miranbot"
echo "Log: journalctl -u miranbot -f"
