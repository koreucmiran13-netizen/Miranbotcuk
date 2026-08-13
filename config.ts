/**
 * MiranBot v3 — Basit JSON yapılandırması
 * bot_config.json: { bots: { [botId]: { adminGroupId, announcements: [...], running } } }
 */
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'bot_config.json');

export interface Announcement {
  id: string;
  text: string;
  imageUrl?: string;
  intervalMin: number;
}

export interface BotConfig {
  adminGroupId?: string;
  announcements: Announcement[];
  running: boolean;
}

interface Config {
  bots: Record<string, BotConfig>;
}

let cache: Config | null = null;

export function loadConfig(): Config {
  try {
    cache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    cache = { bots: {} };
  }
  return cache ?? { bots: {} };
}

export function getConfig(botId: string): BotConfig | null {
  const c = loadConfig();
  return c.bots[botId] ?? null;
}

export function getOrCreateConfig(botId: string): BotConfig {
  const c = loadConfig();
  if (!c.bots[botId]) c.bots[botId] = { announcements: [], running: false };
  saveConfig(c);
  return c.bots[botId];
}

export function saveConfig(c: Config): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2));
  cache = c;
}

export function addAnnouncement(botId: string, ann: Announcement): void {
  const c = loadConfig();
  if (!c.bots[botId]) c.bots[botId] = { announcements: [], running: false };
  c.bots[botId].announcements.push(ann);
  saveConfig(c);
}

export function removeAnnouncement(botId: string, annId: string): void {
  const c = loadConfig();
  const b = c.bots[botId];
  if (b) {
    b.announcements = b.announcements.filter((a) => a.id !== annId);
    saveConfig(c);
  }
}

export function setRunning(botId: string, running: boolean): void {
  const c = loadConfig();
  if (!c.bots[botId]) c.bots[botId] = { announcements: [], running: false };
  c.bots[botId].running = running;
  saveConfig(c);
}
