/**
 * MiranBot — whatsapp-web.js tabanlı 7/24 WhatsApp duyuru botu
 *
 * Komutlar (yalnızca admin grubundan):
 *   !adminburasi           -> grupta komutları açar
 *   !yardim                -> komut listesi
 *   !otogonder <mesaj> <dk -> tüm gruplara periyodik yayın
 *   !dur                   -> yayını durdurur
 *   !liste                 -> aktif duyurular
 *   !temizle               -> tüm duyuruları siler
 *   !katil <link>          -> linkle gruba katıl
 *
 * Davet linki içeren mesajlar WhatsApp'ın "Gruba Katıl" kartını
 * otomatik göstermesi için olduğu gibi (bölünmeden) gönderilir.
 */
import wweb from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = wweb;
import qrcode from "qrcode";
import express from "express";
import fs from "fs";

const PORT = 3000;
const DATA_DIR = "/home/miranbot";
const CONFIG_PATH = `${DATA_DIR}/bot_config.json`;

/* ------------------------------------------------------------------ */
/*  Veri                                                                */
/* ------------------------------------------------------------------ */
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let config = loadConfig();

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH))
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    /* boş */
  }
  return { adminGroupId: null, announcements: [] };
}

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

let qrDataUrl = null; // panelde gösterilecek QR
let authed = false;
let client = null;
let timer = null; // yayın zamanlayıcısı

/* ------------------------------------------------------------------ */
/*  Yardımcılar                                                         */
/* ------------------------------------------------------------------ */
function isAdminGroup(chat) {
  if (!config.adminGroupId) return false;
  return chat.id._serialized === config.adminGroupId;
}

function splitMinute(args) {
  // args: [komut, ...parçalar]. Sondan boşlukla ayrılmış sayı dakikadır.
  let minutes = 10;
  const last = args[args.length - 1];
  const m = String(last).match(/^(\d{1,4})$/);
  const pieces = [...args];
  if (m) {
    minutes = parseInt(m[1], 10);
    pieces.pop();
  }
  const text = pieces.slice(1).join(" ").trim();
  return { minutes, text };
}

function parseInviteLink(text) {
  const m = text.match(/chat\.whatsapp\.com\/([A-Za-z0-9]{20,})/);
  return m ? m[1] : null;
}

/* ------------------------------------------------------------------ */
/*  WhatsApp client                                                     */
/* ------------------------------------------------------------------ */
client = new Client({
  authStrategy: new LocalAuth({ dataPath: DATA_DIR }),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  },
});

client.on("qr", async (qr) => {
  qrDataUrl = await qrcode.toDataURL(qr);
  console.log("[BOT] QR oluşturuldu — panelden tarayın.");
});

client.on("ready", () => {
  authed = true;
  console.log("[BOT] Bağlandı — MiranBot yayında.");
  restartTimer();
});

client.on("disconnected", () => {
  authed = false;
  console.log("[BOT] Bağlantı kesildi, tekrar bağlanıyor...");
});

client.on("remote_session_saved", () => {
  console.log("[BOT] Oturum kaydedildi.");
});

