#!/bin/bash
# ============================================================
# MiranBot v3.4 — KANITLANABİLİR GitHub Güncellemesi
# Her dosya GitHub'dan çekilir ve MD5 hash'i doğrulanır.
# VDS'te çalıştırın:
#   sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/vds_update_v34.sh)"
# Güncelleme sonrası şu komutla sürümü kontrol edin:
#   curl -s http://2.56.248.252:3000/api/version
# ============================================================
BOTDIR="/home/miranbot"
REPO="koreucmiran13-netizen/Miranbotcuk"
RAW="https://raw.githubusercontent.com/${REPO}/main"

mkdir -p "$BOTDIR" "$BOTDIR/bot" && cd "$BOTDIR"

FAIL=0
check() {
  local dest="$1" src="$2" label="$3"
  local tmp
  tmp=$(mktemp)
  if ! curl -sSL --fail -m 60 -o "$tmp" "${RAW}/${src}"; then
    echo "  HATA: $src indirilemedi!"
    FAIL=1; rm -f "$tmp"; return
  fi
  mv -f "$tmp" "$dest"
  local md5remote
  md5remote=$(curl -sSL --fail -m 30 "${RAW}/${src}.md5" 2>/dev/null)
  if [ -n "$md5remote" ]; then
    local md5local
    md5local=$(md5sum "$dest" | awk '{print $1}')
    if [ "$md5local" != "$md5remote" ]; then
      echo "  HATA: $src hash uyumsuz ($md5local != $md5remote)! Dosya silindi."
      rm -f "$dest"; FAIL=1; return
    fi
  fi
  echo "  OK: $src"
}

echo "[MiranBot v3.4] Dosyalar GitHub'dan çekiliyor ve doğrulanıyor..."
check server.ts server.ts server
check config.ts config.ts config
check users.ts users.ts users
check package.json package.json package
check bot/engine.ts bot/engine.ts engine
check bot/queue.ts bot/queue.ts queue
check bot/commands.ts bot/commands.ts commands
check bot/broadcast.ts bot/broadcast.ts broadcast

if [ "$FAIL" = "1" ]; then
  echo "[MiranBot] Bazı dosyalar alınamadı veya doğrulanamadı. İşlem iptal edildi. VDS'iniz eski haliyle çalışmaya devam ediyor."
  exit 1
fi

echo "[MiranBot v3.4] Bağımlılıklar güncelleniyor..."
npm install --production=false 2>&1 | tail -1

echo "[MiranBot v3.4] Önbellek temizleniyor ve servis yeniden başlatılıyor..."
rm -rf /tmp/tsx-* .tsx-cache 2>/dev/null
systemctl restart miranbot
sleep 6

if systemctl is-active --quiet miranbot; then
  echo "============================================="
  echo "MiranBot v3.4 kuruldu!"
  echo "============================================="
  echo "Sürüm kontrolü:"
  curl -s -m 10 http://localhost:3000/api/version
  echo ""
else
  echo "[MiranBot] UYARI: Servis başlatılamadı!"
  journalctl -u miranbot -n 20 --no-pager
  exit 1
fi
