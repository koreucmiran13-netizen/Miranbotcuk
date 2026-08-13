#!/bin/bash
# ============================================================
# MiranBot v3.5 — KANITLANABİLİR GitHub Güncellemesi
# VDS'te çalıştırın:
#   sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/vds_update_v35.sh)"
# Doğrulama komutu:
#   curl -s http://2.56.248.252:3000/api/version
# Beklenen: hash=6f3b8c9d2a1e, gate/yardim/otogonder=true
# ============================================================
BOTDIR="/home/miranbot"
REPO="koreucmiran13-netizen/Miranbotcuk"
RAW="https://raw.githubusercontent.com/${REPO}/main"
EXPECTED_HASH="6f3b8c9d2a1e"

mkdir -p "$BOTDIR" "$BOTDIR/bot" && cd "$BOTDIR"

FAIL=0
check() {
  local dest="$1" src="$2"
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
      echo "  HATA: $src hash uyumsuz! Dosya silindi."
      rm -f "$dest"; FAIL=1; return
    fi
  fi
  echo "  OK: $src"
}

echo "[MiranBot v3.5] Dosyalar GitHub'dan çekiliyor ve doğrulanıyor..."
check server.ts server.ts
check config.ts config.ts
check users.ts users.ts
check package.json package.json
check bot/engine.ts bot/engine.ts
check bot/queue.ts bot/queue.ts
check bot/commands.ts bot/commands.ts
check bot/broadcast.ts bot/broadcast.ts

if [ "$FAIL" = "1" ]; then
  echo "[MiranBot] Bazı dosyalar alınamadı veya doğrulanamadı. İşlem iptal edildi."
  exit 1
fi

echo "[MiranBot v3.5] Bağımlılıklar güncelleniyor..."
npm install --production=false 2>&1 | tail -1

echo "[MiranBot v3.5] Önbellek temizleniyor ve servis yeniden başlatılıyor..."
rm -rf /tmp/tsx-* .tsx-cache 2>/dev/null
systemctl restart miranbot
sleep 6

if systemctl is-active --quiet miranbot; then
  echo "============================================="
  echo "MiranBot v3.5 kuruldu!"
  echo "============================================="
  echo "Sürüm kontrolü:"
  curl -s -m 10 http://localhost:3000/api/version
  echo ""
else
  echo "[MiranBot] UYARI: Servis başlatılamadı!"
  journalctl -u miranbot -n 20 --no-pager
  exit 1
fi
