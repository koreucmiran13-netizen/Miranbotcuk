# Miranbotcuk — Güncel Durum Notları (v3.15 geliştiriliyor)

## Kullanıcı (Miran) — ana istekler
- WhatsApp botu: !otogönder <mesaj> [dakika], dakika SONDA; mesaj AYNEN korunur
- Görsel eklendiğinde fotoğraflı göndermeli (caption + image)
- !liste → duyuru listesi, !temizle → tüm duyuruları sil (YENİ İSTEK, v3.15)
- Komutlar SADECE !adminburasi ile seçilen gruptan çalışır
- VDS: 2.56.248.252, ssh root@..., servis: miranbot (systemd), klasör /home/miranbot
- Panel: http://2.56.248.252:3000 (Miran47/Miran47)
- Güncelleme: sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/git_update.sh)"
- Temizlik betiği: reset_broadcast.sh (yayını+düyuruları sıfırlar)
- Eski bot /root/whatsapp-bot KALDIRILDI; tek servis miranbot (PID ailesi 1)

## Sürüm geçmişi
- v3.14: \r/ZW temizliği + eski duyuru temizleme (!otogönder yeni mesaj tek duyuru yapar) — GÖNDERİLDİ ama kullanıcı güncellemeyi çalıştırmamış olabilir
- v3.13: dakika opsiyonel (varsayılan 10)
- v3.12: groupInvite Timed Out erteleme (__inviteCoolUntil, queue.ts)
- v3.11: groupInvite resmi kart formatı (metin ayrı text + kart)
- v3.10: satır koruma, splitInvite (davet linkini metinden ayırır)
- v3.8: davet-link-komut çakışması düzeltmesi (komut ise davet sayılmaz)

## Teknik özet (dosyalar)
- bot/commands.ts: handleMessages(botId,msg,text,from). arg = rest.join(' ').
  !otogönder → duyuruya push(startBroadcast). KNOWN listesi var.
- bot/queue.ts: SendJob{text,mediaUrl?}. smartPlan: image/video url → caption'lı media;
  davet linki → splitInvite, metin text + groupInvite kartı. INVITE_RE: chat.whatsapp.com/(?!channel/)([A-Za-z0-9]{20,})
- bot/broadcast.ts: startBroadcast/stopBroadcast(startWatchdog)
- config.ts: bot_config.json {bots:{bot1:{adminGroupId,announcements[{id,text,imageUrl?,intervalMin}],running}}}
- server.ts: messages.upsert → handleMessages; /api/version md5(commands.ts) döndürür (v3.14 etiketi)
- panel App.tsx: React

## Yapılacak (v3.15)
1. commands.ts: !otogönder mesajında foto/image URL varsa imageUrl duyuruya kaydet (announcement.imageUrl)
   - Medyalı mesaj (!fotoğraf atıp komut) da desteklenebilir: msg.message.imageMessage varsa url çöz (downloadContentFromMessage) ve imageUrl olarak kaydet
2. commands.ts: !liste → bot1 duyuru listesini göster; !temizle → announcements=[] + stopBroadcast + kaydet
3. queue.ts: plan'e imageUrl ekle; imageUrl varsa {image:{url}}+caption gönder; davetli görsel varsa ayrı satır
4. KNOWN listesine 'liste', 'temizle' ekle
5. server.ts: version etiketi v3.15, test işareti hasListeTemizle /hasImageUrl
6. TSC → commit → push origin main

## Komut testleri kullanıcıya ver
- Güncelleme: git_update.sh komutu
- Doğrulama: curl -s http://localhost:3000/api/version → miranbot-v3.15
- Test: !otogönder <mesaj> 15 (görsel linkli), !liste, !temizle, !durdur

## Not
- Kullanıcı emoji ve Türkçe yazıyor, sabırsız; kısa net komutlar ver
- VDS'te /home/miranbot/bot_config.json duyuruları tutar
- WhatsApp reachout kısıtlaması (account_reachout_restricted) 60dk cooldown uygulanıyor


