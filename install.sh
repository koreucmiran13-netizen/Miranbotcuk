#!/bin/bash
# MiranBot v2.0 Kurulum Betiği
# VDS'e tam kurulum yapar: bağımlılıklar, Chrome, systemd servisi

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MiranBot v2.0 — Kurulum Başlıyor..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

INSTALL_DIR="/home/miranbot"
SERVICE_FILE="/etc/systemd/system/miranbot.service"

# 1. Dizine geç
cd "$INSTALL_DIR"

# 2. Eski session kalıntılarını temizle (gerekirse)
if [ -d "$INSTALL_DIR/.wwebjs_cache" ]; then
  echo "[1/5] Eski Chrome cache temizleniyor..."
  rm -rf "$INSTALL_DIR/.wwebjs_cache"
else
  echo "[1/5] Cache temiz — devam"
fi

# 3. Sistem bağımlılıkları
echo "[2/5] Sistem bağımlılıkları kontrol ediliyor..."
apt-get update -qq && apt-get install -y -qq \
  gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
  libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
  libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation \
  libappindicator1 libnss3 lsb-release xdg-utils wget 2>/dev/null || true

# 4. Node.js 18+ kontrolü
echo "[3/5] Node.js sürümü: $(node -v)"
if [ -z "$(command -v node)" ]; then
  echo "Node.js bulunamadı, kurulum gerekli."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# 5. npm install
echo "[4/5] npm bağımlılıkları kuruluyor..."
npm install --production

# 6. systemd servisi oluştur
echo "[5/5] Sistem servisi oluşturuluyor..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=MiranBot - WhatsApp Bot (v2.0)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable miranbot
systemctl restart miranbot

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ MiranBot v2.0 Kurulum Tamamlandı!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Panel: http://$(hostname -I | awk '{print $1}'):3000"
echo "  veya:  http://2.56.248.252:3000"
echo ""
echo "  Servis komutları:"
echo "    systemctl status miranbot"
echo "    systemctl restart miranbot"
echo "    journalctl -u miranbot -f"
echo ""
