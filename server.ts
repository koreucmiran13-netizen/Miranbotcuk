/**
 * MiranBot v3 — Sunucu
 * - Express API (kimlik, durum, QR, duyuru, müşteri)
 * - messages.upsert dinleyicisi → komut işleyici
 * - paneli dist/ üzerinden servis eder (production)
 */
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getState, getStateAll, publicStates, connect, wipeSession, hasSession, startWatchdog } from './bot/engine';
import { handleMessages } from './bot/commands';
import { startBroadcast, stopBroadcast, isBroadcastRunning, stopAll } from './bot/broadcast';
import { loadConfig, addAnnouncement, removeAnnouncement, setRunning, getConfig, getOrCreateConfig } from './config';
import { listCustomers, addCustomer, removeCustomer } from './users';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '10mb' }));

// Basit kimlik: ADMIN_USER / ADMIN_PASS env'den, yoksa varsayılan
const ADMIN_USER = process.env.ADMIN_USER || 'Miran47';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Miran47';

// ---------------------------------------------------------------
// Kimlik doğrulama (basit token)
// ---------------------------------------------------------------
const tokens = new Map<string, { expires: number }>();

app.post('/api/login', (req, res) => {
  const { user, pass } = req.body;
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, { expires: Date.now() + 86400000 });
    res.json({ success: true, token });
  } else {
    res.json({ success: false });
  }
});

function authed(req: express.Request): boolean {
  const t = req.query.token as string | undefined;
  if (!t) return false;
  const entry = tokens.get(t);
  if (!entry || entry.expires < Date.now()) {
    tokens.delete(t);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------
// Bot yapılandırması (panel için)
// ---------------------------------------------------------------
app.get('/api/config', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const botId = (req.query.botId as string) || 'bot1';
  const c = getConfig(botId);
  res.json({ config: c || { announcements: [], running: false } });
});

// ---------------------------------------------------------------
// Durum
// ---------------------------------------------------------------
app.get('/api/status', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  res.json({ bots: publicStates() });
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: 'miranbot-v3' }));

// Çalışan komut dosyasının hash'i — hangi sürümün YAYINDA olduğunu uzaktan doğrulamak için
app.get('/api/version', (_req, res) => {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'bot', 'commands.ts'), 'utf-8');
    const hash = crypto.createHash('md5').update(raw).digest('hex').slice(0, 12);
    const hasAdminburasi = /name !== 'adminburasi'/.test(raw);
    const hasYardimCheck = /name === 'yardım'/.test(raw);
    const hasOtogonder = /name === 'otogönder'/.test(raw);
    res.json({ code: 'miranbot-v3.4', hash, gate: hasAdminburasi, yardim: hasYardimCheck, otogonder: hasOtogonder });
  } catch {
    res.json({ code: 'unknown' });
  }
});

// ---------------------------------------------------------------
// QR / Bağlan / Kapat
// ---------------------------------------------------------------
app.post('/api/qr', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const { botId } = req.body as { botId?: string };
  if (!botId) return res.json({ success: false });
  getOrCreateConfig(botId); // yeni botlar otomatik kayıt
  const state = getState(botId);
  // QR yalnızca bekleme/bağlı değilse yeni akış aç; zaten QR bekliyorsa mevcut QR'ı döndür
  if (state.status === 'waiting_for_qr') {
    return res.json({ success: true, qr: state.qr });
  }
  void connect(botId);
  // QR oluşana kadar kısa bekle
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (getState(botId).qr) break;
  }
  res.json({ success: true, qr: getState(botId).qr });
});

app.post('/api/reconnect', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const { botId } = req.body as { botId?: string };
  if (!botId) return res.json({ success: false });
  void connect(botId);
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const { botId } = req.body as { botId?: string };
  if (!botId) return res.json({ success: false });
  const state = getState(botId);
  stopBroadcast(botId);
  if (state.sock) {
    try {
      state.sock.end?.(undefined);
    } catch {}
    state.sock = null;
  }
  state.status = 'disconnected';
  state.qr = null;
  wipeSession(botId);
  res.json({ success: true });
});