## v3.15 Geliştirme Durumu (devam)
Komutlar Eklendi: !liste (duyuru listesi + 🖼 Görselli işareti), !temizle/!temizlik (announcements=[], running=false, stopBroadcast). KNOWN listesine eklendi.
Görsel desteği commands.ts otogönder içinde:
- Reply fotoğraf (quotedMessage.imageMessage) → downloadContentFromMessage ile indir, media/img_<ts>.jpg olarak kaydet, imageUrl = http://localhost:${PORT()}/api/media/<fn>
- imageMessage.url veya mesaj url'i → direkt imageUrl
- caption içindeki görsel URL regex: /\.(jpe?g|png|webp|gif)/
- imageUrl duyuruya kaydediliyor; broadcast.ts ZATEN ann.imageUrl'yu job.mediaUrl olarak enqueue ediyor (değişiklik gerekmedi)
- queue.ts v3.15: job.mediaUrl varsa önce fotoğraf+caption gönder, davet kodu varsa ayrı text + groupInvite kartı

TAMAMLANDI: TSC temiz, panel build başarılı, server.ts'e /api/media/:fn eklendi (sadece img_<ts>.jpg regex, cache yok), version endpointi code='miranbot-v3.15' + v315media kontrolü, !yardım menüsüne !liste/!temizle + fotoğraf açıklaması eklendi, başlıklar v3.15.

SIRADAKİ (TAMAMLANDI): v3.15 + v3.15.1 (caption düzeltmesi) + v3.15.2 (admin grubuna önizleme) commit+push edildi. Kullanıcı güncellemeyi VDS'te ÇALIŞTIRDI ve doğruladı: code=miranbot-v3.15, v315media=true. Test etmesi bekleniyor.

YENİ SORUN (kullanıcı raporu, v3.15.3 düzeltilecek):
1. GÖRSEL AÇILMIYOR: imageUrl = http://localhost:3000/api/media/<fn> WhatsApp'ta çalışmaz (localhost sadece sunucu içi). ÇÖZÜM: commands.ts'te dosyayı buffer olarak oku, imageUrl yerine mediaBuffer olarak kaydet/kullan; queue.ts image:{buffer} ile gönder.
2. MESAJLAR BİTİŞİK: fotoğraf+caption+text+groupInvite ayrı ayrı ama aralarında 3-6 sn bekletme var; kullanıcı "bitişik" diyor — muhtemelen önizleme + ilk broadcast anında üst üste gidiyor veya bekleme süresi yetmiyor. ÇÖZÜM: bekleme 5-8 sn artır ve mesajlar arası boşluk satırı ekle.

NOT: media/ klasörü VDS'te /home/miranbot/media olacak (process.cwd()).


