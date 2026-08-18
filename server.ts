import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { 
  makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  type WASocket,
  downloadMediaMessage,
  getUrlInfo,
  Browsers
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import type { Boom } from '@hapi/boom';
import { GoogleGenAI } from '@google/genai';

const geminiClient = new GoogleGenAI({
  apiKey: "AIzaSyCLgF1-_vAyXVYP2ZMVfk0P2rTR8WrpT2g",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const host = '0.0.0.0';

app.use(cors());
app.use(express.json());

// Bot Config Management
const CONFIG_FILE = path.join(process.cwd(), 'bot_config.json');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface Broadcast {
  id: string;
  message: string;
  interval: number; // minutes
  imageUrl?: string;
  lastSent?: number;
}

interface BotConfig {
  adminGroupId: string;
  broadcasts: Broadcast[];
  isActive: boolean;
  guardEnabled: boolean;
  seenInvites: string[];
  notifyJids: string[];
  sentCount?: number;
}

const USERS_FILE = path.join(process.cwd(), 'users.json');

interface User {
  username: string;
  password: string;
  role: 'admin' | 'user';
  botId: string;
  expiresAt?: string;
}

let users: User[] = [];

function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch (e) {
      console.error('Error loading users:', e);
    }
  }
  if (users.length === 0) {
    users.push({
      username: 'Miran47',
      password: 'Miran47',
      role: 'admin',
      botId: 'bot1'
    });
    saveUsers();
  } else {
    // If old admin exists, migrate it to the new credentials
    const adminIdx = users.findIndex(u => u.role === 'admin');
    if (adminIdx !== -1 && users[adminIdx].username === 'admin') {
      users[adminIdx].username = 'Miran47';
      users[adminIdx].password = 'Miran47';
      saveUsers();
    }
  }
}

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function checkExpirations() {
  loadUsers();
  const todayStr = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
  let configChanged = false;
  
  users.forEach(user => {
    if (user.role === 'user' && user.expiresAt && user.expiresAt < todayStr) {
      const botId = user.botId;
      const config = multiBotConfig[botId];
      if (config && config.isActive) {
        console.log(`[EXPIRATION] [${botId}] Rental expired for user ${user.username} (${user.expiresAt}). Deactivating bot...`);
        config.isActive = false;
        configChanged = true;
        const instance = bots[botId];
        if (instance) {
          instance.activity = 'Kiralama süresi dolduğu için bot pasife alındı.';
          if (instance.sock) {
            try { instance.sock.ws.close(); } catch (e) {}
            instance.sock = null;
          }
          instance.connectionStatus = 'disconnected';
          instance.qrCode = null;
        }
      }
    }
  });
  
  if (configChanged) {
    saveConfig();
  }
}

let BOT_IDS: string[] = [];

function initBotIds() {
  loadUsers();
  const ids = new Set<string>();
  ids.add('bot1');
  users.forEach(u => {
    if (u.botId) {
      ids.add(u.botId);
    }
  });
  BOT_IDS = Array.from(ids);
}

let multiBotConfig: Record<string, BotConfig> = {};

function getDefaultConfig(): BotConfig {
  return {
    adminGroupId: '',
    broadcasts: [],
    isActive: false,
    guardEnabled: false,
    seenInvites: [],
    notifyJids: [],
    sentCount: 0
  };
}

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      multiBotConfig = data;
    } catch (e) {
      console.error('Error loading config:', e);
    }
  }
  // Initialize missing bots
  BOT_IDS.forEach(id => {
    if (!multiBotConfig[id]) multiBotConfig[id] = getDefaultConfig();
    if (!multiBotConfig[id].seenInvites) multiBotConfig[id].seenInvites = [];
    if (!multiBotConfig[id].broadcasts) multiBotConfig[id].broadcasts = [];
    if (!multiBotConfig[id].notifyJids) multiBotConfig[id].notifyJids = [];
    if (multiBotConfig[id].sentCount === undefined) multiBotConfig[id].sentCount = 0;
  });
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(multiBotConfig, null, 2));
}

// Run initializers
initBotIds();
loadConfig();

interface BotInstance {
  id: string;
  sock: WASocket | null;
  qrCode: string | null;
  pairingCode: string | null;
  pairingPhone: string | null;
  connectionStatus: 'connected' | 'disconnected' | 'waiting_for_qr' | 'connecting';
  reconnectTimeout: NodeJS.Timeout | null;
  activity?: string;
  groupCount?: number;
  participatingGroups?: Record<string, any>;
  participatingGroupsLastFetch?: number;
}

const bots: Record<string, BotInstance> = {};

async function getParticipatingGroups(botId: string, force = false): Promise<Record<string, any>> {
  const instance = bots[botId];
  if (!instance || !instance.sock) return {};
  
  const now = Date.now();
  // Cache for 5 minutes (300,000 ms)
  if (!force && instance.participatingGroups && instance.participatingGroupsLastFetch && (now - instance.participatingGroupsLastFetch < 300000)) {
    return instance.participatingGroups;
  }
  
  try {
    const groupsRaw = await instance.sock.groupFetchAllParticipating();
    instance.participatingGroups = groupsRaw;
    instance.participatingGroupsLastFetch = now;
    instance.groupCount = Object.keys(groupsRaw).length;
    return groupsRaw;
  } catch (err) {
    console.error(`[CONN] [${botId}] Error fetching participating groups:`, err);
    return instance.participatingGroups || {};
  }
}

function initBotInstance(botId: string) {
  if (!bots[botId]) {
    bots[botId] = { 
      id: botId, 
      sock: null, 
      qrCode: null, 
      pairingCode: null, 
      pairingPhone: null, 
      connectionStatus: 'disconnected', 
      reconnectTimeout: null, 
      activity: 'Çevrimdışı (Bağlantı kesildi)', 
      groupCount: 0 
    };
  }
  if (!multiBotConfig[botId]) {
    multiBotConfig[botId] = getDefaultConfig();
  }
}

function addBotRuntime(botId: string) {
  if (!BOT_IDS.includes(botId)) {
    BOT_IDS.push(botId);
  }
  initBotInstance(botId);
  saveConfig();
  connectToWhatsApp(botId);
}

// Initialize all configured bots at startup
BOT_IDS.forEach(id => {
  initBotInstance(id);
});

const groupAdminsCache: Record<string, { admins: string[], timestamp: number }> = {};