// ---------------------------------------------------------------
// Duyurular
// ---------------------------------------------------------------
app.post('/api/announcement/add', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const { botId, text, imageUrl, intervalMin } = req.body as {
    botId: string;
    text: string;
    imageUrl?: string;
    intervalMin?: number;
  };
  if (!botId || !text) return res.json({ success: false });
  const ann = {
    id: crypto.randomUUID(),
    text,
    imageUrl: imageUrl || undefined,
    intervalMin: Math.max(Number(intervalMin) || 60, 1),
  };
  addAnnouncement(botId, ann);
  if (isBroadcastRunning(botId)) {
    // Çalışıyorsa restart
    stopBroadcast(botId);
    startBroadcast(botId);
  }
  res.json({ success: true, announcement: ann });
});

app.post('/api/announcement/remove', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const { botId, annId } = req.body as { botId: string; annId: string };
  removeAnnouncement(botId, annId);
  if (isBroadcastRunning(botId)) {
    stopBroadcast(botId);
    startBroadcast(botId);
  }
  res.json({ success: true });
});

app.post('/api/broadcast/start', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const { botId } = req.body as { botId?: string };
  if (!botId) return res.json({ success: false });
  startBroadcast(botId);
  res.json({ success: true });
});

app.post('/api/broadcast/stop', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const { botId } = req.body as { botId?: string };
  if (!botId) return res.json({ success: false });
  stopBroadcast(botId);
  res.json({ success: true });
});

// ---------------------------------------------------------------
// Müşteriler
// ---------------------------------------------------------------
app.get('/api/customers', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const botId = (req.query.botId as string) || 'bot1';
  res.json({ customers: listCustomers(botId) });
});

app.post('/api/customer/add', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const { botId, name, phone } = req.body as { botId: string; name: string; phone: string };
  if (!botId || !name || !phone) return res.json({ success: false });
  res.json({ success: addCustomer(botId, name, phone) });
});

app.post('/api/customer/remove', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const { botId, name } = req.body as { botId: string; name: string };
  if (!botId || !name) return res.json({ success: false });
  res.json({ success: removeCustomer(botId, name) });
});

// ---------------------------------------------------------------
// Kurulum betiği
// ---------------------------------------------------------------
app.get('/api/download/install', (_req, res) => {
  const p = path.join(process.cwd(), 'install.sh');
  if (fs.existsSync(p)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(fs.readFileSync(p, 'utf-8'));
  } else {
    res.status(404).json({ error: 'not found' });
  }
});

// ---------------------------------------------------------------
// Panel (dist/)
// ---------------------------------------------------------------
// dist: önce proje köküne (server.ts'nin yanındaki dist), sonra cwd'ye bak
const __dirHere = path.dirname(new URL(import.meta.url).pathname);
const distDir = fs.existsSync(path.join(__dirHere, 'dist'))
  ? path.join(__dirHere, 'dist')
  : path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ---------------------------------------------------------------
// Mesaj dinleyici (tüm botlar)
// ---------------------------------------------------------------
function attachMessageListener(botId: string): void {
  const state = getState(botId);
  // Her bağlantıda dinleyici yeniden takılır; duplikasyonu önlemek için
  // sock.ev.on'dan önce mevcut listener'ı temizlemeye gerek yok çünkü
  // end() sonrası eski soket olayları zaten ölüyor.
  state.sock?.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    const msg = m.messages[0];
    if (!msg?.message) return;
    const from = msg.key.remoteJid || '';
    if (!from) return;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';
    // Okundu işareti (arka planda)
    const sock = state.sock;
    if (text && sock) {
      sock.readMessages([msg.key]).catch(() => {});
    }
    // Komut işleme (hızlı, arka planda)
    void handleMessages(botId, msg, text, from);
  });
}

// Bağlantı durumunu izleyip dinleyiciyi tak
const origConnect = connect;
// connect'e wrapper değil — engine'deki open olayından sonra listener'ı takmak
// için basit bir polling: status connected ve sock var ama listener yoksa tak.
setInterval(() => {
  for (const state of getStateAll()) {
    if (state.status === 'connected' && state.sock && !(state.sock as any).__listenerAttached) {
      (state.sock as any).__listenerAttached = true;
      attachMessageListener(state.id);
      console.log('[SERVER] Mesaj dinleyicisi takıldı:', state.id);
    }
  }
}, 5000);

// ---------------------------------------------------------------
// Başlat
// ---------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] MiranBot v3 yayında: http://0.0.0.0:${PORT}`);
  startWatchdog();
  // Kayıtlı oturumu olan botları otomatik başlat
  const cfg = loadConfig();
  for (const botId of Object.keys(cfg.bots)) {
    if (hasSession(botId)) {
      void connect(botId);
    }
  }
});
