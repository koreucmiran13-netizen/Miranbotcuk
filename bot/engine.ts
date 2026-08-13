/**
 * MiranBot v3 — Bağlantı Motoru
 * Tek soket garantisi: bir bot için aynı anda ASLA iki bağlantı olmaz.
 * Connect yalnızca connection.update(close) olayından veya açık kullanıcı isteğinden gelir,
 * her zaman tek bir connect kuyruğu üzerinden (mutex).
 */
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import pino from 'pino';

// ---------------------------------------------------------------------------
// Tip ve durum
// ---------------------------------------------------------------------------
export type ConnStatus = 'connected' | 'connecting' | 'waiting_for_qr' | 'disconnected';

export interface BotState {
  id: string;
  sock: WASocket | null;
  status: ConnStatus;
  qr: string | null;
  activity: string;
  groupCount: number;
  lastActivityAt: number; // mesaj akışı saati (watchdog için)
  lastDisconnectReason: string | null;
}

const sessions = new Map<string, BotState>();
const connectMutex = new Map<string, Promise<void>>();

export function getState(id: string): BotState {
  let s = sessions.get(id);
  if (!s) {
    s = {
      id,
      sock: null,
      status: 'disconnected',
      qr: null,
      activity: 'Beklemede. Panelden "Yeni QR" ile bağlanın.',
      groupCount: 0,
      lastActivityAt: 0,
      lastDisconnectReason: null,
    };
    sessions.set(id, s);
  }
  return s;
}

export function allStates(): BotState[] {
  return [...sessions.values()];
}

export { allStates as getStateAll };

/** JSON serialization için circular alanları (sock, timer'lar) atlayan görünüm */
export function publicStates(): object[] {
  return allStates().map((s) => ({
    id: s.id,
    status: s.status,
    qr: s.qr,
    activity: s.activity,
    groupCount: s.groupCount,
    lastDisconnectReason: s.lastDisconnectReason,
  }));
}

// ---------------------------------------------------------------------------
// Oturum dizini ve temiz silme
// ---------------------------------------------------------------------------
function authDir(id: string): string {
  return path.join(process.cwd(), 'sessions', id);
}

export function wipeSession(id: string): void {
  const d = authDir(id);
  if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  const s = getState(id);
  s.sock = null;
  s.qr = null;
}