async function isUserAdmin(botId: string, groupId: string, userId: string) {
  const instance = bots[botId];
  if (!instance || !instance.sock) return false;
  const now = Date.now();
  const cacheKey = `${botId}_${groupId}`;
  if (!groupAdminsCache[cacheKey] || now - groupAdminsCache[cacheKey].timestamp > 60000) {
    try {
      const meta = await instance.sock.groupMetadata(groupId);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);
      groupAdminsCache[cacheKey] = { admins, timestamp: now };
    } catch (_e) {
      return false;
    }
  }
  
  let baseUserId = userId.split(':')[0];
  if (baseUserId.includes('@')) {
    baseUserId = baseUserId.split('@')[0];
  }
  baseUserId = baseUserId + '@s.whatsapp.net';
  
  return groupAdminsCache[cacheKey]?.admins.includes(baseUserId);
}

async function safeSendMessage(botId: string, jid: string, content: any, options?: any) {
  const instance = bots[botId];
  try {
    if (!instance || !instance.sock || instance.connectionStatus !== 'connected') {
      console.error(`[SEND] Failed: Bot ${botId} not connected (Status: ${instance?.connectionStatus}). JID: ${jid}`);
      return null;
    }
    const result = await instance.sock.sendMessage(jid, content, options);
    console.log(`[SEND] [${botId}] Success to ${jid}`);
    return result;
  } catch (err) {
    console.error(`[SEND] [${botId}] Error to ${jid}:`, err);
    return null;
  }
}

