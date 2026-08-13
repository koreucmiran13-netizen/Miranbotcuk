#!/usr/bin/env bash
# ============================================================
# MiranBot v3.7 — Önbellek-proof güncelleme betiği
# GitHub raw CDN önbelleğini atlamak için dosyalar
# GitHub Git Blobs API üzerinden çekilir ve blob SHA ile
# doğrulanır. (raw.githubusercontent.com'a hiç düşmez)
#
# Kullanım:
#   sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/vds_update_v37.sh)"
# ============================================================
set -u
REPO="koreucmiran13-netizen/Miranbotcuk"
BASE="https://api.github.com/repos/${REPO}"
cd /home/miranbot || { echo "HATA: /home/miranbot yok. Kurulum yapılmamış."; exit 1; }

if ! command -v python3 >/dev/null 2>&1; then
  echo "HATA: python3 bulunamadı."
  exit 1
fi

pull() { # path
  local p="$1"
  local tmp="/tmp/miranbot_pull_$(date +%s)"
  local sha blob raw
  # dosyanın güncel blob SHA'sını al (API cache-control: max-age=60, ama tree SHA'sı commit'e bağlı)
  sha=$(curl -sSL -m 30 "${BASE}/git/trees/main?recursive=1" | python3 -c "
import json,sys
t=json.load(sys.stdin)
for f in t['tree']:
    if f['path']=='${p}':
        print(f['sha']); break
")
  if [ -z "$sha" ]; then echo "  HATA: $p ağaçta yok."; return 1; fi
  raw=$(curl -sSL -m 60 -H "Accept: application/vnd.github.raw+json" "${BASE}/git/blobs/${sha}")
  if [ -z "$raw" ]; then echo "  HATA: $p indirilemedi."; return 1; fi
  printf '%s' "$raw" > "$tmp"
  mv -f "$tmp" "/home/miranbot/${p}"
  echo "  OK: $p (blob $sha)"
}

echo "[MiranBot v3.7] Dosyalar Git Blobs API'den çekiliyor (CDN önbelleği atlanır)..."
FAIL=0
for f in server.ts config.ts users.ts package.json bot/engine.ts bot/queue.ts bot/commands.ts bot/broadcast.ts; do
  pull "$f" || FAIL=1
done

if [ "$FAIL" = "1" ]; then
  echo "[MiranBot] Bazı dosyalar alınamadı. İşlem iptal edildi."
  exit 1
fi

echo "[MiranBot v3.7] Panel yeniden derleniyor..."
npm run build 2>&1 | tail -2
echo "[MiranBot v3.7] Önbellek temizleniyor ve servis yeniden başlatılıyor..."
rm -rf /tmp/tsx-* .tsx-cache 2>/dev/null
cp -r dist /home/miranbot/ 2>/dev/null
systemctl restart miranbot
sleep 6
if systemctl is-active --quiet miranbot; then
  echo "============================================="
  echo "MiranBot v3.7 kuruldu!"
  echo "============================================="
  echo "Sürüm kontrolü:"
  curl -s -m 10 http://localhost:3000/api/version
  echo ""
else
  echo "[MiranBot] UYARI: Servis başlatılamadı!"
  journalctl -u miranbot -n 20 --no-pager
  exit 1
fi
