#!/usr/bin/env bash
# MiranBot — Teşhis: VDS'teki kodun hangi sürüm olduğunu gösterir
echo "=== Dosyadaki sürüm işareti ==="
grep -n "MiranBot v3" /home/miranbot/bot/commands.ts | head -2
echo ""
echo "=== isKnownCmd (v3.8'e özgü) var mı? ==="
grep -n "isKnownCmd" /home/miranbot/bot/commands.ts | head -3 || echo "YOK — eski kod!"
echo ""
echo "=== /api/version (servis yayındakiler) ==="
curl -s -m 10 http://localhost:3000/api/version
echo ""
echo ""
echo "=== Git durumu ==="
cd /home/miranbot && git status --short | head -5; git log --oneline -1
echo ""
echo "=== Servis durum ==="
systemctl status miranbot --no-pager | head -5
