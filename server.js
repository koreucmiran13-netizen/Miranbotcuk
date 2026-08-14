/**
 * MiranBot v2.0 — WhatsApp Duyuru Botu
 * whatsapp-web.js tabanlı, 7/24 stabil, profesyonel panel
 *
 * Komutlar (yalnızca admin grubundan):
 *   !adminburasi    → grupta komutları açar
 *   !yardim         → komut listesi
 *   !otogonder <mesaj> <dk> → tüm gruplara periyodik yayın
 *   !durdur         → yayını durdurur
 *   !liste          → aktif duyuruları listeler
 *   !temizle        → tüm duyuruları siler
 *   !katil <link>   → davet linkiyle gruba katılır
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const express = require("express");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------
const PORT = 3000;
const CONFIG_PATH = path.join(__dirname, "bot_config.json");
const SESSION_DIR = path.join(__dirname, ".session");
const PUBLIC_DIR = __dirname; // panel.html aynı dizinde

// ---------------------------------------------------------------------------
// Konfigürasyon (JSON dosyadan oku/yaz)
// ---------------------------------------------------------------------------
let config = loadConfig();

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }
  } catch (e) {
    console.error("[CONFIG] Konfigürasyon okuma hatası:", e.message);
  }
  return {
    adminGroupId: null,
    announcements: [], // { id, text, interval }
  };
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log("[CONFIG] Kaydedildi");
  } catch (e) {
    console.error("[CONFIG] Kaydetme hatası:", e.message);
  }
}

// ---------------------------------------------------------------------------
// Grup cache — getChats() inject sorunu nedeniyle mesajlardan öğreniyoruz
// ---------------------------------------------------------------------------
const groupCache = {}; // chatId -> { id, name, lastSeen }

function addToGroupCache(chatId, chatName) {
  if (chatId && chatId.includes("@g.us")) {
    if (!groupCache[chatId]) {
      groupCache[chatId] = { id: chatId, name: null, lastSeen: Date.now() };
      console.log(`[CACHE] Yeni grup bulundu: ${chatId}`);
    }
    groupCache[chatId].lastSeen = Date.now();
    if (chatName && !groupCache[chatId].name) {
      groupCache[chatId].name = chatName;
    }
  }
}

function isAdminGroup(chatId) {
  return config.adminGroupId && chatId === config.adminGroupId;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------------------------------------------------------------------------
// Yayın motoru
// ---------------------------------------------------------------------------
let broadcastTimer = null;
let broadcastRunning = false;

async function broadcast(text) {
  if (!client?.info) return;

  // Grupları topla: getChats() + cache
  const groupIds = new Set(Object.keys(groupCache));

  // getChats() dene (çalışırsa ek gruplar gelir)
  try {
    const chats = await client.getChats();
    for (const c of chats) {
      if (c.isGroup && c.id?._serialized) {
        groupIds.add(c.id._serialized);
      }
    }
  } catch (e) {
    console.error("[BCAST] getChats hatası:", e.message || e);
  }

  const ids = Array.from(groupIds);
  console.log(`[BCAST] Duyuru ${ids.length} gruba gönderiliyor: "${text.slice(0, 50)}..."`);

  for (const gid of ids) {
    try {
      const chat = await client.getChatById(gid);
      if (chat) {
        await chat.sendMessage(text, { linkPreview: true });
        console.log(`[BCAST] ✓ Gönderildi: ${gid.slice(0, 24)}...`);
      }
      await sleep(random(3000, 6000)); // Spam önleme
    } catch (e) {
      console.error(`[BCAST] ✗ Hata ${gid.slice(0, 24)}: ${e.message || e}`);
    }
  }

  console.log("[BCAST] Yayın tamamlandı");
}

function startBroadcastLoop() {
  if (!config.announcements.length) return;
  if (broadcastTimer) return;

  broadcastRunning = true;
  console.log(`[BCAST] Döngü başladı — ${config.announcements.length} duyuru aktif`);

  // İlk duyuruyu hemen gönder
  broadcast(config.announcements[0].text);

  broadcastTimer = setInterval(() => {
    if (config.announcements.length > 0) {
      broadcast(config.announcements[0].text);
    }
  }, config.announcements[0].interval * 60 * 1000);
}

function stopBroadcast() {
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  broadcastRunning = false;
  console.log("[BCAST] Döngü durduruldu");
}

// ---------------------------------------------------------------------------
// WhatsApp Client
// ---------------------------------------------------------------------------
let client = null;

const browserArgs = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-gpu",
];

function createClient() {
  return new Client({
    authStrategy: new LocalAuth({ dataDir: SESSION_DIR }),
    headless: true,
    puppeteer: {
      headless: true,
      args: browserArgs,
    },
    webVersionCache: { type: "local" },
  });
}

// ---------------------------------------------------------------------------
// Express Panel
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Ana dizine panel.html gönder
app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "panel.html"));
});

let qrDataUrl = null;
let isConnected = false;

// QR endpoint
app.get("/api/qr", (req, res) => {
  res.json({ qr: qrDataUrl, connected: isConnected });
});

// QR yenile
app.post("/api/qr-refresh", async (req, res) => {
  try {
    if (client?.info) {
      await client.logout();
      client = null;
    }
    qrDataUrl = null;
    isConnected = false;
    client = createClient();
    setupClient(client);
    client.initialize();
    console.log("[API] QR yenileniyor...");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// Durum endpoint
app.get("/api/status", (req, res) => {
  res.json({
    connected: isConnected,
    adminGroupId: config.adminGroupId,
    announcementCount: config.announcements.length,
    broadcastRunning: broadcastRunning,
    uptime: process.uptime(),
    groups: Object.keys(groupCache).length,
  });
});

// Grup listesi (admin grubu seçimi)
app.get("/api/groups", (req, res) => {
  const groups = Object.values(groupCache).map((g) => ({
    id: g.id,
    name: g.name || g.id.split("@")[0].slice(0, 16),
    selected: g.id === config.adminGroupId,
  }));
  res.json({ groups });
});

// Admin grubunu seç
app.post("/api/admin-group", (req, res) => {
  const { groupId } = req.body || {};
  if (!groupId) return res.status(400).json({ error: "groupId gerekli" });
  config.adminGroupId = groupId;
  saveConfig();
  console.log(`[API] Admin grubu: ${groupId}`);
  res.json({ ok: true, adminGroupId: groupId });
});

// Duyuru ekle
app.post("/api/announcement", (req, res) => {
  const { text, interval } = req.body || {};
  if (!text) return res.status(400).json({ error: "Mesaj gerekli" });
  const minutes = parseInt(interval) || 10;

  const ann = { id: randomId(), text, interval: minutes };
  config.announcements.push(ann);
  saveConfig();

  // Yayını yeniden başlat
  stopBroadcast();
  startBroadcastLoop();

  // İlk duyuruyu hemen admin grubuna gönder (hata kontrolü)
  if (config.adminGroupId) {
    client
      ?.getChatById(config.adminGroupId)
      ?.then((c) => c?.sendMessage("📢 Yeni duyuru eklendi ve yayın başladı"))
      .catch(() => {});
  }

  console.log(`[API] Duyuru eklendi: "${text.slice(0, 30)}..." (${minutes} dk)`);
  res.json({ ok: true, announcement: ann });
});

// Duyuru sil
app.delete("/api/announcement/:id", (req, res) => {
  const id = req.params.id;
  config.announcements = config.announcements.filter((a) => a.id !== id);
  saveConfig();
  stopBroadcast();
  startBroadcastLoop();
  res.json({ ok: true });
});

// Tüm duyuruları temizle
app.delete("/api/announcements", (req, res) => {
  config.announcements = [];
  saveConfig();
  stopBroadcast();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Client olayları
// ---------------------------------------------------------------------------
function setupClient(c) {
  c.on("qr", (qr) => {
    console.log("[BOT] QR oluşturuldu — panelden tarayın");
    qrcode.toDataURL(qr).then((dataUrl) => {
      qrDataUrl = dataUrl;
    });
  });

  c.on("ready", () => {
    console.log("[BOT] Bağlandı — MiranBot yayında");
    isConnected = true;
    qrDataUrl = null;
    startBroadcastLoop();
  });

  c.on("disconnected", (reason) => {
    console.error("[BOT] Bağlantı kesildi:", reason);
    isConnected = false;
  });

  c.on("auth_failure", (msg) => {
    console.error("[BOT] Kimlik doğrulama hatası:", msg);
    isConnected = false;
  });

  c.on("message", async (msg) => {
    try {
      // Mesaj içeriğini güvenli şekilde al
      let body = "";
      try {
        body = msg.body || "";
      } catch {
        return;
      }
      if (!body) return;

      const chatId = msg.from || msg.to || "";
      const trimmed = body.trim();

      // Grup cache'e ekle
      addToGroupCache(chatId, null);

      // Davet linki içeren mesajları otomatik işle (!katil gerekmeden)
      if (!trimmed.startsWith("!")) {
        // Davet linki tespit et
        const inviteMatch = trimmed.match(
          /chat\.whatsapp\.com\/([A-Za-z0-9]{20,})/,
        );
        if (inviteMatch) {
          const inviteCode = inviteMatch[1];
          console.log(
            `[MSG] Davet linki bulundu: ${inviteCode} (${chatId.slice(0, 20)})`,
          );
          try {
            await c.acceptInvite(inviteCode);
            console.log(`[MSG] ✓ Gruba katıldı: ${inviteCode}`);
          } catch (e) {
            console.error(`[MSG] ✗ Katılım hatası: ${e.message || e}`);
          }
        }
        return;
      }

      const isCmd = trimmed.startsWith("!");
      if (isCmd && !isAdminGroup(chatId)) {
        // Komut dışı gruptan gelen komutları görmezden gel
        return;
      }

      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      console.log(`[CMD] Komut: ${cmd} (${chatId.slice(0, 20)}...)`);

      try {
        await handleCommand(c, msg, chatId, cmd, args, trimmed);
      } catch (e) {
        console.error(`[CMD] İşleme hatası: ${e.message || e}`);
      }
    } catch (e) {
      // Top-level güvenli — hiçbir crash süreci öldürmesin
      console.error("[MSG] Handler hatası:", e.message || e);
    }
  });

  c.on("message_revoke_me", () => {});
  c.on("message_ack", () => {});
}

// ---------------------------------------------------------------------------
// Komut işleyici
// ---------------------------------------------------------------------------
async function handleCommand(c, msg, chatId, cmd, args, fullText) {
  switch (cmd) {
    case "!adminburasi": {
      config.adminGroupId = chatId;
      saveConfig();
      await msg.reply(
        "👑 Bu grup admin grubu olarak ayarlandı!\nKomutlar artık yalnızca bu gruptan dinleniyor.",
      );
      break;
    }

    case "!yardim":
    case "!yardım": {
      const helpText = [
        "╔══════════════════════════╗",
        "║   🤖 *MİRAÑBOT* 🤖      ║",
        "╠══════════════════════════╣",
        "║                          ║",
        "║  👑 *Yönetim:*           ║",
        "║  !adminburasi  → Bu grubu",
        "║                admin yap ║",
        "║                          ║",
        "║  📢 *Duyuru:*            ║",
        "║  !otogonder <msg> <dk>   ║",
        "║              → Tüm gruplara",
        "║                periyodik   ║",
        "║  !durdur       → Yayını durdur",
        "║  !liste        → Duyuruları listele",
        "║  !temizle      → Duyuruları sil",
        "║                          ║",
        "║  🚪 *Katılım:*           ║",
        "║  !katil <link>  → Linkle katıl",
        "║  (veya linki direkt at)  ║",
        "║                          ║",
        "╚══════════════════════════╝",
      ].join("\n");
      await msg.reply(helpText);
      break;
    }

    case "!otogonder":
    case "!otogönder": {
      // Format: !otogonder <mesaj> <dakika>
      // Mesajın son kelimesi sayıysa dakikadır
      if (args.length < 2) {
        await msg.reply(
          "⚠️ Kullanım: !otogonder <mesaj> <dakika>\nÖrnek: !otogonder Merhaba herkese 10",
        );
        return;
      }

      const lastArg = args[args.length - 1];
      const minutes = parseInt(lastArg);

      let text;
      if (!isNaN(minutes)) {
        // Son argüman sayı — dakikadır
        text = args.slice(0, -1).join(" ");
      } else {
        // Sayı yoksa varsayılan 10 dk
        text = args.join(" ");
      }

      if (!text.trim()) {
        await msg.reply("⚠️ Mesaj boş olamaz!");
        return;
      }

      config.announcements = [{ id: randomId(), text, interval: minutes || 10 }];
      saveConfig();
      stopBroadcast();
      startBroadcastLoop();

      await msg.reply(
        `✅ Duyuru başlatıldı!\n📝 Mesaj: ${text}\n⏰ Aralık: ${minutes || 10} dakika\n📢 Tüm gruplara gönderilecek.`,
      );
      console.log(
        `[CMD] Yayın başladı: "${text.slice(0, 30)}" / ${minutes || 10} dk`,
      );
      break;
    }

    case "!durdur": {
      config.announcements = [];
      saveConfig();
      stopBroadcast();
      await msg.reply("⏹️ Yayın durduruldu. Tüm duyurular temizlendi.");
      break;
    }

    case "!liste": {
      if (!config.announcements.length) {
        await msg.reply("📋 Aktif duyuru yok.");
        return;
      }
      const list = config.announcements
        .map(
          (a, i) =>
            `${i + 1}. ${a.text.slice(0, 40)}... (${a.interval} dk) [${a.id}]`,
        )
        .join("\n");
      await msg.reply(`📋 Aktif Duyurular:\n${list}`);
      break;
    }

    case "!temizle": {
      config.announcements = [];
      saveConfig();
      stopBroadcast();
      await msg.reply("🗑️ Tüm duyurular temizlendi.");
      break;
    }

    case "!katil":
    case "!katıl": {
      const link = args[0] || "";
      const match =
        link.match(/chat\.whatsapp\.com\/([A-Za-z0-9]{20,})/) ||
        link.match(/([A-Za-z0-9]{20,})/);
      if (!match) {
        await msg.reply("⚠️ Kullanım: !katil <davet-linki>\nÖrnek: !katil https://chat.whatsapp.com/ABCDEF...");
        return;
      }
      const inviteCode = match[1];
      try {
        await c.acceptInvite(inviteCode);
        await msg.reply("✅ Gruba katıldım!");
      } catch (e) {
        await msg.reply(`❌ Katılamadım: ${e.message || e}`);
      }
      break;
    }

    default:
      // Bilinmeyen komut — cevap verme
      break;
  }
}

// ---------------------------------------------------------------------------
// Başlat
// ---------------------------------------------------------------------------
async function main() {
  // Express başlat
  app.listen(PORT, () => {
    console.log(`[SERVER] Panel: http://localhost:${PORT}`);
  });

  // WhatsApp client başlat
  try {
    client = createClient();
    setupClient(client);
    await client.initialize();
    console.log("[BOT] Client başlatıldı, QR bekleniyor...");
  } catch (e) {
    console.error("[BOT] Başlatma hatası:", e.message);
  }

  // Otomatik yeniden bağlanma (crash koruması) — 5 dk interval
  setInterval(() => {
    if (isConnected) return; // Bağlıysa devam
    console.log("[BOT] Otomatik yeniden bağlanma...");
    try {
      client = createClient();
      setupClient(client);
      client.initialize().catch((e) => {
        console.error("[BOT] Restart hatası:", e.message);
      });
    } catch (e) {
      console.error("[BOT] Restart hatası:", e.message);
    }
  }, 300000); // 5 dakika
}

process.on("unhandledRejection", (e) => {
  console.error("[UNHANDLED] Promise rejection:", e);
});

process.on("uncaughtException", (e) => {
  console.error("[UNHANDLED] Exception:", e);
});

main().catch((e) => {
  console.error("[FATAL] Başlatma hatası:", e);
  process.exit(1);
});