async function connectToWhatsApp(botId: string, phoneNumber?: string) {
  const instance = bots[botId];
  const authDir = path.join(process.cwd(), `auth_info_baileys_${botId}`);
  const credsPath = path.join(authDir, 'creds.json');
  const backupZipPath = path.join(process.cwd(), `auth_info_baileys_${botId}_backup.zip`);
  
  if (phoneNumber) {
    instance.pairingPhone = phoneNumber;
  }

  if (instance.reconnectTimeout) {
    clearTimeout(instance.reconnectTimeout);
    instance.reconnectTimeout = null;
  }
  instance.connectionStatus = 'connecting';
  instance.activity = 'WhatsApp sunucularına bağlanmaya çalışıyor...';

  // Restore session from backup if the local auth directory is missing or empty
  if (!fs.existsSync(credsPath) && fs.existsSync(backupZipPath)) {
    console.log(`[CONN] [${botId}] Auth credentials missing but backup zip found. Restoring...`);
    try {
      const zip = new AdmZip(backupZipPath);
      zip.extractAllTo(authDir, true);
      console.log(`[CONN] [${botId}] Auth credentials restored successfully from backup.`);
    } catch (restoreErr) {
      console.error(`[CONN] [${botId}] Failed to restore backup:`, restoreErr);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  
  let version: [number, number, number] | undefined = undefined;
  try {
    const res = await fetchLatestBaileysVersion();
    version = res.version;
  } catch (e) {
    console.error(`[CONN] [${botId}] Failed to fetch version, letting Baileys use its default stable version:`, e);
  }

  instance.qrCode = null;

  if (instance.sock) {
    try {
      instance.sock.ws.close();
    } catch(e) {}
  }

  instance.sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    browser: ['Mac OS', 'Chrome', '114.0.5735.198'],
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    emitOwnEvents: false,
    getMessage: async (key: any) => {
      return { conversation: '' };
    }
  });

  // Handle Pairing Code request if specified
  if (instance.pairingPhone && !state.creds.registered) {
    setTimeout(async () => {
      try {
        if (instance.sock && !instance.sock.authState.creds.registered) {
          console.log(`[CONN] [${botId}] Requesting pairing code for ${instance.pairingPhone}`);
          const code = await instance.sock.requestPairingCode(instance.pairingPhone);
          instance.pairingCode = code;
          instance.connectionStatus = 'waiting_for_qr'; // Same flow UI
          console.log(`[CONN] [${botId}] Generated Pairing Code: ${code}`);
        }
      } catch (err) {
        console.error(`[CONN] [${botId}] Failed to request pairing code:`, err);
      }
    }, 4000);
  }

  instance.sock.ev.on('creds.update', saveCreds);

  instance.sock.ev.on('connection.update', async (update) => {
    fs.appendFileSync('conn_log.txt', JSON.stringify({ botId, update }) + '\n');
    const { connection, lastDisconnect, qr } = update;

    if (qr && !instance.pairingPhone) {
      console.log(`[CONN] [${botId}] QR Code received`);
      try {
        instance.qrCode = await QRCode.toDataURL(qr);
        instance.connectionStatus = 'waiting_for_qr';
        instance.activity = 'QR kodu taranması bekleniyor...';
      } catch (err) {
        console.error(`[CONN] [${botId}] Failed to generate QR string:`, err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || '';
      const errorStr = lastDisconnect?.error?.toString() || '';
      const errorStack = lastDisconnect?.error?.stack || '';

      const isBadSession = 
        statusCode === DisconnectReason.badSession || 
        errorMessage.includes('Bad MAC') || 
        errorStr.includes('Bad MAC') || 
        errorStack.includes('Bad MAC') ||
        errorMessage.includes('decryption') ||
        errorStr.includes('decryption');
      
      instance.qrCode = null;

      console.log(`[CONN] [${botId}] Connection closed. Code: ${statusCode}, Error: ${errorMessage}`);
      
      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`[CONN] [${botId}] Session logged out explicitly. Deleting session and backup.`);
        instance.connectionStatus = 'disconnected';
        instance.pairingCode = null;
        instance.pairingPhone = null;
        instance.activity = 'Oturum kapatıldı. Yeni bağlantı için QR kodu taranmalı.';
        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
        if (fs.existsSync(backupZipPath)) {
          try { fs.unlinkSync(backupZipPath); } catch (e) {}
        }
        instance.sock = null;
      } else {
        // Handle all other disconnect reasons (badSession, connectionClosed, connectionLost, restartRequired, timedOut, etc.) without deleting credentials
        const currentCredsPath = path.join(authDir, 'creds.json');
        let hasReg = false;
        if (fs.existsSync(currentCredsPath)) {
          try {
            const creds = JSON.parse(fs.readFileSync(currentCredsPath, 'utf-8'));
            hasReg = !!(creds && creds.registered === true);
          } catch (e) {}
        }

        const hasBackup = fs.existsSync(backupZipPath);
        instance.qrReconnectAttempts = (instance.qrReconnectAttempts || 0) + 1;
        if (!hasReg && !hasBackup && instance.qrReconnectAttempts > 5) {
          console.log(`[CONN] [${botId}] Connection closed. Stopped reconnecting after 5 attempts during QR generation to prevent loops.`);
          instance.connectionStatus = 'disconnected';
          instance.qrCode = null;
          instance.pairingCode = null;
          instance.activity = 'Bağlantı kapandı. Lütfen paneli yenileyip tekrar bağlanmayı deneyin.';
          instance.sock = null;
          instance.qrReconnectAttempts = 0;
          return;
        }

        console.log(`[CONN] [${botId}] Connection closed due to ${statusCode} (Attempt ${instance.qrReconnectAttempts || 1}). Reconnecting...`);
        instance.activity = 'Bağlantı kesildi. Yeniden bağlanmaya çalışıyor...';
        instance.connectionStatus = 'connecting';
        const reconnectDelay = (statusCode === DisconnectReason.restartRequired || statusCode === DisconnectReason.badSession) ? 2000 : 5000;
        
        if (instance.reconnectTimeout) clearTimeout(instance.reconnectTimeout);
        instance.reconnectTimeout = setTimeout(() => connectToWhatsApp(botId), reconnectDelay);
      }
    } else if (connection === 'open') {
      console.log(`[CONN] [${botId}] Connection opened successfully!`);
      instance.qrReconnectAttempts = 0;
      instance.connectionStatus = 'connected';
      instance.qrCode = null;
      instance.pairingCode = null;
      instance.pairingPhone = null;
      instance.activity = 'Çevrimiçi, grupları dinliyor ve duyuruları sırayla gönderiyor.';

      // Automatically fetch group count on open
      try {
        if (instance.sock) {
          getParticipatingGroups(botId, true).catch(err => {
            console.error(`[CONN] [${botId}] Failed to fetch groups:`, err);
          });
        }
      } catch (e) {}

      // Automatically backup the working credentials to a persistent zip archive
      try {
        if (fs.existsSync(authDir)) {
          const zip = new AdmZip();
          zip.addLocalFolder(authDir);
          zip.writeZip(backupZipPath);
          console.log(`[CONN] [${botId}] Auto-backup created successfully at ${backupZipPath}`);
        }
      } catch (backupErr) {
        console.error(`[CONN] [${botId}] Failed to create auto-backup:`, backupErr);
      }
    }
  });

  instance.sock.ev.on('messages.upsert', async (m) => {
    try {
      if (m.type !== 'notify') return;
      const msg = m.messages[0];
      const from = msg.key.remoteJid || '';
      
      if (!msg.message) return;
      
      let text = '';
      if (msg.message.conversation) text = msg.message.conversation;
      else if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
      else if (msg.message.imageMessage?.caption) text = msg.message.imageMessage.caption;
      else if (msg.message.videoMessage?.caption) text = msg.message.videoMessage.caption;
      
      const isGroup = from.endsWith('@g.us');
      const config = multiBotConfig[botId];

      if (!config) {
        console.warn(`[MSG] [${botId}] Configuration not found for this bot yet. Skipping message handling.`);
        return;
      }

      if (msg.key.fromMe) return;

      // Read marking
      if (text) {
        instance.sock?.readMessages([msg.key]).catch(e => console.error('Error reading msg:', e));
      }

      // Admin group AI Chatbot Integration
      const isFromAdminGroup = config.adminGroupId && from === config.adminGroupId;
      if (isFromAdminGroup && text && !text.startsWith('!')) {
        try {
          const response = await geminiClient.models.generateContent({
            model: 'gemini-3.7-flash',
            contents: text,
            config: {
              systemInstruction: `Sen "Miran Bot" sisteminin akıllı yapay zeka asistanısın. Yönetici grubundaki kullanıcılar ile samimi, saygılı, yardımsever ve son derece zeki bir şekilde Türkçe sohbet et. Miran Bot sisteminin yöneticilerine destek oluyorsun. Cevapların kısa, net, anlaşılır ve etkileyici olsun.`
            }
          });
          const reply = response.text || '';
          if (reply) {
            await safeSendMessage(botId, from, { text: reply }, { quoted: msg });
          }
        } catch (aiErr) {
          console.error(`[AI CHAT] [${botId}] Gemini error:`, aiErr);
        }
        return;
      }

      // Invite Detection
      if (text) {
        // Match both chat.whatsapp.com/CODE and chat.whatsapp.com/invite/CODE
        const inviteRegex = /chat\.whatsapp\.com\/(?:invite\/)?([0-9a-zA-Z]{18,32})/g;
        const matches = Array.from(text.matchAll(inviteRegex));
        for (const match of matches) {
          const code = match[1];
          if (!config.seenInvites.includes(code)) {
            try {
              const groupMeta = await instance.sock?.groupGetInviteInfo(code);
              if (groupMeta) {
                // Check if bot is already a member of this group
                let isAlreadyInGroup = false;
                if (instance.sock) {
                  try {
                    const groupsRaw = await getParticipatingGroups(botId);
                    if (groupsRaw && groupsRaw[groupMeta.id]) {
                      isAlreadyInGroup = true;
                    }
                  } catch (err) {
                    console.error(`[CONN] [${botId}] Error checking participating groups:`, err);
                  }
                }

                if (isAlreadyInGroup) {
                  console.log(`[CONN] [${botId}] Bot is already in group ${groupMeta.subject}. Skipping join.`);
                  config.seenInvites.push(code);
                  saveConfig();
                  continue;
                }

                config.seenInvites.push(code);
                saveConfig();

                // Try joining the group automatically silently (no notification alerts)
                if (instance.sock) {
                  try {
                    await instance.sock.groupAcceptInvite(code);
                    console.log(`[CONN] [${botId}] Successfully joined group silently via invite: ${groupMeta.subject} (${code})`);
                    // Force refresh cache on successful join so the new group is immediately counted
                    await getParticipatingGroups(botId, true);
                  } catch (joinErr: any) {
                    const errMsg = joinErr?.message || (joinErr?.output?.payload?.message) || 'Invite link expired or invalid';
                    console.log(`[CONN] [${botId}] Info: Could not join group ${code} (Reason: ${errMsg})`);
                  }
                }
              }
            } catch (e) {
              console.error(`[CONN] [${botId}] Error reading invite metadata for ${code}:`, e);
            }
          }
        }
      }

    const cmd = text.trim().toLowerCase();

    if (cmd === '!banabildir') {
      if (!config.notifyJids) config.notifyJids = [];
      if (!config.notifyJids.includes(from)) {
        config.notifyJids.push(from);
        saveConfig();
        safeSendMessage(botId, from, { text: '✅ Bundan sonra bulunan Search grupları buraya da bildirilecek!' }, { quoted: msg });
      } else {
        safeSendMessage(botId, from, { text: 'ℹ️ Zaten bildirim listesindesiniz.' }, { quoted: msg });
      }
      return;
    }

    if (cmd === '!adminburasi') {
      if (isGroup) {
        if (!config.adminGroupId) {
          config.adminGroupId = from;
          saveConfig();
          safeSendMessage(botId, from, { text: `✅ Bu grup [${botId}] yönetim grubu olarak ayarlandı.` }, { quoted: msg });
        } else {
          safeSendMessage(botId, from, { text: '❌ Admin grubu zaten ayarlanmış! Değiştirmek için paneli kullanın.' }, { quoted: msg });
        }
      }
      return; 
    }

    // Command verification: Only respond to commands in the designated admin group OR in private chats (DMs)
    const isPrivateChat = !isGroup;

    if (!isFromAdminGroup && !isPrivateChat) return;

    // Global Owner/Admin Commands (Only available on bot1)
    if (botId === 'bot1') {
      if (cmd.startsWith('!ekle ') || cmd.startsWith('!musteriekle ')) {
        const parts = text.split(/\s+/);
        if (parts.length < 3) {
          safeSendMessage(botId, from, { text: '❌ Hatalı kullanım! Doğru format:\n!ekle <kullanıcı_adı> <şifre>' }, { quoted: msg });
          return;
        }
        const username = parts[1].trim();
        const password = parts[2].trim();
        
        loadUsers();
        const exists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (exists) {
          safeSendMessage(botId, from, { text: `❌ Bu kullanıcı adı (${username}) zaten sistemde kayıtlı!` }, { quoted: msg });
          return;
        }
        
        const newBotId = `bot_${username.toLowerCase()}`;
        users.push({
          username,
          password,
          role: 'user',
          botId: newBotId
        });
        saveUsers();
        
        addBotRuntime(newBotId);
        
        const successText = `✅ *Müşteri Başarıyla Eklendi!*\n\n👥 *Kullanıcı Adı:* ${username}\n🔑 *Şifre:* ${password}\n🤖 *Bot ID:* ${newBotId}\n🌐 *Giriş Paneli:* http://2.56.248.252:3000\n\nMüşteriniz bu bilgilerle panele giriş yapıp kendi WhatsApp botunu kurabilir!`;
        safeSendMessage(botId, from, { text: successText }, { quoted: msg });
        return;
      }

      if (cmd.startsWith('!musterisil ') || cmd.startsWith('!silmusteri ')) {
        const parts = text.split(/\s+/);
        if (parts.length < 2) {
          safeSendMessage(botId, from, { text: '❌ Hatalı kullanım! Doğru format:\n!musterisil <kullanıcı_adı>' }, { quoted: msg });
          return;
        }
        const username = parts[1].trim();
        
        loadUsers();
        const userIdx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
        if (userIdx === -1) {
          safeSendMessage(botId, from, { text: `❌ ${username} adında bir müşteri bulunamadı!` }, { quoted: msg });
          return;
        }
        
        const userObj = users[userIdx];
        if (userObj.role === 'admin') {
          safeSendMessage(botId, from, { text: `❌ Yönetici hesabı silinemez!` }, { quoted: msg });
          return;
        }
        
        users.splice(userIdx, 1);
        saveUsers();
        
        const targetBotId = userObj.botId;
        if (bots[targetBotId]) {
          const inst = bots[targetBotId];
          if (inst.sock) {
            try { inst.sock.ws.close(); } catch(e) {}
          }
          delete bots[targetBotId];
        }
        
        if (multiBotConfig[targetBotId]) {
          delete multiBotConfig[targetBotId];
          saveConfig();
        }
        
        BOT_IDS = BOT_IDS.filter(id => id !== targetBotId);
        
        const authDir = path.join(process.cwd(), `auth_info_baileys_${targetBotId}`);
        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
        
        const backupZipPath = path.join(process.cwd(), `auth_info_baileys_${targetBotId}_backup.zip`);
        if (fs.existsSync(backupZipPath)) {
          try { fs.unlinkSync(backupZipPath); } catch (e) {}
        }
        
        safeSendMessage(botId, from, { text: `🗑️ Müşteri (${username}) ve tüm bot oturum verileri sistemden silindi.` }, { quoted: msg });
        return;
      }

      if (cmd === '!musteriler' || cmd === '!musterilistesi') {
        loadUsers();
        const clients = users.filter(u => u.role === 'user');
        if (clients.length === 0) {
          safeSendMessage(botId, from, { text: '📝 Kayıtlı müşteri bulunmamaktadır.' }, { quoted: msg });
          return;
        }
        
        let listTxt = `👥 *Müşterileriniz & Bot Durumları (${clients.length})*\n\n`;
        clients.forEach((c, i) => {
          const inst = bots[c.botId];
          const status = inst ? inst.connectionStatus : 'disconnected';
          const statusEmoji = status === 'connected' ? '✅ Bağlı' : '❌ Bağlı Değil';
          listTxt += `*${i+1}.* 👤 *${c.username}* (${statusEmoji})\n🔑 Şifre: ${c.password}\n🤖 Bot ID: ${c.botId}\n\n`;
        });
        safeSendMessage(botId, from, { text: listTxt }, { quoted: msg });
        return;
      }
    }

    if (cmd === '!yenile') {
      safeSendMessage(botId, from, { text: '🔄 Bot yenileniyor...' }, { quoted: msg });
      
      if (instance && instance.sock) {
        try { instance.sock.ws.close(); } catch(e) {}
      } else {
        connectToWhatsApp(botId);
      }
      setTimeout(() => {
        safeSendMessage(botId, from, { text: '✅ Bot başarıyla yenilendi!' }, { quoted: msg });
      }, 3000);
      return;
    }

    if (cmd === '!yardım' || cmd === '!yardim') {
      let helpText = `👑 *MİRAN BOT YARDIM MENÜSÜ* 👑

Merhaba! Miran Bot'u yönetmek için aşağıdaki komutları kullanabilirsiniz.

⚡ *Yönetim & Kurulum Komutları:*
• *!adminburasi* ➔ Bulunduğunuz grubu botun ana yönetim grubu yapar.
• *!banabildir* ➔ Yeni bulunan search gruplarını size özel mesajla bildirir.
• *!yenile* ➔ Botun bağlantısını ve önbelleğini tazeler.
• *!yedek* ➔ Bot ayarlarını ve oturumunu sıkıştırıp dosya (.zip) olarak yedekler.

📢 *Duyuru Yönetim Komutları:*
• *!otogönder [mesaj] [süre]* ➔ Belirtilen süre (dakika) aralığıyla otomatik duyuru başlatır. *(Resim ekleyerek gönderebilirsiniz)*
• *!liste* ➔ Şu anda aktif olan tüm otomatik duyuruları listeler.
• *!sil [no]* ➔ Belirttiğiniz sıradaki duyuruyu kalıcı olarak siler. *(Örn: !sil 1)*
• *!temizle* ➔ Tüm aktif duyuru listesini sıfırlar.

🤖 *Bot Kontrol Komutları:*
• *!durum* ➔ Miran Bot'un anlık çalışma durumunu, istatistiklerini ve ne yaptığını detaylı gösterir.
• *!botaktif* ➔ Otomatik duyuru gönderim sistemini başlatır.
• *!botpasif* ➔ Otomatik duyuru gönderim sistemini duraklatır.`;

      if (botId === 'bot1') {
        helpText += `\n\n💼 *Müşteri Kiralama Komutları (Admin):*
• *!ekle [user] [sifre]* ➔ Yeni kiralık müşteri ve yeni bot oluşturur.
• *!musterisil [user]* ➔ Müşteriyi ve botunu tamamen siler.
• *!musteriler* ➔ Kayıtlı tüm müşterileri ve bot durumlarını listeler.`;
      }

      helpText += `\n\n✨ _Miran Bot, işinizi ve gruplarınızı büyütmek için tasarlandı!_`;
      safeSendMessage(botId, from, { text: helpText }, { quoted: msg });
    }

    if (cmd === '!durum') {
      let groupCount = instance.groupCount || 0;
      if (instance.sock) {
        try {
          const groupsRaw = await getParticipatingGroups(botId);
          groupCount = Object.keys(groupsRaw).length;
          instance.groupCount = groupCount;
        } catch (err) {
          console.error('Error fetching participating groups:', err);
        }
      }

      const activity = config.isActive 
        ? (instance.activity || 'Çevrimiçi, grupları dinliyor ve duyuruları sırayla gönderiyor.') 
        : 'Bot pasif modda, çalışmıyor.';

      loadUsers();
      const currentUser = users.find(u => u.botId === botId);
      let expiryText = '♾️ Sınırsız / Yönetici';
      if (currentUser && currentUser.role === 'user' && currentUser.expiresAt) {
        try {
          const expDate = new Date(currentUser.expiresAt);
          const today = new Date();
          expDate.setHours(0,0,0,0);
          today.setHours(0,0,0,0);
          
          const diffTime = expDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays < 0) {
            expiryText = `❌ Süresi Doldu (${currentUser.expiresAt})`;
          } else {
            expiryText = `⏳ ${diffDays} gün kaldı (${currentUser.expiresAt})`;
          }
        } catch (e) {
          expiryText = `⏳ ${currentUser.expiresAt}`;
        }
      }

      const statusText = `🤖 *Miran Bot Durum Raporu* 🤖

📊 *Genel İstatistikler:*
• *Kiralama Süresi:* ${expiryText}
• *Aktif Olduğu Grup Sayısı:* ${groupCount} grup
• *Atılan Duyuru Mesajı:* ${config.sentCount || 0} adet
• *Bağlantı Durumu:* ${instance.connectionStatus === 'connected' ? '✅ Bağlı' : '❌ Bağlı Değil'}
• *Çalışma Modu:* ${config.isActive ? '🟢 Aktif (Açık)' : '🔴 Pasif (Kapalı)'}
• *Kayıtlı Duyuru Sayısı:* ${config.broadcasts.length} adet

🛠️ *Şu Anda Ne Yapıyor?*
• ${activity}

✨ _Miran Bot, duyurularınızı zamanında ve güvenle ulaştırmaya devam ediyor!_`;
      safeSendMessage(botId, from, { text: statusText }, { quoted: msg });
    }

    if (cmd === '!botaktif') {
      config.isActive = true;
      saveConfig();
      safeSendMessage(botId, from, { text: '🚀 Bot AKTİF hale getirildi.' }, { quoted: msg });
    }

    if (cmd === '!botpasif') {
      config.isActive = false;
      saveConfig();
      safeSendMessage(botId, from, { text: '😴 Bot PASİF hale getirildi.' }, { quoted: msg });
    }

    if (cmd === '!temizle') {
      config.broadcasts = [];
      saveConfig();
      safeSendMessage(botId, from, { text: '🗑️ Tüm duyurular temizlendi.' }, { quoted: msg });
    }

    if (cmd === '!yedek') {
      try {
        const zip = new AdmZip();
        const authDir = path.join(process.cwd(), `auth_info_baileys_${botId}`);
        
        if (fs.existsSync(authDir)) {
          zip.addLocalFolder(authDir, `auth_info_baileys_${botId}`);
        }
        
        const configPath = path.join(process.cwd(), 'bot_config.json');
        if (fs.existsSync(configPath)) {
          zip.addLocalFile(configPath);
        }
        
        const buf = zip.toBuffer();
        safeSendMessage(botId, from, {
          document: buf,
          mimetype: 'application/zip',
          fileName: `${botId}_yedek_${Date.now()}.zip`,
          caption: `📦 *[${botId}] Yedek Dosyası*\n\nBot dosyalarınız ve ayarlarınız başarıyla sıkıştırıldı.`
        }, { quoted: msg });
      } catch (err) {
        console.error(err);
        safeSendMessage(botId, from, { text: '❌ Yedek alma sırasında bir hata oluştu.' }, { quoted: msg });
      }
    }

    if (cmd === '!liste') {
      if (config.broadcasts.length === 0) {
        safeSendMessage(botId, from, { text: '📝 Duyuru yok.' }, { quoted: msg });
        return;
      }
      let listText = `📝 *[${botId}] Duyurular*\n\n`;
      config.broadcasts.forEach((b, i) => {
        listText += `*${i + 1}* - ⏱️ ${b.interval} dk\n💬 ${b.message.substring(0, 50)}...\n\n`;
      });
      safeSendMessage(botId, from, { text: listText }, { quoted: msg });
    }

    if (cmd.startsWith('!sil ')) {
      const index = parseInt(cmd.split(' ')[1]) - 1;
      if (!isNaN(index) && index >= 0 && index < config.broadcasts.length) {
        config.broadcasts.splice(index, 1);
        saveConfig();
        safeSendMessage(botId, from, { text: `✅ Duyuru silindi.` }, { quoted: msg });
      }
    }

    if (cmd.startsWith('!otogönder ')) {
      const match = text.match(/^!otog[oö]nder\s+([\s\S]+?)\s+(\d+)$/i);
      if (!match) {
        safeSendMessage(botId, from, { text: '❌ Hatalı kullanım. Örnek:\n!otogönder Merhaba arkadaşlar 5' }, { quoted: msg });
        return;
      }
      
      const message = match[1].trim();
      const minute = parseInt(match[2]);

      let imageUrl: string | undefined = undefined;
      const imageMessage = msg.message?.imageMessage;
      
      if (imageMessage) {
        try {
          const buffer = await downloadMediaMessage(
            msg, 'buffer', { }, { logger: pino({ level: 'silent' }), reuploadRequest: instance.sock!.updateMediaMessage }
          );
          const id = Math.random().toString(36).substr(2, 9);
          const filePath = path.join(UPLOADS_DIR, `img_${id}.jpg`);
          fs.writeFileSync(filePath, buffer);
          imageUrl = filePath;
        } catch (err) {}
      }
      
      config.isActive = true; 
      config.broadcasts.push({
        id: Math.random().toString(36).substr(2, 9),
        message: message,
        interval: minute,
        imageUrl: imageUrl
      });
      saveConfig();
      safeSendMessage(botId, from, { text: `✅ Duyuru eklendi! (Görsel: ${imageUrl ? 'Var' : 'Yok'}, Süre: ${minute} dk)` }, { quoted: msg });
    }
    } catch (err) {
      console.error(`[CRITICAL ERROR] Error inside messages.upsert for bot [${botId}]:`, err);
    }
  });
}

