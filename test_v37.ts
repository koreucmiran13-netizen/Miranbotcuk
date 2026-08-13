/**
 * v3.7 testi: emoji önkeli komut mesajı algılanıyor mu?
 */
process.on('unhandledRejection', (e) => { console.error('ASYNC HATA:', e); process.exit(2); });
import fs from 'fs';
import path from 'path';
import { handleMessages } from './bot/commands';
import { loadConfig, saveConfig } from './config';
import { stopBroadcast } from './bot/broadcast';

const BOT = 'bot1';
const GROUP = '120363411349936508@g.us';

(async () => {
  saveConfig({ bots: { [BOT]: { announcements: [], running: false, adminGroupId: GROUP } } });

  const cases: [string, string | null, number][] = [
    ['✅ _!otogönder merhaba 5 _', 'merhaba', 5],
    ['!otogönder merhaba 5', 'merhaba', 5],
    ['💥 _!yardım_', null, 0], // yardım reply üretir ama config değişmez
    ['normal mesaj ! işareti içeriyor', null, 0], // bilinen komut değil
  ];

  console.log('CONFIG BAŞLANGIÇ:', JSON.stringify(loadConfig()));
  for (const [raw, expectedMsg, expectedMins] of cases) {
    console.log('--- CASE:', raw);
    const before = loadConfig().bots[BOT]?.announcements.length ?? 0;
    console.log('  before:', before);
    const text = raw;
    const from = GROUP;
    try {
      await handleMessages(BOT, { key: { remoteJid: from, fromMe: false }, message: { conversation: raw } } as any, text, from);
    } catch (e) {
      console.error('HANDLE HATASI:', e);
      process.exit(2);
    }
    const after = loadConfig().bots[BOT]?.announcements ?? [];
    if (expectedMsg) {
      const added = after.length > before;
      const item = after[after.length - 1];
      const ok = added && item.text === expectedMsg && item.intervalMin === expectedMins;
      console.log(`${ok ? '✅' : '❌'} "${raw}" → ${added ? `text="${item.text}" min=${item.intervalMin}` : 'eklenmedi'}`);
      if (!ok) process.exit(1);
    } else {
      const changed = (loadConfig().bots[BOT]?.announcements.length ?? 0) !== before;
      console.log(`${!changed ? '✅' : '❌'} "${raw}" → config değişmedi (${changed ? 'DEĞİŞTİ!' : 'doğru'})`);
      if (changed) process.exit(1);
    }
  }

  fs.rmSync(path.join(process.cwd(), 'bot_config.json'), { force: true });
  stopBroadcast(BOT);
  console.log('\n✅ v3.7 testleri geçti.');
  process.exit(0);
})().catch((e) => {
  console.error('TEST HATASI:', e);
  process.exit(1);
});
