/**
 * Birim testi: !otogönder <mesaj> <dakika> yeni formatı
 */
import fs from 'fs';
import path from 'path';
import { handleMessages } from './bot/commands';
import { loadConfig, saveConfig } from './config';

const BOT = 'bot1';
const GROUP = '120363411349936508@g.us';

(async () => {
  // Önce admin grubunu kur (komutlar yalnızca admin grubunda çalışır)
  saveConfig({ bots: { [BOT]: { announcements: [], running: false, adminGroupId: GROUP } } });

  const cases: [string, string, boolean][] = [
    ['!otogönder merhaba 5', 'merhaba', true],
    ['!otogönder gunaydin herkese 10', 'gunaydin herkese', true],
    ['!otogönder tek kelime', '', false],
    ['!otogönder', '', false],
    ['!otogönder mesaj x', '', false], // dakika sayı değil
  ];

  for (const [cmd, expectedMsg, expectOk] of cases) {
    const before = loadConfig().bots[BOT]?.announcements.length ?? 0;
    await handleMessages(BOT, { key: { remoteJid: GROUP, fromMe: false }, message: { conversation: cmd } } as any, cmd, GROUP);
    const after = loadConfig().bots[BOT]?.announcements ?? [];
    const added = after.length > before;
    const msg = after[after.length - 1]?.text;
    const status = added === expectOk ? '✅' : '❌';
    console.log(`${status} "${cmd}" → eklendi=${added} (beklenen=${expectOk}) mesaj="${msg}"`);
    if (added !== expectOk) process.exit(1);
    if (added && msg !== expectedMsg) {
      console.log(`❌ Mesaj uyuşmazlığı: "${msg}" !== "${expectedMsg}"`);
      process.exit(1);
    }
  }

  fs.rmSync(path.join(process.cwd(), 'bot_config.json'), { force: true });
  console.log('\n✅ Tüm !otogönder testleri geçti.');
})().catch((e) => {
  console.error('TEST HATASI:', e);
  process.exit(1);
});
