#!/bin/bash
# ============================================================
# MiranBot v3.1 — Manuel Güncelleme (panel + sunucu)
# VDS'te çalıştırın:
#   sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/vds_fix.sh)"
# veya zip ile:
#   sudo bash vds_fix.sh https://files.manuscdn.com/user_upload_by_module/session_file/310519663679430184/MLVrkVSnzsXlJlpL.zip
# ============================================================
set -e
BOTDIR="/home/miranbot"
ZIPURL="${1:-}"

if [ -z "$ZIPURL" ]; then
  ZIPURL="https://files.manuscdn.com/user_upload_by_module/session_file/310519663679430184/EYJCgQiejnvvPTvv.zip"
fi

if [ ! -d "$BOTDIR" ]; then mkdir -p "$BOTDIR"; fi
cd "$BOTDIR"

# Eski sunucu ve panel dosyalarını yedekle
mkdir -p /tmp/miranbot_backup_$(date +%s) 2>/dev/null || true
[ -f server.ts ] && cp server.ts /tmp/ 2>/dev/null || true

echo "[MiranBot] Yeni sürüm paketi indiriliyor..."
curl -sSL "$ZIPURL" -o /tmp/v31.zip

echo "[MiranBot] Paketten çıkartılıyor (oturum ve config koruyoruz)..."
cp -r sessions bot_config.json 2>/dev/null; rm -rf sessions bot_config.json 2>/dev/null || true
unzip -oq /tmp/v31.zip
mv /tmp/sessions /tmp/bot_config.json 2>/dev/null || true
# çıkartılan yeni dosyalarla birlikte eski config/oturumu geri koy
mv -f /tmp/sessions sessions 2>/dev/null || true
mv -f /tmp/bot_config.json bot_config.json 2>/dev/null || true
rm -f /tmp/v31.zip

echo "[MiranBot] Bağımlılıklar kuruluyor..."
npm install --production=false 2>&1 | tail -1

echo "[MiranBot] Servis yeniden başlatılıyor..."
systemctl restart miranbot
sleep 4

if systemctl is-active --quiet miranbot; then
  echo "============================================="
  echo "MiranBot v3.1 başarıyla kuruldu!"
  echo "Panel:  http://2.56.248.252:3000"
  echo "Tarayıcıda Ctrl+Shift+R ile tam yenile."
  echo "============================================="
else
  echo "[MiranBot] UYARI: Servis başlatılamadı."
  journalctl -u miranbot -n 15 --no-pager
  exit 1
fi
