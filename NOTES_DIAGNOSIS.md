# Teşhis Notları — !otogönder hiç cevap vermiyor

## Bulgu 1: /api/version endpointi YALAN söyleyebilir
server.ts satır 74-85: hash'i `bot/commands.ts` dosyasından okuyor,
ama `code: 'miranbot-v3.4'` sabit string. Kullanıcı panelde v3.4 gördü
daha önce — bu da panel/endpoint'in eski koddan çalıştığını göstermişti.

## Bulgu 2 (MUHTEMEL KÖK NEDEN): botConfig null ise komutlar SİHİRLİ ŞEKİLDE ÇALIŞIR
commands.ts satır 25-28:
  const config = getConfig(botId);
  const isAdminGroup = Boolean(config?.adminGroupId && config.adminGroupId === from);
- config null olabilir (bot_config.json'da bot yoksa) → isAdminGroup false
- satır 89-93: !isAdminGroup ve name 'adminburasi' değilse KOMUT SİHİRLİCE İNTERNT EDİLİR (return)
- !adminburasi İSTİSNADIR → adminGroupId null olsa bile !adminburasi çalışır ve config'i oluşturur
- SONRA !otogönder çalışmalı (adminGroupId artık kayıtlı)
- AMA: botConfig null → getConfig('bot1') null ise, commands.ts'de config null
  → adminGroupId undefined → isAdminGroup false → komutlar sessizce düşer (satır 93 return)

Yani: Bot QR okutulduğunda config.ts getOrCreateConfig ÇAĞIRILMIYOR olabilir
(sadece /api/qr endpoint'inde çağrılıyor). Eğer QR başka yoldan taratılmışsa
veya config bozulmuşsa config boş kalır ve komutlar hiç cevap vermez.

## Bulgu 3: paneldeki botId 'bot1'
panel App.tsx varsayılan bot1. bot_config.json'da bots.bot1 yoksa:
- !adminburasi config oluşturur → bot1.adminGroupId kaydedilir → çalışır
- !otogönder ise isAdminGroup karşılaştırması config?.adminGroupId ile yapılır,
  adminburasi sonrası config bot1'de var olmalı → otogönder çalışmalı.

ANCAK kullanıcı "!adminburasi çalıştı ama !otogönder hiç cevap vermiyor" diyor!
Bu durumda komut KESİNLİKLE algılanıyor ama otogönder bloğuna hiç düşmüyor
VEYA hata fırlayıp sessizce yutuluyor.

## Şüphe: commands.ts'te "otogönder" adı Türkçe karakterli, KNOWN listesinde var.
ama `cmdBody.slice(1).split(/\s+/)` sonrası name karşılaştırmasıLowerCase(cmd).
Sorun olabilir: WhatsApp mesajındaki metin "!" önünde özel karakter içeriyor:
cmd = text.trim().toLowerCase(); bangIdx = cmd.indexOf('!');
text "✅ !otogönder merhaba 5" → lowerCase'de emoji bozulmaz, indexOf('!') bulunur.
Sonra KNOWN kontrolü → 'otogönder' var → isAdminGroup kontrolü → geçerse devam.

En olası neden: **VDS'te eski kod** (v3.3-v3.5) çalışıyor — komut algılama yok
(v3.3 öncesi her yerden çalışıyordu, ama v3.5 sonrası adminGroupId şartı eklenmişti
ve o sürümde bir hata olabilir).

## Doğrulama planı
1. Kullanıcıdan VDS'te: `systemctl status miranbot` ve `curl -s http://localhost:3000/api/version` çıktıları
2. Kullanıcıdan paneldeki sürüm ekranı
3. Alternatif: paneldeki komut günlüğü yoksa, logs yok → kullanıcı logları paylaşmalı

## Düzeltme fikirleri (kod tarafında ek güvenlik)
- commands.ts'e fallback: config null ise getOrCreateConfig ile bot config oluştur
  VEYA daha iyisi: bot config yoksa her gruba cevap verme — bu davranış zaten
  istenen. Ama hiç config yoksa bot1 için otomatik kayıt yap.
- server.ts /api/version'ı commit SHA + gerçek dosya hash'i döndürecek şekilde güncelle
- otogönder bloğuna try/catch eklendi (zaten var)
- Yeni eklenmesi gereken: komutun hiç düşmemesi durumunda panelde görünecek log
  (zaten console.log var satır 89) → kullanıcı logları görebilmeli