/* ------------------------------------------------------------------ */
/*  Mesaj işleme                                                        */
/* ------------------------------------------------------------------ */
client.on("message", async (msg) => {
  // body ve getChat bazı mesajlarda crash edebilir — güvenli al
  let body, chat;
  try {
    body = (msg.body || "").trim();
  } catch {
    return;
  }
  if (!body) return;

  try {
    chat = await msg.getChat();
  } catch {
    // getChat çökerse mesajı güvenli şekilde atla
    return;
  }
  const isCmd = body.startsWith("!");

  // Komutlar SADECE admin grubundan
  if (isCmd && !isAdminGroup(chat)) {
    console.log(
      `[MSG] Komut dışı grupta görmezden gelindi: "${body.slice(0, 40)}"`,
    );
    return;
  }

  const parts = body.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  try {
    switch (cmd) {
      case "!adminburasi": {
        config.adminGroupId = chat.id._serialized;
        saveConfig();
        await msg.reply(
          "✅ Bu grup admin grubu olarak ayarlandı.\nKomutlar artık yalnızca bu gruptan dinleniyor.",
        );
        return;
      }
      case "!yardim":
        await msg.reply(
          "🤖 *MİRAN BOT — YARDIM*\n\n" +
            "👑 *Komutlar*\n" +
            "• `!adminburasi` — bu grubu admin grubu yapar\n" +
            "• `!yardim` — bu mesajı gösterir\n" +
            "• `!otogonder <mesaj> <dk>` — yayın kurar (dakikada bir)\n" +
            "• `!dur` — yayını durdurur\n" +
            "• `!liste` — aktif duyuruları gösterir\n" +
            "• `!temizle` — tüm duyuruları siler\n" +
            "• `!katil <link>` — linkle gruba katılır\n\n" +
            "📡 *MiranBot v1.0* — 7/24 yayında",
        );
        return;

      case "!otogonder": {
        const { minutes, text } = splitMinute(parts);
        if (!text) {
          await msg.reply(
            "⚠️ Kullanım: `!otogonder mesaj dakika`\nÖrnek: `!otogonder pazara hoş geldiniz 5`",
          );
          return;
        }
        config.announcements = [
          { text, minutes: Math.max(1, Math.min(minutes, 1440)) },
        ];
        saveConfig();
        restartTimer();
        await msg.reply(
          "✅ Otomatik yayın başlatıldı!\n\n" +
            `📨 Mesaj: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"\n` +
            `⏰ Her ${config.announcements[0].minutes} dakikada bir tüm gruplara gönderilecek.\n\n` +
            "Durdurmak için: !dur",
        );
        return;
      }

      case "!dur": {
        config.announcements = [];
        saveConfig();
        restartTimer();
        await msg.reply("⏹ Yayın durduruldu. Duyuru listesi temizlendi.");
        return;
      }

      case "!liste": {
        if (!config.announcements.length) {
          await msg.reply("📋 Aktif duyuru yok.");
          return;
        }
        const lines = config.announcements.map(
          (a, i) => `${i + 1}. "${a.text.slice(0, 50)}${a.text.length > 50 ? "..." : ""}" — her ${a.minutes} dk`,
        );
        await msg.reply("📋 *Aktif Duyurular*\n\n" + lines.join("\n"));
        return;
      }

      case "!temizle": {
        config.announcements = [];
        saveConfig();
        restartTimer();
        await msg.reply("🗑 Tüm duyurular silindi. Yayın durdu.");
        return;
      }

      case "!katil": {
        const linkText = parts.slice(1).join(" ");
        const code = parseInviteLink(linkText);
        if (!code) {
          await msg.reply(
            "⚠️ Kullanım: `!katil <whatsapp grup linki>`\nLinki komutla birlikte yaz.",
          );
          return;
        }
        // Zaten üye mi kontrol et
        const all = await client.getChats();
        const already = all.find(
          (c) => c.isGroup && c.id._serialized.includes(code.slice(0, 8)),
        );
        if (already) {
          await msg.reply(
            "ℹ️ Bu gruba zaten üyesin, tekrar katılmaya gerek yok.",
          );
          return;
        }
        try {
          await client.acceptInvite(code);
          await msg.reply("✅ Gruba başarıyla katıldım!");
        } catch (e) {
          await msg.reply(
            "❌ Katılamadım. Link süresi dolmuş veya banlı olabilir.\nHata: " +
              (e.message || e),
          );
        }
        return;
      }
    }
  } catch (e) {
    console.error(`[ERR] ${cmd} hatası:`, e);
  }
});

/* ------------------------------------------------------------------ */
/*  Yayın motoru                                                        */
/* ------------------------------------------------------------------ */
async function broadcast(text) {
  const chats = await client.getChats();
  const groups = chats.filter((c) => c.isGroup);
  console.log(`[BCAST] Duyuru ${groups.length} gruba gönderiliyor...`);
  for (const g of groups) {
    try {
      // Mesaj olduğu gibi gönderilir — davet linki varsa WhatsApp
      // kendisi "Gruba Katıl" kartını gösterir.
      await g.sendMessage(text, { linkPreview: true });
      await sleep(random(3000, 6000));
    } catch (e) {
      console.error(`[BCAST] ${g.id._serialized} hatası: ${e.message || e}`);
      await sleep(5000);
    }
  }
}