// Start all bots
BOT_IDS.forEach(botId => connectToWhatsApp(botId));

// Broadcast Loop
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runBroadcasts() {
  while (true) {
    try {
      const now = Date.now();
      for (const botId of BOT_IDS) {
        const instance = bots[botId];
        const config = multiBotConfig[botId];

        if (config.isActive && instance.connectionStatus === 'connected' && instance.sock) {
          if (Math.random() > 0.7) await instance.sock.sendPresenceUpdate('available');
          
          let groupIds: string[] | null = null;
          let groupsRaw: any = null;

          for (const broadcast of config.broadcasts) {
            const intervalMs = broadcast.interval * 60 * 1000;
            if (!broadcast.lastSent || now - broadcast.lastSent >= intervalMs) {
              
              instance.activity = 'Duyurular hazırlanıyor ve güncel grup listesi alınıyor...';
              if (!groupIds) {
                groupsRaw = await getParticipatingGroups(botId);
                groupIds = Object.keys(groupsRaw);
                instance.groupCount = groupIds.length;
              }

              let urlInfo: any = undefined;
              if (broadcast.message.match(/https?:\/\//)) {
                try {
                  urlInfo = await getUrlInfo(broadcast.message, { thumbnailWidth: 200, fetchOpts: { timeout: 15000 } });
                } catch (e) {}
              }
              
              for (const gid of groupIds) {
                try {
                  if (groupsRaw && groupsRaw[gid]?.announce) {
                    const selfId = instance.sock.user?.id;
                    if (selfId) {
                      const isBotAdmin = await isUserAdmin(botId, gid, selfId);
                      if (!isBotAdmin) continue;
                    }
                  }

                  const grpName = groupsRaw && groupsRaw[gid]?.subject ? groupsRaw[gid].subject : 'WhatsApp Grubu';
                  instance.activity = `"${grpName}" grubuna duyuru gönderiliyor...`;

                  instance.sock.sendPresenceUpdate('composing', gid).catch(() => {});
                  await delay(2000);
                  instance.sock.sendPresenceUpdate('paused', gid).catch(() => {});

                  let result = null;
                  if (broadcast.imageUrl && fs.existsSync(broadcast.imageUrl)) {
                    result = await safeSendMessage(botId, gid, { image: fs.readFileSync(broadcast.imageUrl), caption: broadcast.message });
                  } else {
                    if (urlInfo) result = await safeSendMessage(botId, gid, { text: broadcast.message, linkPreview: urlInfo });
                    else result = await safeSendMessage(botId, gid, { text: broadcast.message });
                  }

                  if (result) {
                    config.sentCount = (config.sentCount || 0) + 1;
                    saveConfig();
                  }
                  
                  await delay(Math.floor(Math.random() * 3000) + 3000); 
                } catch (err) {}
              }

              broadcast.lastSent = now;
              saveConfig();
              instance.activity = 'Çevrimiçi, grupları dinliyor ve duyuruları sırayla gönderiyor.';
            }
          }
        } else if (!config.isActive && instance.connectionStatus === 'connected') {
          instance.activity = 'Bot pasif durumda, aktif edilmeyi bekliyor.';
        }
      }
    } catch (e) {}
    await delay(15000); 
  }
}

runBroadcasts();

// Multi-Bot API Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  loadUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  if (user) {
    res.json({
      success: true,
      user: {
        username: user.username,
        role: user.role,
        botId: user.botId
      }
    });
  } else {
    res.json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre!' });
  }
});

