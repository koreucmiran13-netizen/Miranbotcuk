/**
 * MiranBot v3 — Gönderim Kuyruğu ve Akıllı Mesaj Formatı
 * - Tek sıralı kuyruk (flood koruması)
 * - smartFormat: mesajın içeriğine göre doğru formatı seçer
 *   * görsel URL (jpg/png/webp) varsa → resimli mesaj (caption'lı)
 *   * video URL (mp4) varsa → video mesajı (caption'lı)
 *   * metinde link varsa → düz metin (WhatsApp otomatik öngörüli önizleme yapar)
 *   * yoksa → düz metin
 */
import type { WASocket } from '@whiskeysockets/baileys';

export interface SendJob {
  sock: WASocket;
  jid: string;
  text: string;
  mediaUrl?: string;
}

// ---------------------------------------------------------------------------
// Akıllı format planı
// ---------------------------------------------------------------------------
function isMediaUrl(url: string): { type: 'image' | 'video' | null } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { type: null };
  }
  const p = u.pathname.toLowerCase();
  const base = p.split('?')[0];
  if (/\.(jpe?g|png|webp|gif)$/i.test(base)) return { type: 'image' };
  if (/\.(mp4|mov)$/i.test(base)) return { type: 'video' };
  // URL parametresinden de tahmin et
  if (/\.php|\/media\//i.test(p) && /jpe?g|png|webp|video/i.test(p)) return { type: 'image' };
  return { type: null };
}

function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}

/**
 * v3.10: Mesajı link-öngörü kartına uygun hale getir.
 * - chat.whatsapp.com linkleri metnin SONUNA ayrı satırda taşınır
 *   (WhatsApp yalnızca metnin sonunda tek başına duran davet linkleri
 *   için "Gruba Katıl" öngörü kartı oluşturur)
 * - Satır atlamaları ve metin AYNEN korunur
 */
function previewOptimize(text: string): { body: string; hasInvite: boolean } {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const inviteLinks: string[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    const m = line.match(/https?:\/\/[^\s)]+/gi);
    if (m && m.some((u) => /chat\.whatsapp\.com\/(?!channel\/)/i.test(u))) {
      inviteLinks.push(line);
    } else {
      rest.push(line);
    }
  }
  if (inviteLinks.length === 0) return { body: text, hasInvite: false };
  return {
    body: [...rest, '', ...inviteLinks].join('\n').trim() + '\n',
    hasInvite: true,
  };
}

/**
 * Mesajı analiz eder ve en iyi gönderim planını döndürür.
 */
export function smartPlan(text: string): {
  mediaUrl: string | null;
  body: string;
  linkPreview: boolean;
} {
  const url = extractUrl(text);
  const media = url ? isMediaUrl(url) : { type: null };

  if (media.type === 'image') {
    // Görsel URL'si varsa: metni ikiye böl (görsel öncesi = caption)
    const body = url ? text.split(url)[0].trim() || text : text;
    return { mediaUrl: url, body, linkPreview: false };
  }
  if (media.type === 'video') {
    const body = url ? text.split(url)[0].trim() || text : text;
    return { mediaUrl: url, body, linkPreview: false };
  }
  return { mediaUrl: null, body: text, linkPreview: url ? true : false };
}

// ---------------------------------------------------------------------------
// Sıralı kuyruk + flood koruması
// ---------------------------------------------------------------------------
const queue: SendJob[] = [];
let busy = false;

export function enqueue(job: SendJob): void {
  queue.push(job);
  void drain();
}

async function drain(): Promise<void> {
  if (busy) return;
  busy = true;
  while (queue.length > 0) {
    const job = queue.shift()!;
    try {
      const plan = smartPlan(job.text);
      // v3.10: davet linklerini ayrı satırda sona taşı (öngörü kartı için)
      const opt = previewOptimize(plan.body);
      if (plan.mediaUrl) {
        await job.sock.sendMessage(job.jid, {
          image: { url: plan.mediaUrl },
          caption: opt.body || undefined,
        });
      } else {
        // v3.9: generateHighQualityLinkPreview açık; sunucu link öngörüsünü oluşturur
        await job.sock.sendMessage(job.jid, { text: opt.body });
      }
    } catch (e: any) {
      console.error('[QUEUE] Gönderim hatası:', job.jid, e?.message ?? e);
    }
    // Flood koruması: 3-6 sn arası rastgele bekleme
    const wait = 3000 + Math.random() * 3000;
    await new Promise((r) => setTimeout(r, wait));
  }
  busy = false;
}
