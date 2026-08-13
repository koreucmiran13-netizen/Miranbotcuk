/**
 * MiranBot v3.2 — Komut İşleyicisi
 * - Admin komutları SADECE !adminburasi ile belirlenen gruptan çalışır
 *   (özel sohbet ve diğer gruplar admin komutlarını GÖRMEZDEN gelir)
 * - Bilgi komutları (!durum, !yardım) her yerden çalışır
 * - !otogönder <dakika>: paneldeki tüm duyuruları tüm gruplara otomatik döndürür
 * - !katıl: tüm grupları tarar, adı "search" geçene katılır; zaten katılıysa sessiz
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
  // Davet linki yakalama (tüm gruplardan)
  // -------------------------------------------------------------------
  if (group && text) {
    const invite = text.match(/chat\.whatsapp\.com\/([A-Za-z0-9]{20,})/);
    if (invite) {
      const code = invite[1];
      const sock = state.sock;
      if (sock) {
        void sock
          .groupAcceptInvite(code)
          .then((gid) => {
            if (gid) {
              state.groupCount += 1;
              console.log(`[CMD] [${botId}] Davet linki kabul edildi: ${gid}`);
            }
          })
          .catch((e) => console.error('[CMD] Davet kabul edilemedi:', e?.message ?? e));
      }
      return;
    }
  }

  // -------------------------------------------------------------------
  // Komut algılama
  // -------------------------------------------------------------------
  const cmd = text?.trim().toLowerCase();
  if (!cmd?.startsWith('!')) return;

  const [name, ...rest] = cmd.slice(1).split(/\s+/);
  const arg = rest.join(' ');

  // v3.3: Komutlar SADECE admin grubundan çalışır.
  // Admin grubu DIŞINDAKİ her yer (özel sohbet + diğer gruplar) TÜM komutları
  // görmezden gelir — yalnızca davet linki avcılığı (üstte) aktif kalır.
  // !adminburasi istisnası: her yerden yazılabilir, yazıldığı gruba geçiş yapar.
  if (!isAdminGroup && name !== 'adminburasi' && name !== 'admingrubu') return;

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
        `📢 !otogönder <dakika> — Duyuruları tüm gruplara otomatik gönder (örn: !otogönder 30)\n` +
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
    const cfg = getConfig(botId);
    if (cfg) {
      cfg.adminGroupId = from;
      saveConfig(loadConfig());
      reply(`👑 *Bu grup admin grubu olarak ayarlandı!*\n\n✅ Artık tüm admin komutları yalnızca buradan çalışır.`);
    }
    return;
  }

  if (name === 'otogönder' || name === 'otogonder' || name === 'otomatik') {
    if (arg === 'kapat' || arg === 'stop' || arg === 'durdur' || arg === 'off') {
      stopBroadcast(botId);
      reply(`🛑 *Otomatik yayın durduruldu.*`);
      return;
    }
    // Arg'dan sayıyı çıkar: "30", "30 dakika", "her 30 dk" hepsi çalışır
    const m = arg.match(/(\d+)/);
    const mins = m ? parseInt(m[1], 10) : 0;
    if (mins < 1) {
      reply(`📢 *Kullanım:* !otogönder <dakika>\n\nÖrn: !otogönder 30 — Paneldeki tüm duyuruları her 30 dakikada bir tüm gruplara gönderir.\nDurdurmak için: !otogönder kapat`);
      return;
    }
    try {
      // Duyuru aralıklarını belirtilen dakikaya güncelle (yoksa 1 adet varsayılan duyuru)
      const c = loadConfig();
      const botCfg = c.bots[botId] || (c.bots[botId] = { announcements: [], running: false });
      if (botCfg.announcements.length === 0) {
        botCfg.announcements.push({
          id: String(Date.now()),
          text: '*MiranBot duyuru sistemi aktif.*\nDuyuru metnini panelden ekleyin veya buraya yazın: !otogönder ayarla <metin>',
          intervalMin: mins,
        });
      } else {
        for (const ann of botCfg.announcements) ann.intervalMin = mins;
      }
      saveConfig(c);
      startBroadcast(botId);
      console.log(`[CMD] [${botId}] Otogonder başlatıldı: ${mins} dk, duyuru sayısı: ${botCfg.announcements.length}, config.running: ${c.bots[botId]?.running}`);
      reply(`✅ *Otomatik yayın başlatıldı!*\n\n⏰ Her *${mins} dakikada* bir, paneldeki duyurular *tüm gruplara* gönderilecek.\n\nDurdurmak için: !otogönder kapat`);
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
