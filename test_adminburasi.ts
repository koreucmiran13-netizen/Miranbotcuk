/**
 * Birim testi: !adminburasi adminGroupId'yi gerçekten kaydediyor mu?
 * Sahte soket + gerçek config.ts akışıyla handleMessages çağrılır.
 */
import fs from 'fs';
import path from 'path';
import { handleMessages } from './bot/commands';
import { loadConfig, saveConfig } from './config';
import * as engine from './bot/engine';

const BOT = 'bot1';
const GROUP_A = '120363411349936508@g.us';

// Test öncesi temiz config
saveConfig({ bots: { [BOT]: { announcements: [], running: false } } });
fs.rmSync(path.join(process.cwd(), 'bot_config.json'), { force: true });

const fakeMsg: any = {
  key: { remoteJid: GROUP_A, fromMe: false },
  message: { conversation: '!adminburasi' },
};

(async () => {
  await handleMessages(BOT, fakeMsg as any, '!adminburasi', GROUP_A);

  const cfg = loadConfig();
  const id = cfg.bots[BOT]?.adminGroupId;
  if (id === GROUP_A) {
    console.log('✅ TEST OK: adminGroupId kaydedildi ->', id);
  } else {
    console.log('❌ TEST FAIL: adminGroupId =', JSON.stringify(cfg.bots[BOT]));
    process.exit(1);
  }

  // Şimdi aynı gruptan !yardım -> isAdminGroup=true olmalı (kayıt sonrası)
  const fakeMsg2: any = {
    key: { remoteJid: GROUP_A, fromMe: false },
    message: { conversation: '!yardım' },
  };
  // enqueue ve reply logları commands.ts'ten geliyor; burada sadece gate'i test ediyoruz:
  // handleMessages içinde reply sock gerektirir; sock yoksa reply sessiz — ama "görmezden gelindi" logu yazılırsa FAIL.
  console.log('\n[TEST] !yardım ikinci çağrısı (adminGroupId artık kayıtlı) — logda "Komut görüldü" görünmeli.');
  await handleMessages(BOT, fakeMsg2 as any, '!yardım', GROUP_A);

  const otherGroup = '999999999999999999@g.us';
  const fakeMsg3: any = {
    key: { remoteJid: otherGroup, fromMe: false },
    message: { conversation: '!yardım' },
  };
  console.log('\n[TEST] !yardım BAŞKA gruptan — logda "görmezden gelindi (admin grubu dışı)" görünmeli.');
  await handleMessages(BOT, fakeMsg3 as any, '!yardım', otherGroup);

  fs.rmSync(path.join(process.cwd(), 'bot_config.json'), { force: true });
  console.log('\n✅ Tüm testler tamamlandı.');
})().catch((e) => {
  console.error('TEST HATASI:', e);
  process.exit(1);
});
