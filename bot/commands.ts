/**
 * MiranBot v3 — Komut İşleyicisi
 * - Admin komutları SADECE !adminburasi ile belirlenen gruptan ve özel sohbette çalışır
 * - Bilgi komutları (!durum vb.) tüm gruplardan çalışır
 * - Davet linki yakalama tüm gruplardan çalışır (invite link avcılığı)
 */
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { getState } from './engine';
import { enqueue } from './queue';
import { getConfig } from '../config';
import { addCustomer, removeCustomer, listCustomers } from '../users';

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
      // Katılım mesajı (isteğe bağlı sessiz)
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

  const infoCommands = new Set([
    'durum', 'botdurum', 'info', 'yardım', 'yardim', 'help', 'komutlar',
    'gruplistesi', 'grupear', 'liste',
  ]);

  const adminCommands = new Set([
    'adminburasi', 'admingrubu', 'ekle', 'musteriekle', 'sil', 'musterisil',
    'otogönder', 'otogonder', 'yedek', 'kapat', 'baglan', 'yenidenbaglan',
  ]);

  // Kapsam kontrolü: info komutları her yerden; admin komutları yalnızca admin grubu/özel
  if (!isAdminGroup && !isPrivate) {
    if (!infoCommands.has(name)) return;
  }

  const sock = state.sock;
  const reply = (t: string) => {
    if (!sock) return;
    enqueue({ sock, jid: from, text: t });
  };

  // ---------------- bilgi komutları ----------------
  if (name === 'durum' || name === 'botdurum' || name === 'info') {
    const st = getState(botId);
    reply(
      `*BOT DURUMU*\n\n` +
        `Durum: ${st.status === 'connected' ? 'Çevrimiçi ✅' : st.activity}\n` +
        `Grup sayısı: ${st.groupCount}\n` +
        (st.lastDisconnectReason ? `Son kopma: ${st.lastDisconnectReason}\n` : '') +
        `Sürüm: MiranBot v3`,
    );
    return;
  }

  if (name === 'yardım' || name === 'yardim' || name === 'help' || name === 'komutlar') {
    reply(
      `*KOMUTLAR*\n\n` +
        `!durum — Bot durumu\n` +
        `!gruplistesi — Grup sayısı\n` +
        `!adminburasi — Bu grubu admin grubu yap\n` +
        `!ekle <isim> <telefon> — Müşteri ekle\n` +
        `!sil <isim> — Müşteri sil\n` +
        `!banabilidir — Davet linki yakalamayı aç`,
    );
    return;
  }

  if (name === 'gruplistesi' || name === 'grupear' || name === 'liste') {
    reply(`Bot şu an *${getState(botId).groupCount}* grupta aktif.`);
    return;
  }

  // ---------------- admin komutları ----------------
  if (!isAdminGroup && !isPrivate) return;

  if (name === 'adminburasi' || name === 'admingrubu') {
    if (!group) {
      reply('Bu komut yalnızca bir grupta çalışır. Admin yapmak istediğiniz grupta yazın.');
      return;
    }
    const cfg = getConfig(botId);
    if (cfg) {
      cfg.adminGroupId = from;
      reply('*Admin grubu bu grup olarak ayarlandı.* ✅');
    }
    return;
  }

  if (name === 'ekle' || name === 'musteriekle') {
    const parts = arg.split(/\s+/);
    if (parts.length < 2) {
      reply('Kullanım: !ekle <müşteri adı> <telefon numarası>');
      return;
    }
    const phone = parts[parts.length - 1];
    const cname = parts.slice(0, -1).join(' ');
    const ok = addCustomer(botId, cname, phone);
    reply(ok ? `Müşteri *${cname}* (${phone}) eklendi ✅` : 'Müşteri eklenemedi.');
    return;
  }

  if (name === 'sil' || name === 'musterisil') {
    if (!arg) {
      reply('Kullanım: !sil <müşteri adı>');
      return;
    }
    const ok = removeCustomer(botId, arg);
    reply(ok ? `Müşteri *${arg}* silindi.` : 'Müşteri bulunamadı.');
    return;
  }

  if (name === 'banabilidir') {
    reply('Davet linki yakalama zaten açık — gruba atılan her chat.whatsapp.com linkine otomatik katılırım.');
    return;
  }

  if (name === 'kapat' || name === 'yenidenbaglan') {
    if (group) {
      reply('Bağlantı işlemleri yalnızca özel sohbette çalışır.');
      return;
    }
    reply('Bağlantı işlemi panel üzerinden yapılmalı. Panele gidin.');
    return;
  }
}