app.get('/api/admin/users', (req, res) => {
  loadUsers();
  res.json({ users: users.filter(u => u.role !== 'admin') });
});

app.post('/api/admin/users', (req, res) => {
  const { username, password, expiresAt } = req.body;
  if (!username || !password) return res.json({ success: false, message: 'Kullanıcı adı ve şifre gereklidir!' });
  
  loadUsers();
  const exists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    return res.json({ success: false, message: 'Bu kullanıcı adı zaten alınmış!' });
  }
  
  const newBotId = `bot_${username.toLowerCase()}`;
  users.push({
    username,
    password,
    role: 'user',
    botId: newBotId,
    expiresAt: expiresAt || ''
  });
  saveUsers();
  
  addBotRuntime(newBotId);
  res.json({ success: true, user: { username, role: 'user', botId: newBotId, expiresAt: expiresAt || '' } });
});

app.post('/api/admin/users/edit', (req, res) => {
  const { username, password, expiresAt } = req.body;
  if (!username) return res.json({ success: false, message: 'Kullanıcı adı gereklidir!' });
  
  loadUsers();
  const userObj = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!userObj) return res.json({ success: false, message: 'Kullanıcı bulunamadı!' });
  
  if (password !== undefined && password.trim() !== '') {
    userObj.password = password;
  }
  if (expiresAt !== undefined) {
    userObj.expiresAt = expiresAt;
  }
  saveUsers();
  
  try {
    checkExpirations();
  } catch (e) {}
  
  res.json({ success: true });
});

