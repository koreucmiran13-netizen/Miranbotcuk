/**
 * MiranBot v3.8 — Komut İşleyicisi
 * - Admin komutları SADECE !adminburasi ile belirlenen gruptan çalışır
 *   (özel sohbet ve diğer gruplar admin komutlarını GÖRMEZDEN gelir)
 * - Bilgi komutları (!durum, !yardım) her yerden çalışır
 * - !otogönder <dakika>: paneldeki tüm duyuruları tüm gruplara otomatik döndürür
 * - !katıl: tüm grupları tarar, adı "search" geçene katılır; zaten katılıysa sessiz
 * - v3.8: komut mesajlarındaki chat.whatsapp.com linkleri davet KODU sayılmaz;
 *   mesaj AYNEN duyuru metni olarak saklanır (büyük/küçük harf korunur)
 */
import type { WAMessage } from '@whiskeysockets/baileys';
import { getState } from './engine';
import { enqueue } from './queue';
import { getConfig, saveConfig, loadConfig } from '../config';
import { addCustomer, removeCustomer } from '../users';
import { startBroadcast, stopBroadcast, isBroadcastRunning } from './broadcast';

export async function handleMessages(
  botId: string,
  msg: WAMessage,
  text: string,
  from: string,
): Promise<void> {
  const state = getState(botId);
  state.lastActivityAt = Date.now();

  const config = getConfig(botId);
  const group = from.endsWith('@g.us');
  const isPrivate = !group;
  const isAdminGroup = Boolean(config?.adminGroupId && config.adminGroupId === from);

  // -------------------------------------------------------------------
  // Komut algılama — v3.8: önce komut kontrol edilir; mesajda geçerli bir
  // komut varsa davet-linki kontrolü ATLANIR (mesaj içindeki linkler
  // otogönder duyuru metni olabilir — davet kodu sayılmaz).
  // -------------------------------------------------------------------
  const cmd = text?.trim().toLowerCase();
  if (!cmd) return;
  const bangIdx = cmd.indexOf('!');
  if (bangIdx === -1) return;
  const cmdBody = cmd.slice(bangIdx);

  const [name, ...rest] = cmdBody.slice(1).split(/\s+/);
  const arg = rest.join(' ');

  // v3.7: Bilinmeyen komut adıysa sessiz geç (normal mesajda ! işareti olabilir)
  const KNOWN = ['adminburasi', 'admingrubu', 'otogönder', 'otogonder', 'otomatik', 'katıl', 'katil', 'yardım', 'yardim', 'help', 'komutlar', 'komut', 'durum', 'botdurum', 'ekle', 'musteriekle', 'sil', 'musterisil', 'kapat', 'yenidenbaglan', 'yeniden'];
  const isKnownCmd = KNOWN.includes(name);

  // -------------------------------------------------------------------
  // Davet linki yakalama (tüm gruplardan) — v3.8: yalnızca mesaj bir
  // komut DEĞİLSE davet kodu olarak işlenir
  // -------------------------------------------------------------------
  if (group && !isKnownCmd) {
    const invite = text.match(/chat\.whatsapp\.com\/(?!channel\/)([A-Za-z0-9]{20,})/);
    if (invite) {
      const code = invite[1];
      const sock = state.sock;
      // account_reachout_restricted hatası sonrası beklet (60 dk)
      const until = (state as any).inviteCooldownUntil || 0;
      if (Date.now() < until) {
        console.log(`[CMD] [${botId}] Davet avcılığı bekletildi (WhatsApp kısıtlaması), kalan: ${Math.round((until - Date.now()) / 60000)} dk`);
        return;
      }
      if (sock) {
        void sock
          .groupAcceptInvite(code)
          .then((gid) => {
            if (gid) {
              state.groupCount += 1;
              console.log(`[CMD] [${botId}] Davet linki kabul edildi: ${gid}`);
            }
          })
          .catch((e) => {
            const em = typeof e === 'object' && e ? (e as { message?: string }).message ?? String(e) : String(e);
            if (em.includes('reachout_restricted') || em.includes('not-authorized') || em.includes('forbidden')) {
              (state as any).inviteCooldownUntil = Date.now() + 60 * 60 * 1000;
              console.log(`[CMD] [${botId}] WhatsApp kısıtlaması tespit edildi — davet avcılığı 60 dk bekletiliyor. (${em})`);
            } else {
              console.error('[CMD] Davet kabul edilemedi:', em);
            }
          });
      }
      return;
    }
  }

  // name, arg zaten yukarıda ayrıştırıldı; bilinmeyen komut ise sessiz geç
  if (!isKnownCmd) return;

  // v3.3: Komutlar SADECE admin grubundan çalışır.
  // Admin grubu DIŞINDAKİ her yer (özel sohbet + diğer gruplar) TÜM komutları
  // görmezden gider — yalnızca davet linki avcılığı (üstte) aktif kalır.
  // !adminburasi istisnası: her yerden yazılabilir, yazıldığı gruba geçiş yapar.
  console.log(`[CMD] [${botId}] Komut görüldü: "${cmd}" | from: ${from} | adminGroupId: ${config?.adminGroupId ?? '(yok)'} | isAdminGroup: ${isAdminGroup}`);
  if (!isAdminGroup && name !== 'adminburasi' && name !== 'admingrubu') {
    console.log(`[CMD] [${botId}] Komut görmezden gelindi (admin grubu dışı).`);
    return;
  }

  const sock = state.sock;
  const reply = (t: string) => {
    if (!sock) return;
    enqueue({ sock, jid: from, text: t });
  };

  // ---------------- bilgi komutları (yalnızca admin grubundan) ----------------
  if (name === 'durum' || name === 'botdurum') {
    const st = getState(botId);
    reply(
      `*📡 BOT DURUMU*\n\n` +
        `✅ Durum: ${st.status === 'connected' ? 'Çevrimiçi' : st.activity}\n` +
        `👥 Grup sayısı: ${st.groupCount}\n` +
        (st.lastDisconnectReason ? `⚠️ Son kopma: ${st.lastDisconnectReason}\n` : '') +
        `🛠 Sürüm: MiranBot v3`,
    );
    return;
  }

  if (name === 'yardım' || name === 'yardim' || name === 'help' || name === 'komutlar' || name === 'komut') {
    // v3.3: !yardım da artık yalnızca admin grubundan cevap verir
    reply(
      `🤖 *MİRAN BOT* 🤖\n` +
        `━━━━━━━━━━━━━━\n` +
        `📖 *Kullanılabilir Komutlar*\n\n` +
        `📡 !durum — Botun durumu ve grup sayısı\n` +
        `🤖 !yardım — Bu yardım menüsü\n` +
        `📢 !otogönder <mesaj> <dakika> — Otomatik yayın başlat (örn: !otogönder merhaba 5)\n` +
        `🛑 !otogönder kapat — Otomatik yayını durdur\n` +
        `🔗 !katıl — Grupları tara, link adı geçenlere otomatik katıl\n` +
        `👑 !adminburasi — Bu grubu admin grubu yap (sadece admin grubunda)\n` +
        `👤 !ekle <isim> <telefon> — Müşteri ekle (sadece admin grubunda)\n` +
        `🗑 !sil <isim> — Müşteri sil (sadece admin grubunda)\n\n` +
        `💡 *Not:* Admin komutları yalnızca admin grubundan çalışır.\n` +
        `🔗 *Davet linki:* Gruba atılan chat.whatsapp.com linklerine otomatik katılır.`,
    );
    return;
  }

  // ---------------- admin komutları (yalnızca admin grubu) ----------------
  // Bilgi komutlarından buraya düşenler zaten engellendi (üstteki return'lar)

  if (name === 'adminburasi' || name === 'admingrubu') {
    if (!group) {
      reply('⚠️ Bu komut yalnızca bir grupta çalışır. Admin grubu yapmak istediğin gruba yaz.');
      return;
    }
    // v3.5: Kayıt garantisi — config var olmasa da oluştur, yaz, ardından okuyup doğrula
    const c = loadConfig();
    if (!c.bots[botId]) c.bots[botId] = { announcements: [], running: false };
    c.bots[botId].adminGroupId = from;
    saveConfig(c);
    // Doğrulama: diske yeniden yazıldı mı?
    const verify = loadConfig();
    const ok = verify.bots[botId]?.adminGroupId === from;
    console.log(`[CMD] [${botId}] adminGroupId ${ok ? 'KAYDEDİLDİ' : 'KAYDEDİLEMEDİ!'}: ${from} (config dosyasından okunan: ${verify.bots[botId]?.adminGroupId ?? '(yok)'})`);
    if (ok) {
      reply(`👑 *Bu grup admin grubu olarak ayarlandı!*\n\n✅ Artık tüm admin komutları yalnızca buradan çalışır.`);
    } else {
      reply('⚠️ Admin grubu kaydedilemedi — sunucu diskinde bir sorun olabilir, lütfen yetkiliye bildir.');
    }
    return;
  }

  if (name === 'otogönder' || name === 'otogonder' || name === 'otomatik') {
    if (arg === 'kapat' || arg === 'stop' || arg === 'durdur' || arg === 'off') {
      stopBroadcast(botId);
      reply(`🛑 *Otomatik yayın durduruldu.*`);
      return;
    }
    // v3.8 format: !otogönder <mesaj> <dakika>
    // Mesaj AYNEN korunur (büyük/küçük harf, link, emoji dahil);
    // yalnızca SONDAKİ sayı dakikayı verir. WhatsApp biçim karakterleri
    // (* _ ~) temizlenir çünkü mesaj zaten yeni atılacak, çifte biçimleme olur.
    const clean = arg.replace(/[_*`~]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) {
      reply(`📢 *Kullanım:* !otogönder <mesaj> <dakika>\n\nÖrn: !otogönder merhaba 5\n→ Her 5 dakikada bir "merhaba" mesajı tüm gruplara gönderilir.\n\nDurdurmak için: !otogönder kapat`);
      return;
    }
    // Dakika = metindeki SON sayı; kalan kısım mesaj (olduğu gibi korunur)
    const numMatch = clean.match(/\d+$/);
    if (!numMatch) {
      reply(`📢 *Kullanım:* !otogönder <mesaj> <dakika>\n\nÖrn: !otogönder merhaba 5\n→ Her 5 dakikada bir "merhaba" mesajı tüm gruplara gönderilir.\nDurdurmak için: !otogönder kapat`);
      return;
    }
    const mins = parseInt(numMatch[0], 10);
    if (mins < 1 || mins > 1440) {
      reply(`📢 *Kullanım:* !otogönder <mesaj> <dakika>\n\nÖrn: !otogönder merhaba 5\n→ Her 5 dakikada bir "merhaba" mesajı tüm gruplara gönderilir.\nDurdurmak için: !otogönder kapat`);
      return;
    }
    const messageText = clean.slice(0, clean.length - numMatch[0].length).trim();
    if (!messageText) {
      reply(`📢 *Kullanım:* !otogönder <mesaj> <dakika>\n\nÖrn: !otogönder merhaba 5\n→ Her 5 dakikada bir "merhaba" mesajı tüm gruplara gönderilir.\nDurdurmak için: !otogönder kapat`);
      return;
    }
    try {
      // Duyurulara yeni duyuru ekle ve yayını başlat
      const c = loadConfig();
      if (!c.bots[botId]) c.bots[botId] = { announcements: [], running: false };
      c.bots[botId].announcements.push({
        id: String(Date.now()),
        text: messageText,
        intervalMin: mins,
      });
      saveConfig(c);
      startBroadcast(botId);
      console.log(`[CMD] [${botId}] Otogonder: "${messageText}" her ${mins} dk — duyuru sayısı: ${c.bots[botId].announcements.length}`);
      reply(`✅ *Otomatik yayın başlatıldı!*\n\n⏰ Her *${mins} dakikada* bir:\n_${messageText}_\nmesajı *tüm gruplara* gönderilecek.\n\nDurdurmak için: !otogönder kapat`);
    } catch (e) {
      console.error(`[CMD] [${botId}] Otogonder hatası:`, e);
      reply(`⚠️ Yayın başlatılamadı: ${e && typeof e === 'object' && 'message' in e ? String((e as { message?: string }).message) : 'bilinmeyen hata'}. Paneldeki "Yayını Başlat" butonunu da kullanabilirsin.`);
    }
    return;
  }

  if (name === 'katıl' || name === 'katil') {
    if (!sock) {
      reply('⚠️ Bot henüz bağlı değil.');
      return;
    }
    reply(`🔍 *Gruplar taranıyor... Lütfen bekle.*`);
    const keyword = arg.trim() || 'search';
    try {
      const groups = await sock.groupFetchAllParticipating();
      const jids = Object.keys(groups);
      let checked = 0;
      let joined = 0;
      let already = 0;
      let linksFound: string[] = [];

      for (const jid of jids) {
        try {
          const code = await sock.groupInviteCode(jid);
          if (!code) continue;
          checked += 1;
          const meta = groups[jid];
          const subject = (meta?.subject || '').toLowerCase();
          if (subject.includes(keyword.toLowerCase())) {
            already += 1; // zaten katılıyız — bir şey yapma
            linksFound.push(`• ${meta?.subject} → https://chat.whatsapp.com/${code}`);
          }
        } catch {
          // linke erişilemeyen grupları atla
        }
      }
      // Kendi gruplarımıza zaten katılıyız; keyword eşleşenlerin linklerini raporla
      const report =
        `✅ *Tarama tamamlandı!*\n\n` +
        `🔍 Aranan kelime: *${keyword}*\n` +
        `👥 Taranan grup: ${checked}\n` +
        `🔗 Linki olan "${keyword}" grubu: ${linksFound.length}\n\n` +
        (linksFound.length > 0 ? `*Bulunan gruplar:*\n${linksFound.slice(0, 10).join('\n')}\n` : '') +
        `💡 *Not:* Zaten üye olduğum için katılma gerekmedi. Başka bir botun paylaşacağı "${keyword}" linkli gruplara otomatik katılmak için o linke atılan davet kodunu da destekliyorum — gruba davet linki atıldığında otomatik katılırım.`;
      reply(report);
    } catch (e) {
      reply(`⚠️ Tarama sırasında hata oluştu: ${e && typeof e === 'object' && 'message' in e ? String((e as { message?: string }).message) : 'bilinmeyen hata'}`);
    }
    return;
  }

  if (name === 'ekle' || name === 'musteriekle') {
    const parts = arg.split(/\s+/);
    if (parts.length < 2) {
      reply('👤 Kullanım: !ekle <müşteri adı> <telefon numarası>');
      return;
    }
    const phone = parts[parts.length - 1];
    const cname = parts.slice(0, -1).join(' ');
    const ok = addCustomer(botId, cname, phone);
    reply(ok ? `✅ Müşteri *${cname}* (${phone}) eklendi.` : '❌ Müşteri eklenemedi.');
    return;
  }

  if (name === 'sil' || name === 'musterisil') {
    if (!arg) {
      reply('🗑 Kullanım: !sil <müşteri adı>');
      return;
    }
    const ok = removeCustomer(botId, arg);
    reply(ok ? `✅ Müşteri *${arg}* silindi.` : '❌ Müşteri bulunamadı.');
    return;
  }

  if (name === 'kapat' || name === 'yenidenbaglan') {
    reply('⚙️ Bağlantı işlemleri panele özel — lütfen panelden "Yeni QR / Yeniden Bağlan" butonlarını kullan.');
    return;
  }
}