async function runBroadcastLoop() {
  if (!client?.info) return;
  for (const a of config.announcements) {
    try {
      await broadcast(a.text);
    } catch (e) {
      console.error("[BCAST] Döngü hatası:", e);
    }
  }
}

function restartTimer() {
  if (timer) clearInterval(timer);
  if (config.announcements.length) {
    const intervalMs = config.announcements[0].minutes * 60000;
    timer = setInterval(runBroadcastLoop, intervalMs);
    // Kurulunca hemen ilk turu at (önizleme amaçlı admin grubuna)
    runBroadcastLoop();
    console.log(
      `[BCAST] Zamanlayıcı kurulu: her ${config.announcements[0].minutes} dk`,
    );
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/* ------------------------------------------------------------------ */
/*  Panel (Express)                                                     */
/* ------------------------------------------------------------------ */
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(`${DATA_DIR}/panel.html`);
});

// Tüm statik dosyalar
app.use(express.static(DATA_DIR));

app.get("/api/status", (req, res) => {
  res.json({
    authed,
    adminGroupId: config.adminGroupId,
    announcements: config.announcements,
    qr: qrDataUrl,
  });
});

// Grup listesi (admin grubu seçimi kutucukları için)
app.get("/api/groups", async (req, res) => {
  try {
    if (!client?.info) return res.json({ groups: [] });
    const chats = await client.getChats();
    const groups = chats
      .filter((c) => c.isGroup)
      .map((c) => ({
        id: c.id._serialized,
        name: c.name || "İsimsiz Grup",
        selected: c.id._serialized === config.adminGroupId,
      }));
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Admin grubunu panelden seç
app.post("/api/admin-group", async (req, res) => {
  const { groupId } = req.body || {};
  if (!groupId) return res.status(400).json({ error: "groupId gerekli" });
  config.adminGroupId = groupId;
  saveConfig();
  console.log(`[PANEL] Admin grubu seçildi: ${groupId}`);
  res.json({ ok: true, adminGroupId: groupId });
});

// Duyuru ekle
app.post("/api/announcement", async (req, res) => {
  const { text, minutes } = req.body || {};
  if (!text) return res.status(400).json({ error: "Mesaj gerekli" });
  const m = Math.max(1, Math.min(parseInt(minutes) || 10, 1440));
  config.announcements.push({ text, minutes: m });
  saveConfig();
  restartTimer();
  console.log(`[PANEL] Duyuru eklendi: "${text.slice(0, 50)}" her ${m} dk`);
  res.json({ ok: true, announcements: config.announcements });
});

// Duyuru sil (index ile)
app.post("/api/announcement/delete", async (req, res) => {
  const { index } = req.body || {};
  const i = parseInt(index);
  if (isNaN(i) || i < 0 || i >= config.announcements.length) {
    return res.status(400).json({ error: "Geçersiz index" });
  }
  config.announcements.splice(i, 1);
  saveConfig();
  restartTimer();
  res.json({ ok: true, announcements: config.announcements });
});

// Tüm duyuruları temizle
app.post("/api/announcements/clear", async (req, res) => {
  config.announcements = [];
  saveConfig();
  restartTimer();
  res.json({ ok: true, announcements: [] });
});

app.listen(PORT, () => {
  console.log(`[SERVER] Panel: http://localhost:${PORT}`);
});

client.initialize();

/* ------------------------------------------------------------------ */
/*  Panel HTML — panel.html dosyasına yazılıyor (server.js sonunda)   */
/* ------------------------------------------------------------------ */
function _old_panelHtml() {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MiranBot Panel</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
         background:#0b1020; color:#e7ecf5; min-height:100vh; }
  .wrap { max-width:900px; margin:0 auto; padding:24px 16px; }
  h1 { font-size:22px; margin-bottom:4px; }
  h1 span { color:#25D366; }
  .sub { color:#8a94ad; font-size:13px; margin-bottom:24px; }
  .card { background:#131a2e; border:1px solid #1e2944; border-radius:14px;
          padding:20px; margin-bottom:16px; }
  .card h2 { font-size:15px; color:#8a94ad; font-weight:600; margin-bottom:14px;
             text-transform:uppercase; letter-spacing:.5px; }
  .dot { width:10px; height:10px; border-radius:50%; display:inline-block;
         margin-right:8px; }
  .on { background:#25D366; box-shadow:0 0 8px #25D366; }
  .off { background:#ff5a5f; }
  #qr { max-width:280px; border-radius:12px; }
  .pill { display:inline-block; background:#1c2745; border-radius:999px;
          padding:6px 14px; font-size:13px; margin:2px 4px 2px 0; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { text-align:left; color:#8a94ad; font-weight:600; padding:8px 10px;
       border-bottom:1px solid #1e2944; }
  td { padding:10px; border-bottom:1px solid #141d34; }
  button { background:#25D366; color:#062213; border:none; border-radius:10px;
           padding:10px 18px; font-size:14px; font-weight:700; cursor:pointer; }
  button.secondary { background:#1c2745; color:#e7ecf5; }
</style>
</head>
<body>
<div class="wrap">
  <h1><span>🤖</span> MiranBot Panel</h1>
  <p class="sub">7/24 WhatsApp duyuru botu — whatsapp-web.js</p>

  <div class="card">
    <h2>Durum</h2>
    <p id="statusLine">Yükleniyor...</p>
  </div>

  <div class="card" id="qrCard" style="display:none">
    <h2>QR Kodu</h2>
    <p style="color:#8a94ad;font-size:13px;margin-bottom:12px">
      Telefon WhatsApp → Bağlı Cihazlar → QR tarat
    </p>
    <img id="qr" src="" alt="QR" />
  </div>

  <div class="card">
    <h2>Aktif Duyurular</h2>
    <table id="annTbl">
      <thead><tr><th>#</th><th>Mesaj</th><th>Aralık</th></tr></thead>
      <tbody id="annBody"><tr><td colspan="3">Yükleniyor...</td></tr></tbody>
    </table>
  </div>

  <div class="card">
    <h2>Hızlı İşlem</h2>
    <p style="font-size:13px;color:#8a94ad;margin-bottom:12px">
      Tüm duyuruları silmek (yayını durdur) için:
    </p>
    <button onclick="clearAll()">🗑 Tüm Duyuruları Temizle</button>
  </div>
</div>
<script>
  async function load(){
    const r = await fetch("/api/status");
    const d = await r.json();
    document.getElementById("statusLine").innerHTML =
      '<span class="dot ' + (d.authed ? "on" : "off") + '"></span>' +
      (d.authed ? "Bağlı — 7/24 yayında" : "QR bekleniyor — aşağıdan taratın");
    const qrCard = document.getElementById("qrCard");
    if (!d.authed && d.qr){
      qrCard.style.display = "block";
      document.getElementById("qr").src = d.qr;
    } else { qrCard.style.display = "none"; }
    const tb = document.getElementById("annBody");
    if (!d.announcements || !d.announcements.length){
      tb.innerHTML = '<tr><td colspan="3">Aktif duyuru yok</td></tr>';
    } else {
      tb.innerHTML = d.announcements.map((a,i)=>
        '<tr><td>' + (i+1) + '</td><td>' + escapeHtml(a.text) +
        '</td><td>her ' + a.minutes + ' dk</td></tr>').join("");
    }
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;" }[c]));
  }
  async function clearAll(){
    if (!confirm("Tüm duyuruları silip yayını durdurmak istediğinize emin misiniz?")) return;
    // Temizleme WhatsApp komutuyla yapılır: admin grubundan !temizle
    alert("Temizlemek için admin grubundan !temizle yazın.");
  }
  load();
  setInterval(load, 5000);
</script>
</body>
</html>`;
}