app.post('/api/admin/users/delete', (req, res) => {
  const { username } = req.body;
  if (!username) return res.json({ success: false });
  
  loadUsers();
  const userIdx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (userIdx === -1) return res.json({ success: false, message: 'Kullanıcı bulunamadı!' });
  
  const userObj = users[userIdx];
  if (userObj.role === 'admin') return res.json({ success: false, message: 'Yönetici hesabı silinemez!' });
  
  users.splice(userIdx, 1);
  saveUsers();
  
  const targetBotId = userObj.botId;
  if (bots[targetBotId]) {
    const inst = bots[targetBotId];
    if (inst.sock) {
      try { inst.sock.ws.close(); } catch(e) {}
    }
    delete bots[targetBotId];
  }
  
  if (multiBotConfig[targetBotId]) {
    delete multiBotConfig[targetBotId];
    saveConfig();
  }
  
  BOT_IDS = BOT_IDS.filter(id => id !== targetBotId);
  
  const authDir = path.join(process.cwd(), `auth_info_baileys_${targetBotId}`);
  if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
  
  const backupZipPath = path.join(process.cwd(), `auth_info_baileys_${targetBotId}_backup.zip`);
  if (fs.existsSync(backupZipPath)) {
    try { fs.unlinkSync(backupZipPath); } catch (e) {}
  }
  
  res.json({ success: true });
});

