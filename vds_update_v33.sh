#!/bin/bash
# ============================================================
# MiranBot v3.3 — GitHub'dan doğrudan güncelleme
# VDS'te çalıştırın:
#   sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/vds_update_v32.sh)"
# Zip indirmeye gerek yok — dosyaları doğrudan GitHub main'den çeker.
# Bot config ve oturum dosyalarınız korunur.
# ============================================================
BOTDIR="/home/miranbot"
REPO="koreucmiran13-netizen/Miranbotcuk"
BRANCH="main"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

mkdir -p "$BOTDIR" && cd "$BOTDIR"

DL() {
  local dest="$1"
  local src="$2"
  local tmp
  tmp=$(mktemp)
  if curl -sSL --fail -o "$tmp" "${RAW}/${src}" ; then
    mv "$tmp" "$dest"
    echo "  OK  $src"
  else
    echo "  HATA $src (indirelemedi)"
    rm -f "$tmp"
    return 1
  fi
}

echo "[MiranBot v3.3] Dosyalar GitHub'dan çekiliyor..."
FAIL=0
DL server.ts server.ts   || FAIL=1
DL config.ts config.ts   || FAIL=1
DL users.ts users.ts     || FAIL=1
DL package.json package.json || FAIL=1
mkdir -p bot
DL bot/engine.ts bot/engine.ts || FAIL=1
DL bot/queue.ts bot/queue.ts || FAIL=1
DL bot/commands.ts bot/commands.ts || FAIL=1
DL bot/broadcast.ts bot/broadcast.ts || FAIL=1

if [ "$FAIL" = "1" ]; then
  echo "[MiranBot] Bazı dosyalar indirilemedi, işlem iptal edildi."
  exit 1
fi

echo "[MiranBot v3.3] Bağımlılıklar güncelleniyor..."
npm install --production=false 2>&1 | tail -1

echo "[MiranBot v3.3] Servis yeniden başlatılıyor..."
systemctl restart miranbot
sleep 5

if systemctl is-active --quiet miranbot; then
  echo "============================================="
  echo "MiranBot v3.3 başarıyla kuruldu!"
  echo "Panel:  http://2.56.248.252:3000"
  echo "Tarayıcıda Ctrl+Shift+R ile tam yenile."
  echo "============================================="
else
  echo "[MiranBot] UYARI: Servis başlatılamadı."
  journalctl -u miranbot -n 20 --no-pager
  exit 1
fi
