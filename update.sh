#!/bin/bash
# ============================================================
# MiranBot v3 — Otomatik Güncelleme Betiği
# VDS'te çalıştırın:
#   sudo bash update.sh
# GitHub deposundaki son kodu çeker, paneli yeniden derler ve
# servisi restart eder. Tüm ayarlarınız (bot_config.json, oturumlar)
# korunur.
# ============================================================
set -e
BOTDIR="/home/miranbot"

if [ ! -d "$BOTDIR/.git" ]; then
  echo "[MiranBot] Bu dizin GitHub deposu ile bağlı değil. Önce install.sh ile kurulum yapın."
  exit 1
fi

cd "$BOTDIR"
echo "[MiranBot] Depodan son sürüm çekiliyor..."
git pull origin main || { echo "[MiranBot] Pull başarısız — yerel değişiklik çakışması olabilir."; exit 1; }

echo "[MiranBot] Bağımlılıklar güncelleniyor..."
npm install --omit=dev 2>&1 | tail -1

echo "[MiranBot] Panel yeniden derleniyor..."
npm run build 2>&1 | tail -2

echo "[MiranBot] Servis yeniden başlatılıyor..."
systemctl restart miranbot
sleep 3

if systemctl is-active --quiet miranbot; then
  echo "============================================="
  echo "MiranBot v3 başarıyla güncellendi!"
  echo "Panel:  http://2.56.248.252:3000"
  echo "============================================="
else
  echo "[MiranBot] UYARI: Servis başlatılamadı. 'journalctl -u miranbot -n 20' ile günlüğe bakın."
  exit 1
fi