app.get('/api/download/server', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Error reading server.ts: ' + err.message);
  }
});

app.get('/api/download/app', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Error reading src/App.tsx: ' + err.message);
  }
});

app.get('/api/download/package', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Error reading package.json: ' + err.message);
  }
});

app.get('/api/download/vite-config', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Error reading vite.config.ts: ' + err.message);
  }
});

app.get('/api/download/tsconfig', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'tsconfig.json'), 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Error reading tsconfig.json: ' + err.message);
  }
});

app.get('/api/download/index-html', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Error reading index.html: ' + err.message);
  }
});

app.get('/api/download/main-tsx', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/main.tsx'), 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Error reading src/main.tsx: ' + err.message);
  }
});

app.get('/api/download/index-css', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Error reading src/index.css: ' + err.message);
  }
});

app.get('/api/download/installer', (req, res) => {
  const scriptContent = `#!/bin/bash
clear
echo "=========================================================="
echo "    Miran Bot Otomatik Sıfırdan Kurulum Sihirbazı"
echo "=========================================================="
echo ""

# 1. Eski süreçleri sonlandır
echo "⏱️ 1. Eski arka plan süreçleri temizleniyor..."
pm2 kill || true
pkill -f node || true
pkill -f tsx || true

# 2. Temiz klasör yapısı oluştur
echo "📁 2. Temiz klasörler oluşturuluyor..."
rm -rf /root/whatsapp-bot
mkdir -p /root/whatsapp-bot/src
cd /root/whatsapp-bot

# 3. Dosyaları sırasıyla indir
echo "📥 3. Güncel kod dosyaları güvenle indiriliyor..."
curl -sL "https://ais-dev-7q64fghqmxv5w74mz7n4wz-537507425617.europe-west2.run.app/api/download/package" > package.json
curl -sL "https://ais-dev-7q64fghqmxv5w74mz7n4wz-537507425617.europe-west2.run.app/api/download/vite-config" > vite.config.ts
curl -sL "https://ais-dev-7q64fghqmxv5w74mz7n4wz-537507425617.europe-west2.run.app/api/download/tsconfig" > tsconfig.json
curl -sL "https://ais-dev-7q64fghqmxv5w74mz7n4wz-537507425617.europe-west2.run.app/api/download/index-html" > index.html
curl -sL "https://ais-dev-7q64fghqmxv5w74mz7n4wz-537507425617.europe-west2.run.app/api/download/server" > server.ts
curl -sL "https://ais-dev-7q64fghqmxv5w74mz7n4wz-537507425617.europe-west2.run.app/api/download/main-tsx" > src/main.tsx
curl -sL "https://ais-dev-7q64fghqmxv5w74mz7n4wz-537507425617.europe-west2.run.app/api/download/index-css" > src/index.css
curl -sL "https://ais-dev-7q64fghqmxv5w74mz7n4wz-537507425617.europe-west2.run.app/api/download/app" > src/App.tsx

# 4. Bağımlılıkları kur
echo "📦 4. WhatsApp kütüphaneleri kuruluyor (1-2 dakika sürebilir)..."
npm install --legacy-peer-deps

# 5. Projeyi derle
echo "🛠️ 5. Proje derleniyor..."
npm run build

# 6. PM2 ile başlat ve kaydet
echo "🚀 6. Bot PM2 ile arka planda çalıştırılıyor..."
pm2 delete "miran-bot" 2>/dev/null || true
pm2 start npm --name "miran-bot" -- run dev
pm2 save
pm2 startup

echo ""
echo "=========================================================="
echo "    🎉 TEBRİKLER! KURULUM BAŞARIYLA TAMAMLANDI! 🎉"
echo "    Bot siteniz ve sisteminiz sıfırdan ayağa kaldırıldı."
echo "=========================================================="
echo ""
`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(scriptContent);
});

app.get('/api/status', (req, res) => {
  const { botId, role } = req.query;
  
  try {
    checkExpirations();
  } catch (err) {
    console.error('Error checking expirations in /api/status:', err);
  }
  
  let targetIds = BOT_IDS;
  if (role === 'user' && typeof botId === 'string') {
    targetIds = BOT_IDS.filter(id => id === botId);
  }
  
  const allStatus = targetIds.map(id => {
    const authDir = path.join(process.cwd(), `auth_info_baileys_${id}`);
    const credsPath = path.join(authDir, 'creds.json');
    let hasSession = false;
    if (fs.existsSync(credsPath)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        hasSession = !!(creds && creds.registered === true);
      } catch (e) {
        hasSession = false;
      }
    }
    
    // Non-blocking trigger to fetch groupCount if zero and connected
    if (bots[id] && bots[id].connectionStatus === 'connected' && bots[id].sock && !bots[id].groupCount) {
      try {
        bots[id].sock!.groupFetchAllParticipating().then(groupsRaw => {
          bots[id].groupCount = Object.keys(groupsRaw).length;
        }).catch(() => {});
      } catch (e) {}
    }

    return {
      id,
      status: bots[id] ? bots[id].connectionStatus : 'disconnected',
      qr: bots[id] ? bots[id].qrCode : null,
      pairingCode: bots[id] ? bots[id].pairingCode : null,
      pairingPhone: bots[id] ? bots[id].pairingPhone : null,
      hasSession,
      activity: bots[id] ? (bots[id].activity || 'Boşta bekliyor.') : 'Boşta bekliyor.',
      groupCount: bots[id] ? (bots[id].groupCount || 0) : 0,
      config: multiBotConfig[id] || getDefaultConfig()
    };
  });
  res.json({ bots: allStatus });
});

