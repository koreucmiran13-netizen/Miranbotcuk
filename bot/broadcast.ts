/**
 * MiranBot v3 — Duyuru Motoru
 * Her duyurunun kendi aralığı vardır. Çalışan duyurular periyodik olarak
 * tüm gruplara sıralı kuyruk üzerinden (flood korumalı) gönderilir.
 */
import { getConfig, type Announcement, setRunning } from '../config';
import { getState } from './engine';
import { enqueue } from './queue';

const timers = new Map<string, NodeJS.Timeout>();

export function startBroadcast(botId: string): void {
  stopBroadcast(botId);
  const config = getConfig(botId);
  if (!config || config.announcements.length === 0) return;

  setRunning(botId, true);
  for (const ann of config.announcements) {
    const intervalMs = Math.max(ann.intervalMin, 1) * 60000;
    // İlk gönderim hemen, ardından aralık
    sendAnnouncement(botId, ann);
    const t = setInterval(() => sendAnnouncement(botId, ann), intervalMs);
    timers.set(`${botId}:${ann.id}`, t);
  }
  console.log('[BCAST] Duyurular başlatıldı:', botId, config.announcements.length, 'adet');
}

export function stopBroadcast(botId: string): void {
  for (const key of [...timers.keys()]) {
    if (key.startsWith(`${botId}:`)) {
      clearInterval(timers.get(key));
      timers.delete(key);
    }
  }
  setRunning(botId, false);
}

export function isBroadcastRunning(botId: string): boolean {
  return [...timers.keys()].some((k) => k.startsWith(`${botId}:`));
}

function sendAnnouncement(botId: string, ann: Announcement): void {
  const state = getState(botId);
  if (state.status !== 'connected' || !state.sock) return;

  state
    .sock.groupFetchAllParticipating()
    .then((groups) => {
      const jids = Object.keys(groups);
      console.log(`[BCAST] [${botId}] Duyuru ${jids.length} gruba sırayla gönderiliyor...`);
      for (const jid of jids) {
        enqueue({
          sock: state.sock!,
          jid,
          text: ann.text,
          mediaUrl: ann.imageUrl || undefined,
        });
      }
    })
    .catch((e) => console.error('[BCAST] Grup listesi alınamadı:', e?.message ?? e));
}

export function stopAll(): void {
  for (const key of timers.keys()) {
    clearInterval(timers.get(key));
  }
  timers.clear();
}
