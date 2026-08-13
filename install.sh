#!/bin/bash
# ============================================================
# MiranBot v3 — Tek satırda VDS kurulum betiği
# Kullanım: sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/install.sh)"
# ============================================================
set -e

export DEBIAN_FRONTEND=noninteractive

# Renkli çıktı yardımcısı
GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
echo -e "${GREEN}[MiranBot v3] Kurulum başlıyor...${NC}"

# --- 1. Sistem bağımlılıkları ---
apt-get update -qq
apt-get install -y -qq git curl build-essential >/dev/null 2>&1 || apt-get install -y -qq git curl build-essential

# --- 2. Node.js 20 (LTS) kurulumu ---
if ! command -v node >/dev/null 2>&1 || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  echo "[MiranBot v3] Node.js kurulumu..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null 2>&1
fi
echo "[MiranBot v3] Node.js $(node -v) kurulu."

# --- 3. Bot kaynak kodu ---
BOT_DIR="/home/miranbot"
if [ -d "$BOT_DIR/.git" ]; then
  echo "[MiranBot v3] Mevcut kurulum bulundu, kod güncelleniyor..."
  cd "$BOT_DIR" && git pull --ff-only
else
  mkdir -p "$BOT_DIR"
  cd "$BOT_DIR"
  git clone https://github.com/koreucmiran13-netizen/Miranbotcuk.git .
fi

# --- 4. Bağımlılıklar ve panel build ---
npm install --production=false
npm run build

# --- 5. Panel login bilgileri ---
echo ""
read -p "[MiranBot v3] Panel kullanıcı adı (boş bırakırsanız: Miran47): " AUSER
read -sp "[MiranBot v3] Panel şifresi (boş bırakırsanız: Miran47): " APASS
echo ""
AUSER=${AUSER:-Miran47}
APASS=${APASS:-Miran47}

# --- 6. systemd servisi (7/24, otomatik yeniden başlatma) ---
cat > /etc/systemd/system/miranbot.service <<EOF
[Unit]
Description=MiranBot v3 — WhatsApp Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$BOT_DIR
Environment=NODE_ENV=production
Environment=ADMIN_USER=$AUSER
Environment=ADMIN_PASS=$APASS
ExecStart=/usr/bin/npx tsx server.ts
Restart=always
RestartSec=8
SyslogIdentifier=miranbot

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable miranbot
systemctl restart miranbot
sleep 3

# --- 7. Sonuç ---
if systemctl is-active --quiet miranbot; then
  IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
  echo ""
  echo -e "${GREEN}=============================================${NC}"
  echo -e "${GREEN}MiranBot v3 başarıyla kuruldu!${NC}"
  echo -e "${GREEN}=============================================${NC}"
  echo "Panel:   http://$IP:3000"
  echo "Kullanıcı: $AUSER"
  echo "Şifre:     $APASS"
  echo ""
  echo "Komutlar:"
  echo "  Servis durumu : systemctl status miranbot"
  echo "  Günlükler     : journalctl -u miranbot -f"
  echo "  Yeniden başlat: systemctl restart miranbot"
  echo ""
  echo -e "${RED}NOT: VDS kontrol panelinizde 3000 portunun açık olduğundan emin olun.${NC}"
else
  echo -e "${RED}[MiranBot v3] Servis başlatılamadı. Günlükleri kontrol edin:${NC}"
  echo "  journalctl -u miranbot -n 50 --no-pager"
fi