app.post('/api/config', (req, res) => {
  const { botId, adminGroupId, isActive } = req.body;
  if (!botId || !multiBotConfig[botId]) return res.json({ success: false });
  
  if (isActive === true) {
    loadUsers();
    const userObj = users.find(u => u.botId === botId);
    if (userObj && userObj.role === 'user' && userObj.expiresAt) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (userObj.expiresAt < todayStr) {
        return res.json({ success: false, message: 'Kiralama süreniz dolmuştur! Lütfen admin ile iletişime geçin.' });
      }
    }
  }
  
  if (adminGroupId !== undefined) multiBotConfig[botId].adminGroupId = adminGroupId;
  if (isActive !== undefined) multiBotConfig[botId].isActive = isActive;
  saveConfig();
  res.json({ success: true });
});

app.post('/api/broadcasts', (req, res) => {
  const { botId, action, broadcast } = req.body;
  if (!botId || !multiBotConfig[botId]) return res.json({ success: false });

  if (action === 'add') {
    multiBotConfig[botId].broadcasts.push({
      id: Math.random().toString(36).substr(2, 9),
      message: broadcast.message,
      interval: broadcast.interval,
    });
  } else if (action === 'delete') {
    multiBotConfig[botId].broadcasts = multiBotConfig[botId].broadcasts.filter((b: any) => b.id !== broadcast.id);
  }
  saveConfig();
  res.json({ success: true, config: multiBotConfig[botId] });
});

app.post('/api/logout', async (req, res) => {
  const { botId } = req.body;
  if (!botId) return res.json({ success: false });
  const instance = bots[botId];
  if (instance) {
    instance.pairingCode = null;
    instance.pairingPhone = null;
    if (instance.sock) {
      try { instance.sock.ws.close(); } catch (e) {}
    }
  }
  const authDir = path.join(process.cwd(), `auth_info_baileys_${botId}`);
  if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
  
  const backupZipPath = path.join(process.cwd(), `auth_info_baileys_${botId}_backup.zip`);
  if (fs.existsSync(backupZipPath)) {
    try { fs.unlinkSync(backupZipPath); } catch (e) {}
  }
  
  res.json({ success: true });
});

app.post('/api/reconnect', async (req, res) => {
  const { botId } = req.body;
  if (!botId) return res.json({ success: false });
  const instance = bots[botId];
  if (instance && instance.sock) {
    try { instance.sock.ws.close(); } catch(e) {}
    instance.sock = null;
  }
  instance.connectionStatus = 'disconnected';
  instance.qrCode = null;
  connectToWhatsApp(botId);
  res.json({ success: true });
});

app.post('/api/reset', async (req, res) => {
  const { botId } = req.body;
  if (!botId) return res.json({ success: false });
  const instance = bots[botId];
  if (instance) {
    instance.pairingCode = null;
    instance.pairingPhone = null;
    if (instance.sock) {
      try { instance.sock.ws.close(); } catch(e) {}
      instance.sock = null;
    }
  }
  const authDir = path.join(process.cwd(), `auth_info_baileys_${botId}`);
  if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
  
  const backupZipPath = path.join(process.cwd(), `auth_info_baileys_${botId}_backup.zip`);
  if (fs.existsSync(backupZipPath)) {
    try { fs.unlinkSync(backupZipPath); } catch (e) {}
  }
  
  instance.connectionStatus = 'disconnected';
  instance.qrCode = null;
  connectToWhatsApp(botId);
  res.json({ success: true });
});

app.get('/api/health', (req, res) => {
  res.json({ status: "ok" });
});

app.get('/api/ping', (req, res) => {
  res.send('pong');
});

// 7/24 Connection Watchdog for self-healing silent disconnects
setInterval(() => {
  try {
    checkExpirations();
  } catch (err) {
    console.error('Error running checkExpirations in watchdog:', err);
  }

  BOT_IDS.forEach(botId => {
    const instance = bots[botId];
    if (!instance) return;
    
    // Check if the bot actually has registered credentials
    const authDir = path.join(process.cwd(), `auth_info_baileys_${botId}`);
    const credsPath = path.join(authDir, 'creds.json');
    let hasSession = false;
    if (fs.existsSync(credsPath)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        hasSession = !!(creds && creds.registered === true);
      } catch (e) {}
    }

    if (hasSession) {
      const sock = instance.sock;
      const ws = sock?.ws;
      const readyState = ws?.readyState;

      // Self-healing check
      if (instance.connectionStatus === 'connected') {
        // ReadyState values: 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
        // If we think we are connected but the websocket is not OPEN:
        if (!sock || !ws || readyState !== 1) {
          console.warn(`[WATCHDOG] [${botId}] Bot status is 'connected' but physical WebSocket is not OPEN (State: ${readyState}). Reconnecting...`);
          instance.connectionStatus = 'connecting';
          instance.activity = 'Bağlantı kopması algılandı, otomatik kurtarılıyor...';
          if (sock) {
            try { ws.close(); } catch (e) {}
          }
          instance.sock = null;
          connectToWhatsApp(botId);
        }
      } else if (instance.connectionStatus === 'disconnected') {
        // If it got stuck in 'disconnected' but we have a session, reconnect it
        console.log(`[WATCHDOG] [${botId}] Bot has an active session but status is 'disconnected'. Forcing reconnect...`);
        connectToWhatsApp(botId);
      }
    }
  });
}, 60000); // Check every 60 seconds

// Vite Integration
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production' || 
                 fs.existsSync(path.join(process.cwd(), 'dist', 'index.html')) ||
                 fs.existsSync(path.join(__dirname, 'index.html'));
  
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(__dirname, 'index.html')) 
      ? __dirname 
      : path.join(process.cwd(), 'dist');
      
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}`);
  });
}

startServer();

// Graceful shutdown to prevent Baileys connection conflicts
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  for (const botId of BOT_IDS) {
    const instance = bots[botId];
    if (instance && instance.sock) {
      try {
        instance.sock.ws.close();
      } catch (e) {
        // ignore
      }
    }
  }
  process.exit(0);
};

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