export function hasSession(id: string): boolean {
  const me = path.join(authDir(id), 'creds.json');
  if (!fs.existsSync(me)) return false;
  try {
    const c = JSON.parse(fs.readFileSync(me, 'utf-8'));
    return Boolean(c?.me?.id);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Baileys sürümü (önbellekli, 10 sn kapılı)
// ---------------------------------------------------------------------------
let versionCache: [number, number, number] | null = null;

async function getVersion(): Promise<[number, number, number] | null> {
  if (versionCache) return versionCache;
  try {
    const res = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
    ]);
    versionCache = (res as any).version ?? null;
    return versionCache;
  } catch (e) {
    console.error('[ENGINE] Sürüm alınamadı, varsayılan kullanılacak.', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tek soketli bağlanma (mutex'li)
// ---------------------------------------------------------------------------
export async function connect(id: string): Promise<void> {
  const state = getState(id);

  // Aynı anda tek deneme garantisi
  const prev = connectMutex.get(id);
  if (prev) return prev;

  const run = (async () => {
    try {
      await doConnect(id, state);
    } finally {
      connectMutex.delete(id);
    }
  })();
  connectMutex.set(id, run);
  return run;
}

async function doConnect(id: string, state: BotState): Promise<void> {
  // Zaten tam bağlıysa dokunma
  if (state.status === 'connected' && state.sock) return;

  // Soket kapatma (temiz kapanış bildirir; logout KULLANMA — cihazı listeden siler)
  if (state.sock) {
    const sock = state.sock;
    state.sock = null;
    try {
      sock.end?.(undefined);
    } catch {}
    // Sunucunun tarafında oturumun kapanması için kısa bekleme
    await sleep(3000);
  }

  state.status = 'connecting';
  state.qr = null;
  state.activity = 'WhatsApp sunucularına bağlanılıyor...';

  const { state: authState, saveCreds } = await useMultiFileAuthState(authDir(id));

  const version = await getVersion();

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: authState,
    logger: pino({ level: 'fatal' }),
    browser: Browsers.macOS('Chrome'),
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: true, // v3.9: chat.whatsapp.com öngörü kartı (Gruba Katıl butonu) için
    markOnlineOnConnect: false,
    emitOwnEvents: false,
    fireInitQueries: false,
    connectTimeoutMs: 20000,
    defaultQueryTimeoutMs: 25000,
    keepAliveIntervalMs: 45000,
    getMessage: async () => ({ conversation: '' }),
  });

  state.sock = sock;
  state.activity = 'Doğrulanıyor... ("Giriş yapılıyor" onayını verdikten sonra bağlı olacak)';

  sock.ev.on('creds.update', () => {
    try {
      saveCreds();
    } catch (e) {
      console.error('[ENGINE] creds kaydedilemedi:', e);
    }
  });

  sock.ev.on('connection.update', (u: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      QRCode.toDataURL(qr)
        .then((dataUrl) => {
          state.qr = dataUrl;
          state.status = 'waiting_for_qr';
          state.activity = 'QR kodu taranması bekleniyor...';
        })
        .catch(() => {});
      return;
    }

    if (connection === 'open') {
      state.status = 'connected';
      state.qr = null;
      state.lastDisconnectReason = null;
      state.activity = 'Çevrimiçi — komutlara cevap veriyor, duyurular gönderiliyor.';
      console.log('[ENGINE] Bağlandı:', id);
      // Grup sayısını arka planda çek
      sock
        .groupFetchAllParticipating()
        .then((g) => {
          state.groupCount = Object.keys(g).length;
        })
        .catch(() => {});
      return;
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const msg = lastDisconnect?.error?.message || '';
      state.sock = null;
      state.qr = null;
      const why = reasonText(code);
      state.lastDisconnectReason = why;
      console.log(`[ENGINE] Kapandı: ${id} kod=${code} (${why}) msg=${msg}`);

      // Oturum tamamen geçersizse kullanıcıdan yeni QR iste
      if (code === DisconnectReason.loggedOut || /badSession|Bad MAC|decryption|invalid/i.test(msg)) {
        state.status = 'disconnected';
        state.activity = 'Oturum geçersiz. Panelden "Yeni QR" ile bağlanın.';
        wipeSession(id);
        return;
      }

      // Bağımsız oturum yoksa (hiç QR taratılmadıysa) QR'a dön
      if (!hasSession(id)) {
        state.status = 'disconnected';
        state.activity = 'Kayıtlı oturum yok. Panelden "Yeni QR" ile bağlanın.';
        return;
      }

      // Geri dönüş: exponential backoff 10s → 120s
      const delay = Math.min(10000 * Math.pow(2, Math.max((state as any).__fail || 0, 0)), 120000);
      (state as any).__fail = Math.min(((state as any).__fail || 0) + 1, 10);
      state.status = 'connecting';
      state.activity = `Bağlantı kesildi (${why}). ${delay / 1000}s sonra yeniden bağlanılacak...`;
      setTimeout(() => void connect(id), delay);
      return;
    }
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function reasonText(code: number | undefined): string {
  if (code === undefined) return 'bilinmeyen';
  const map: Record<number, string> = {
    401: 'oturum geçersiz',
    403: 'erişim yasak',
    408: 'zaman aşımı / ağ kaybı',
    411: 'multidevice uyumsuzluğu',
    428: 'bağlantı kapatıldı',
    440: 'başka cihaz devraldı',
    500: 'bozuk oturum',
    503: 'WhatsApp servisi meşgul',
    515: 'restart gerekli',
  };
  return map[code] ?? `kod ${code}`;
}

// ---------------------------------------------------------------------------
// Watchdog: yalnızca uzun süredir hiçbir olay yoksa ve soket kapalıysa müdahale
// ---------------------------------------------------------------------------
export function startWatchdog(): void {
  setInterval(() => {
    for (const state of sessions.values()) {
      const idle = Date.now() - state.lastActivityAt;
      if (state.sock && idle > 120000) {
        // Soket var ama 2 dakikadır hiç olay gelmedi → muhtemelen ölü
        console.warn('[WATCHDOG] Olay akışı durdu, yeniden bağlanılıyor:', state.id);
        const sock = state.sock;
        state.sock = null;
        try {
          sock.end?.(undefined);
        } catch {}
        state.activity = 'Bağlantı denetleniyor, onarılıyor...';
        void connect(state.id);
      }
    }
  }, 30000);
}
