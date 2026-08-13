import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------
interface BotInfo {
  id: string;
  status: string;
  qr: string | null;
  activity: string;
  groupCount: number;
  lastDisconnectReason: string | null;
}

interface Announcement {
  id: string;
  text: string;
  imageUrl?: string;
  intervalMin: number;
}

interface Customer {
  name: string;
  phone: string;
  addedAt: string;
}

const API = () => `${window.location.origin}`;

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function statusLabel(s: string): { label: string; color: string } {
  switch (s) {
    case 'connected':
      return { label: 'Çevrimiçi', color: '#22c55e' };
    case 'connecting':
      return { label: 'Bağlanıyor', color: '#eab308' };
    case 'waiting_for_qr':
      return { label: 'QR Bekleniyor', color: '#f59e0b' };
    default:
      return { label: 'Kapalı', color: '#ef4444' };
  }
}

// ---------------------------------------------------------------------------
// Uygulama
// ---------------------------------------------------------------------------
export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('mb_token'));
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>('bot1');
  const [loading, setLoading] = useState(true);

  // Duyuru formu
  const [annText, setAnnText] = useState('');
  const [annImage, setAnnImage] = useState('');
  const [annInterval, setAnnInterval] = useState(60);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [running, setRunning] = useState(false);

  // Müşteri
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');

  // Hata mesajları
  const [note, setNote] = useState('');

  // ---------------------------------------------------------------------------
  const authed = Boolean(token);

  async function api<T>(path: string, opts?: RequestInit): Promise<T> {
    const url = `${API()}${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
    });
    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  const refresh = async () => {
    try {
      const data = await api<{ bots: BotInfo[] }>(`/api/status?token=${token}`);
      if (data?.bots) {
        setBots(data.bots);
        const sel = data.bots.find((b) => b.id === selectedId) || data.bots[0];
        if (sel) {
          setSelectedId(sel.id);
          const cfg = (window as any).__cfg || null;
          // config'i ayrı endpoint olmadan state'ten al: announcements + running
          // (durum tek kaynak — status response'a announcements eklenebilir; burada basitleştirme)
        }
      }
    } catch {}
    setLoading(false);
  };

  const fetchExtras = async () => {
    try {
      const cfg = await api<any>(`/api/config?token=${token}&botId=${selectedId}`);
      if (cfg?.config) {
        setAnnouncements(cfg.config.announcements || []);
        setRunning(cfg.config.running || false);
      }
    } catch {}
    try {
      const c = await api<any>(`/api/customers?token=${token}&botId=${selectedId}`);
      if (c?.customers) setCustomers(c.customers);
    } catch {}
  };

  useEffect(() => {
    if (!authed) return;
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    fetchExtras();
  }, [selectedId, authed]);

  // ---------------------------------------------------------------------------
  const doLogin = async () => {
    const r = await api<{ success: boolean; token?: string }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ user: loginUser, pass: loginPass }),
    });
    if (r.success && r.token) {
      localStorage.setItem('mb_token', r.token);
      setToken(r.token);
    } else {
      setNote('Giriş başarısız');
    }
  };

  const doLogout = () => {
    localStorage.removeItem('mb_token');
    setToken(null);
  };

  const showQR = async () => {
    setNote('QR alınıyor...');
    const r = await api<{ success: boolean; qr?: string | null }>(`/api/qr?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ botId: selectedId }),
    });
    setNote(r.success ? 'QR kodu tarayın → WhatsApp > Ayarlar > Bağlı Cihazlar > Cihaz Bağla' : 'QR alınamadı');
  };

  const doReconnect = async () => {
    await api(`/api/reconnect?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ botId: selectedId }),
    });
    setNote('Yeniden bağlanma isteği gönderildi. Bot birkaç saniye içinde bağlanacaktır.');
  };

  const doLogoutBot = async () => {
    if (!confirm('Emin misiniz? Bu, botunuzu listeden çıkarır ve yeni QR gerektirir.')) return;
    await api(`/api/logout?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ botId: selectedId }),
    });
    setNote('Bot kapatıldı.');
    refresh();
  };

  const addAnn = async () => {
    if (!annText.trim()) {
      setNote('Duyuru metni boş olamaz');
      return;
    }
    const r = await api<{ success: boolean }>(`/api/announcement/add?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({
        botId: selectedId,
        text: annText,
        imageUrl: annImage || undefined,
        intervalMin: Number(annInterval) || 60,
      }),
    });
    if (r.success) {
      setAnnText('');
      setAnnImage('');
      setAnnInterval(60);
      setNote('Duyuru eklendi');
      fetchExtras();
    }
  };

  const removeAnn = async (id: string) => {
    await api(`/api/announcement/remove?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ botId: selectedId, annId: id }),
    });
    fetchExtras();
  };

  const toggleBroadcast = async () => {
    const ep = running ? '/api/broadcast/stop' : '/api/broadcast/start';
    await api(`${ep}?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ botId: selectedId }),
    });
    setRunning(!running);
    setNote(running ? 'Duyurular durduruldu' : 'Duyurular başlatıldı');
  };

  const addCust = async () => {
    if (!custName || !custPhone) return;
    const r = await api<{ success: boolean }>(`/api/customer/add?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ botId: selectedId, name: custName, phone: custPhone }),
    });
    if (r.success) {
      setCustName('');
      setCustPhone('');
      fetchExtras();
    } else {
      setNote('Müşteri eklenemedi (aynı isimde müşteri olabilir)');
    }
  };

  const removeCust = async (name: string) => {
    await api(`/api/customer/remove?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ botId: selectedId, name }),
    });
    fetchExtras();
  };

  // ---------------------------------------------------------------------------
  if (!authed) {
    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>MiranBot v3</h2>
          <p style={{ color: '#9ca3af' }}>Panel girişi</p>
          <input style={styles.input} placeholder="Kullanıcı adı" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} />
          <input
            style={styles.input}
            placeholder="Şifre"
            type="password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
          />
          <button style={styles.btn} onClick={doLogin}>Giriş Yap</button>
          {note && <div style={styles.note}>{note}</div>}
        </div>
      </div>
    );
  }

  const bot = bots.find((b) => b.id === selectedId);
  const sl = bot ? statusLabel(bot.status) : statusLabel('disconnected');

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>MiranBot v3</h1>
          <span style={styles.sub}>Miran47 · Yönetici</span>
        </div>
        <button style={styles.smallBtn} onClick={doLogout}>Çıkış</button>
      </header>

      <div style={styles.grid}>
        {/* Sol: botlar */}
        <div style={styles.card}>
          <h3 style={styles.h3}>BOTLAR</h3>
          {bots.map((b) => {
            const s = statusLabel(b.status);
            const active = b.id === selectedId;
            return (
              <div
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                style={{
                  ...styles.botItem,
                  background: active ? '#1f2937' : 'transparent',
                  border: active ? '1px solid #374151' : '1px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                  <strong>{b.id}</strong>
                </div>
                <span style={{ color: s.color, fontSize: 12 }}>{s.label} · {b.groupCount} grup</span>
              </div>
            );
          })}

          {bot && (
            <div style={{ marginTop: 16, padding: 12, background: '#111827', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{bot.id}</strong>
                <span style={{ color: sl.color, fontSize: 12 }}>{sl.label}</span>
              </div>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 0' }}>{bot.activity}</p>
              {bot.lastDisconnectReason && (
                <p style={{ fontSize: 11, color: '#f87171', margin: '4px 0' }}>Son kopma: {bot.lastDisconnectReason}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button style={styles.smallBtn} onClick={doReconnect}>Yeniden Bağlan</button>
                <button style={styles.qrBtn} onClick={showQR}>Yeni QR</button>
              </div>
              {bot.status === 'waiting_for_qr' && bot.qr && (
                <div style={{ marginTop: 10 }}>
                  <img src={bot.qr} alt="QR" style={{ width: '100%', borderRadius: 6 }} />
                  <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
                    WhatsApp → Ayarlar → Bağlı Cihazlar → Cihaz Bağla ile tarayın
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sağ: içerik */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Duyurular */}
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ ...styles.h3, margin: 0 }}>Duyurular</h3>
              <button
                style={running ? styles.stopBtn : styles.startBtn}
                onClick={toggleBroadcast}
                disabled={!announcements.length}
              >
                {running ? '⏸ Durdur' : '▶ Başlat'}
              </button>
            </div>

            <textarea
              style={styles.textarea}
              placeholder="Mesaj (link veya görsel URL'si içerebilir, akıllı formatta gönderilir)"
              value={annText}
              onChange={(e) => setAnnText(e.target.value)}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input
                style={styles.input}
                placeholder="Aralık (dakika)"
                type="number"
                min={1}
                value={annInterval}
                onChange={(e) => setAnnInterval(Number(e.target.value))}
              />
              <input
                style={styles.input}
                placeholder="Görsel URL (isteğe bağlı)"
                value={annImage}
                onChange={(e) => setAnnImage(e.target.value)}
              />
            </div>
            <button style={{ ...styles.btn, marginTop: 10 }} onClick={addAnn}>+ Duyuru Ekle</button>

            <div style={{ marginTop: 12 }}>
              {announcements.length === 0 && <p style={styles.empty}>Henüz duyuru yok.</p>}
              {announcements.map((a) => (
                <div key={a.id} style={styles.annItem}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{a.text.slice(0, 80)}{a.text.length > 80 ? '...' : ''}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      Her {a.intervalMin} dk{a.imageUrl ? ' · görselli' : ''}
                    </div>
                  </div>
                  <button style={styles.delBtn} onClick={() => removeAnn(a.id)}>✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Müşteriler */}
          <div style={styles.card}>
            <h3 style={styles.h3}>Müşteriler ({customers.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input style={styles.input} placeholder="Müşteri adı" value={custName} onChange={(e) => setCustName(e.target.value)} />
              <input style={styles.input} placeholder="Telefon" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
            </div>
            <button style={{ ...styles.btn, marginTop: 10 }} onClick={addCust}>+ Müşteri Ekle</button>
            <div style={{ marginTop: 12 }}>
              {customers.length === 0 && <p style={styles.empty}>Henüz müşteri yok.</p>}
              {customers.map((c) => (
                <div key={c.name + c.phone} style={styles.annItem}>
                  <div style={{ flex: 1 }}>
                    <strong>{c.name}</strong> <span style={{ fontSize: 12, color: '#9ca3af' }}>{c.phone}</span>
                  </div>
                  <button style={styles.delBtn} onClick={() => removeCust(c.name)}>✕</button>
                </div>
              ))}
            </div>
          </div>

          {note && <div style={styles.note}>{note}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stiller
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0b1120' },
  card: { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 18 },
  input: {
    background: '#0b1120',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '10px 12px',
    color: '#f3f4f6',
    fontSize: 14,
    outline: 'none',
  },
  textarea: {
    background: '#0b1120',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '10px 12px',
    color: '#f3f4f6',
    fontSize: 14,
    minHeight: 90,
    resize: 'vertical',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  btn: {
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  smallBtn: {
    background: '#374151',
    color: '#f3f4f6',
    border: 'none',
    borderRadius: 6,
    padding: '7px 14px',
    fontSize: 13,
    cursor: 'pointer',
  },
  qrBtn: {
    background: '#eab308',
    color: '#111827',
    border: 'none',
    borderRadius: 6,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  startBtn: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' },
  stopBtn: { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' },
  delBtn: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 },
  note: { marginTop: 10, padding: 8, background: '#1f2937', borderRadius: 6, fontSize: 12, color: '#e5e7eb' },
  empty: { color: '#6b7280', fontSize: 12, textAlign: 'center' },
  annItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #1f2937', fontSize: 13 },
  title: { margin: 0, fontSize: 18, color: '#f3f4f6' },
  sub: { fontSize: 12, color: '#9ca3af' },
  h3: { color: '#f3f4f6', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' as const, margin: 0 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: '#0b1120', borderBottom: '1px solid #1f2937' },
  wrap: { minHeight: '100vh', background: '#0b1120', color: '#f3f4f6', fontFamily: 'system-ui, sans-serif' },
  grid: { display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, padding: 16, alignItems: 'start' },
  botItem: { padding: '10px 12px', marginBottom: 6, borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 },
};