## SORUN (v3.15.6 hedefi): satırlar bitişik gidiyor
- Kullanıcı telefonundan WhatsApp gruplara satırlı mesaj yazıyor; bot bunu TEK BLOK halinde atıyor (Enter'lar kayboluyor)
- Olası neden: WhatsApp API'den gelen mesaj text'i \n içeriyor olabilir ama kullanıcının telefonundan gelen metinde yeni satırlar farklı kodlanıyor (örn. \u2028 Line Separator, çift boşluklar, \u200b vs.)
- Çözüm yaklaşımı: gelen text'te satır ayırıcıları tespit et (\\n, \\u2028, \\u2029, çift boşluk, emoji+boşluk dizilimleri), gerçek \\n'e normalize et VE mesajda boşluk görünümlü satır ayırıcılar da varsa koru. Ayrıca mesajın başındaki/sonundaki temizlik trim dışında boşlukları KORU.
- ÖNEMLİ: kullanıcının gönderdiği mesaj örnekleri WhatsApp'ta satırlı görünüyordu (ekran görüntüsü). Bot gönderimi satırlı görünüyor ama kullanıcı "tamamen bitişik yazılar" diyor — bu, hedef gruplarda görüntüleme sorununu da gösterebilir. Muhtemelen WhatsApp Web'den atılan metinde \n yerine farklı whitespace (örn. \u200b veya çift boşluk) geliyor.
- Yapılacak: handleMessages'ın gelen text'i logla (debug), gelen karakterleri HEX olarak gör, sonra normalize et.


## Log analizi (IMG_0452, v3.15.6 sonrası)
- Gelen mesaj text'i: `"... *120 ios freelers\n\n*ORG ATABİLİRSİN"` — gerçek \n var, satırlar korunuyor
- Duyuru metni olarak kaydedilen de aynı: satırlar mevcut
- Kullanıcı "bitişik" diyor; ama logda satırlar var
- KRİTİK ÖLÇEK: kullanıcı telefonundan "boşluklu" bir mesaj yazıyor olabilir (\n değil, çift boşluk veya enter görünüşü farklı karakter). Ekran görüntüsünde gönderilen mesajın satırları GÖRÜNÜYOR ama aralar çok dar.
- Olasılık: WhatsApp'ta uzun metinlerde satır arası boşluk tek satır; kullanıcı "boşluklu" istiyor = satır aralarında ÇİFT \n olsun.
- YAPILACAK: \n ile gelen satırları otomatik olarak ÇİFT \n\n yap (daha nefes alan görüntü), böylece "yapışık" görünüm gider.


## v3.15.8 hedefi: dakika yapışması + fotoğraf açılmama
- KÖK NEDEN (dakika): kullanıcı mesajını fotoğrafa REPLY ile değil, FOTOĞRAFLI MESAJIN CAPTION'I İÇİNDE yazıyor (imageMessage + caption). Caption sonunda link var: "...&ilir=4" ve komutu aynı caption'a ekliyor: "...=4 8". Bot \d+$ ile SON sayıyı "8" alıyor, "4" kalıyor → link "...=4 8" yapışık görünüyor. Ayrıca =4 kısmı WhatsApp link önizlemesini bozuyor.
- ÇÖZÜM: dakika ayrıştırma yalnızca SON kelime tam sayıysa ve MESAJ SONU boşa boşlukla ayrılmışsa çıkarsın (numMatch = /\s\d+$/); link içi sayılar korunur. Caption sonundaki dakika sayısını çıkardıktan sonra link tekrar düzelir.
- Fotoğraf açılmama: kullanıcının son ekranında fotoğraf AÇILMIYOR görünüyor (gri kamera ikonu?). Kuyrukta buffer gönderim logu: "[QUEUE] Fotoğraflı mesaj (buffer, aynen) gönderildi" göründü mü logda kontrol et. Eğer eski sürüm çalışıyorsa bu eski mediaUrl/localhost gönderimi olabilir → kullanıcı güncellemiş gibi görünüyor (00:45). Buffer gönderiminde jpegThumbnail: undefined iyi; belki caption boşsa WhatsApp image'i göstermiyor. Ayrıca bailey'lerde `image: Buffer` + caption desteği var, sorun başka olabilir — log kontrolü yap.


## v3.16: AI sohbet + !katıl
Kullanıcı yeni istek: (1) link + !katıl → bot gruba katılsın, (2) PUBG/espor gruplarında oyuncularla AI sohbet + taktik önerileri.

Teknik plan (VDS üzerinde çalışacak bot için):
- YAPAY ZEKA: Kullanıcının VDS'inde API key yok. İki seçenek: (a) Manus proxy (sandbox) — ama VDS'ten çağrı gerek, VDS'te token yok; (b) ücretsiz/ucuz alternatif: Google Gemini'nin ücretsiz API key'i (kullanıcıdan key istenebilir) veya VDS'te küçük yerel model. En pratik: Gemini API key kullanıcıdan alınır → bot_config.json'a aiApiKey; veya OpenAI uyumlu endpoint.
- Alternatif basit yol: bot, grup mesajlarına cevap için Gemini API key gerektirir; !aikey <key> komutuyla set edilir.
- !katıl: link → sock.groupAcceptInvite(code); isim → tüm katılılan grupları tara, isim içeren (search) varsa katıl. Mevcut !katıl zaten var — AI "pubg/espor" grupları tespit + sohbet kısmı eklenmeli.
- Sohbet modu: !aiac veya !yapayzeka aç/kapat — açık grupta kullanıcılar mesaj attığında AI cevap verir (rate limit: kişi başı ~2-3 dk). Bot kendisi yazıyorsa sessiz.


## v3.16 MİMARİ KARARLAR (kesinleşmiş)
- !katıl zaten gruba katılıyor (mevcut kodda link varsa sock.groupAcceptInvite). YENİ: !katıl isim verince grubu bulup katılıyor — zaten var mı kontrol et. AI kısmı ayrı.
- AI sohbet için Gemini API key: !aikey <key> ile saklanır (bot_config.json'a aiApiKey). Gemini ücretsiz tier (gemini-2.5-flash, gemini-2.0-flash-lite).
- Mod aç/kapat: !yapayzeka (toggle per-bot, config.aiChat = true).
- Çalışma şekli: handleMessages'da komut DEĞİL normal grup mesajlarında, config.aiChat true ise son 6 mesaj içeriğini AI'ya gönder, cevap gelirse kuyrukla at. Rate limit: aynı gruba kişi başı 2 dk. Bot kendi mesajını yanıtlayamaz (self kontrol).
- Cevap kısa olmalı (max 2-3 cümle), Türkçe, PUBG/espor tarzı arkadaşça.
- Komutlar KNOWN listesine eklenecek: aikey, yapayzeka, ai.
- VDS'te yeni bağımlılık: googleapis yerine doğrudan REST: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=APIKEY — fetch ile (Node 22'de var).
- !yardım menüsüne AI komutları eklenecek.
- Version: code "miranbot-v3.16" → server.ts versionFlags + commands.ts help text.


## v3.16 DURUM (devam ediyor)
- YENİ DOSYA: bot/ai.ts (Gemini REST çağrısı, model: gemini-2.0-flash-lite, history ring buffer 12 mesaj, rate limit 2dk/grup, SYSTEM_PROMPT PUBG/espor TR arkadaşça)
- config.ts: BotConfig'e aiApiKey + aiChat eklendi ✅
- commands.ts: KNOWN listesine aikey/yapayzeka/ai eklendi ✅; admin dışı reddine istisna ✅; !katıl'a link direkt katılım eklendi ✅; !aikey ve !yapayzeka gövdeleri eklendi ✅; dosya sonuna handleAIChat() export edildi ✅; !durum sürüm v3.16 ✅; !yardım menüsüne AI satırları eklendi ✅
- server.ts: handleAIChat import + messages.upsert sonunda void handleAIChat(...) eklendi ✅; /api/version code='miranbot-v3.16' ✅
- KALAN: server.ts'e hasV316AI bayrağını tanımla (v3.15.8'de versionFlags içinde hasV316AI kullanıldı ama TANIMLANMADI — hasV315Media tanımlandığı satırın altına ekle: const hasV316AI = /handleAIChat/.test(raw); (commands.ts raw zaten okunuyor))
- SONRA: npx tsc --noEmit → temizse git add bot/commands.ts bot/ai.ts server.ts config.ts → commit 'v3.16: ai sohbet + link ile katil' → push origin main
- KULLANICIYA VERİLECEK MESAJ: VDS güncelleme komutu + !aikey <GEMINI_KEY> (https://aistudio.google.com/app/apikey ücretsiz) + gruba !yapayzeka + !katıl <link> testi
- KALAN ÖNCEKİ SORUN: v3.15.8 sonrası kullanıcının fotoğraf/dakika sorunu KAPANDI (yeni istek geldi). NOT: kullanıcı 3 kez 'olmuyor' dedi v3.15 serisinde; AI modülünü eklerken v3.15.8 değişiklikleri KORUNMALI (commands.ts'te zaten duruyorlar: /\s(\d{1,4})$/ dakika regex, çift \n normalizasyon, queue.ts buffer gönderim)
- VDS: 2.56.248.252, SSH yok (kullanıcı git_update.sh ile güncelliyor)


## v3.16.1 model fix (CANLI TEST GEÇTİ)
Kullanıcı anahtar: AIzaSyDmCpdEQBvF6JO6p4-SFdxqE7z3EJ8uuYI — GEÇERLİ ✔
- gemini-2.0-flash-lite → 404 (yayından kalktı)
- gemini-2.5-flash-lite → 404 (yeni kullanıcılara kapalı)
- gemini-flash-lite-latest → 200, cevap geliyor ✔ (Örn: "Selam kanka! Bence en iyisi Groza...")
- ai.ts fallback zinciri: [model, gemini-2.5-flash-lite, gemini-2.5-flash] → GÜNCELLE: [model, gemini-flash-lite-latest, gemini-flash-latest] olmalı
- test_key.ts repo dışı kalmalı (.gitignore'a eklendi mi? test_ai.ts eklendi, test_key.ts'yi de ekle)
- KALAN: modelList güncelle → TSC → commit v3.16.1 → push → kullanıcıya "güncelle + !aikey + !yapayzeka"


## SORUN: "Yapayzeka cevap vermiyor" (kullanıcı bildirimi, Ağustos 13-14)
Olası nedenler (sırasıyla kontrol edilecek):
1. Kullanıcı güncellememiş olabilir (git_update.sh sonrası `curl localhost:3000/api/version` kontrolü istendi — yanıt henüz yok)
2. !aikey !yapayzeka adımları yapılmamış olabilir (bot 'AI anahtarı girilmemiş' der — kullanıcı bunu görmüş mü?)
3. handleAIChat guard'ları: from '@g.us' değilse sessiz; fromMe ise sessiz; text len<2 sessiz; '!' ile başlıyorsa sessiz; rate limit 2dk grup başına; aiChat false veya aiApiKey yoksa sessiz
4. AI anahtarı yanlış bot id'sine gitmiş olabilir — loadConfig() cfg.bots[botId]; botId formatı: 'bot'+tel → test et
5. API fallback zinciri çalışıyor ama cevap yine null olabilir (rate limit gemini: 15 RPD ücretsiz)
Kullanıcıdan beklenen: api/version çıktısı + journalctl grep 'ai'
NOT: journalctl grep pattern 'ai\]' olmalı ([AI] log prefix)


## SORUN ANALİZ (ekran görüntüsünden, 01:04)
- !aikey ✔ (AI anahtarı kaydedildi)
- !yapayzeka ✔ (mod AÇILDI)
- Kullanıcı "selam", "heyy", "@bottext selam" yazmış → CEVAP YOK
Kritik şüphe: VDS'te eski kod yayında olabilir (handleAIChat yok) — kullanıcı güncellemeyi yapmamış olabilir.
Alternatif: handleAIChat çağrılıyor ama guard'lar: 
  - msg.key.fromMe kontrolü: kullanıcı kendi numarasından yazıyor — fromMe false olmalı (normal)
  - text.startsWith('!') guard'ı var ama "selam" '!' içermiyor ✔
  - rate limit 2dk → ilk mesajda sorun yok
  - aiChat guard'ı: cfg.bots[botId] — botId formatı önemli!
ÖNEMLİ: saveConfig/loadConfig'te config dosyası hangi botId ile yazıldı? !aikey'de `cfg.bots[botId]` kullandık → cmd handleMessages'da botId parametresi server.ts'ten geliyor (bot1 vs bot2?). 
EN OLASI: handleAIChat'i çağıran server.ts güncellenmemiş (v3.16.1) — curl version çıktısı bekleniyor.
LOG ANALİZ PLANI: kullanıcıdan [MSG] logları istendi; "selam" görünüyor ama [AI] yoksa = handleAIChat hiç çalışmıyor (eski kod) veya from g.us değil.


## 400 HATASI ANALİZ SONUCU (Plan modu sonrası)
- Sandbox'ta tam ai.ts akışı bile 200 dönüyor (aynı key AIzaSyDmCpdEQBvF6JO6p4-SFdxqE7z3EJ8uuYI, aynı mesaj "*GTA SEARCH 3 SİZLERLE*")
- Sandbox'ta ayrı ayrı: flash-lite-latest ✔, flash-latest ✔, gemini-3-flash-preview ✔, ardışık user history ✔, yıldızlı metin ✔ → hepsi 200
- VDS'te log 01:09:39'da 7x ardışık 400 "gemini-flash-lite-latest hatası: 400" — 01:09'da güncelleme henüz BAŞLAMAMIŞTII (15:07'de güncelleme ekranı; 01:09 = 13 Ağu 01:09 TR). DİKKAT: kullanıcı iki farklı VDS saatinden log attı — 15:07 ekranında güncelleme yapılıp curl version v316ai:true çıktı.
- Logdaki 400 01:09:39 vaktinde — O ZAMAN v3.16.1 (eski) yayında mıydı bilinmez. Ama kullanıcı 15:09'da grep tekrar attığında yine 400 detayları gösterdi (Aynı ekranda iki log: 01:09:39 satırları)
- SONRAKİ ADIM: /api/version endpointine ai key durumunu maskeli ekle (/api/aistatus) — kullanıcı "aikey doğru kaydedildi mi" doğrulasın: son 6 karakter göster + model zinciri. Ayrıca ai.ts'te 400 detayının TAMAMINI logla (details).
- VDS IP: 2.56.248.252, SSH yok; kullanıcı git_update.sh ile güncelliyor.
- test_ai.ts, test_key.ts, repro_*.ts dosyaları .gitignore'da — repo dışı.
- Model zinciri (ai.ts güncel): [model, gemini-flash-lite-latest, gemini-flash-latest] — doğrulanmış çalışıyor.


## aistatus sonucu (kullanıcı ekranı, 15:13)
{"ok":true,"bots":{"bot1":{"aiChat":true,"keySet":true,"keyTail":"j8uuYI","keyLen":39}}}
→ Anahtar DOĞRU kaydedilmiş (beklenenle birebir: 39 karakter, son 6 j8uuYI). AI modu AÇIK.
→ Güncelleme: v3.16.3 (27f71dc) başarıyla kuruldu, panel derlendi.
→ Ekrandaki 400 logları 01:09:39 tarihli (ESKİ, güncelleme öncesi; eski kodda detay logu yoktu, sadece "details": [ ile kesiliyordu).
→ BEKLENEN: kullanıcı "selam" yazınca yeni logda tam 400 detayı görünecek → kesin kök neden.
Sandbox doğrulamaları: aynı key + tam ai.ts akışı 200, cevap Türkçe PUBG tarzı ✔. 404 fallback ✔. Türkçe+emoji ✔.
Olası VDS'e özel nedenler: (a) Google, AIza key'lerini "uygulama kısıtı" (application restriction) ile sınırlamış olabilir — AI Studio'da key'in IP/API kısıtı varsa VDS IP'si reddedilir (400), sandbox'tan istek yoktu... DİKKAT: sandbox testleri SANDBOX IP'sinden yapıldı ve 200 döndü → IP kısıtı değil. (b) rate limit: 15 istek/dakika — kullanıcı defalarca denedi, VDS IP'si dakika bazlı throttle'a düşmüş olabilir. (c) gemini-flash-lite-latest model kısıtı bölge. 
→ SONRAKİ: kullanıcıdan yeni "selam" sonrası log al, detay gör, ona göre aksiyon.


## ROLLBACK KARARI (kullanıcı onayladı, 13 Ağu)
Kullanıcı "sen yap" demeden önceki sürüme dönmek istedi. Karar: **v3.10 (commit 0f1cff1)** — davet kartı "resmi groupInvite format" düzeltmesinin (v3.11) bir öncesi. Özellikler: link önizleme kartı (Gruba Katıl), !durdur, satır atlamaları korunuyor, otogönder text-only, sürüm v3.10.
Sıfırlanacak commit'ler: 67b79f9..27f71dc (tamamı). Yeni tek commit "v3.10 kararlı başlangıç" olarak it edilecek.
NOT: v3.10 kodunda /api/version endpointi var (v3.10 etiketi). git_update.sh repo'da duruyor (926f900) → rollback'te dosyalar v3.10 çalışma ağacına göre sıfırlanır; git_update.sh v3.10 ağacında YOK! → yeni commit'e git_update.sh'yi EKLE (kullanıcı VDS güncellemesi için buna bağımlı). Ayrıca install.sh ve panel dist'i de v3.10 ağacında yoksa ekle — kontrol et.
VDS IP: 2.56.248.252, kullanıcı telefonla güncelliyor: sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/git_update.sh)"
Repo: github.com/koreucmiran13-netizen/Miranbotcuk (main branch, forced update ile it edilecek).
