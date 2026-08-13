# MiranBot v3

Sıfırdan yazılmış, stabil ve 7/24 çalışmaya uygun WhatsApp duyuru botu.

## Özellikler

- **Tek soket garantisi**: Aynı numarada aynı anda yalnızca bir bağlantı açılır; 440 (conflict) hatası fiziksel olarak imkansız.
- **Akıllı mesaj formatı**: Duyuru metnindeki `http(s)://...` ile biten görsel/video linkleri otomatik medya olarak gönderilir; link içeren düz metinler tıklanabilir link olarak gider.
- **Hızlı komut yanıtı**: Mesajlar tek bir tek socket üzerinden işlenir; watchdog yalnızca bağlantı kopukluğunda devreye girer.
- **Duyurular**: Gruplara belirli aralıklarla otomatik duyuru (yazı + görsel desteği).
- **Çok müşteri (kiralanabilir) mimarisi**: Her bot (`bot1`, `bot2`, ...) ayrı oturum, ayrı duyuru ve ayrı müşteri listesine sahiptir.

## Komutlar

| Komut | Nerede çalışır | Açıklama |
|---|---|---|
| `!adminburasi` | Yalnızca `!adminburasi` yazılmış grup ve özel sohbet | Grubu duyuru grubu olarak işaretler |
| `!adminburasi kapat` | Yukarıdakiler | Duyuru grubu işaretini kaldırır |
| `!gruplar` | Tüm gruplardan | Botun bulunduğu grupları listeler |
| `!davet` | Botun bulunduğu tüm gruplardan | Grubun davet linkini gönderir |
| `!durum` | Tüm gruplardan ve özel sohbetten | Botun bağlanma durumunu bildirir |

## Panel

- Varsayılan giriş: `Miran47` / `Miran47` (kurulumda değiştirilebilir)
- Port: `3000`

## Kurulum (VDS)

Tek komutla kurulum:

```bash
sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/koreucmiran13-netizen/Miranbotcuk/main/install.sh)"
```

Betiği bir kez çalıştırmak yeterlidir; Node.js kurulur, kod klonlanır, panel derlenir ve bot **systemd** servisi olarak 7/24 çalışmaya başlar. Bilgisayarı/tableti kapatmanız bir şeyi etkilemez — bot VDS üzerinde bağımsız çalışır.

Servis komutları:

```bash
systemctl status miranbot          # durum
journalctl -u miranbot -f          # canlı günlük
systemctl restart miranbot         # yeniden başlat
```

## Geliştirme

```bash
npm install
npm run build      # paneli derle
npm run dev        # sunucuyu çalıştır
```

## Dizin yapısı

```
bot/          engine.ts  queue.ts  commands.ts  broadcast.ts
panel/        React yönetim paneli kaynak kodu
server.ts     Express API + statik panel servisi
config.ts     Duyuru/konfigürasyon verisi
users.ts      Müşteri verisi
install.sh    Otomatik VDS kurulum betiği
```
