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

type TabId = 'bot' | 'ann' | 'cust';

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function statusMeta(s: string): { label: string; color: string; glow: string } {
  switch (s) {
    case 'connected':
      return { label: 'Çevrimiçi', color: '#10b981', glow: 'rgba(16,185,129,0.35)' };
    case 'connecting':
      return { label: 'Bağlanıyor', color: '#f59e0b', glow: 'rgba(245,158,11,0.35)' };
    case 'waiting_for_qr':
      return { label: 'QR Bekleniyor', color: '#f59e0b', glow: 'rgba(245,158,11,0.35)' };
    default:
      return { label: 'Kapalı', color: '#ef4444', glow: 'rgba(239,68,68,0.35)' };
  }
}

function cx(...cls: (string | false | undefined)[]): string {
  return cls.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// İkonlar (SVG)
// ---------------------------------------------------------------------------
const Icon = {
  Bot: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  ),
  Megaphone: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 11 18-5v12L3 13v-2z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Qr: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3z" /><path d="M21 14h-3v3" /><path d="M14 21h7" /><path d="M21 21v-7" />
    </svg>
  ),
  Plug: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v6" /><path d="M15 2v6" /><path d="M12 17v5" /><path d="M5 8h14" /><path d="M6 11V8h12v3a6 6 0 1 1-12 0Z" />
    </svg>
  ),
  LogOut: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Play: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
  ),
  Pause: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Refresh: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" />
    </svg>
  ),
  Power: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Clock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// CSS-in-JS temaları
// ---------------------------------------------------------------------------
const C = {
  bg: '#07090f',
  surface: '#10131c',
  surface2: '#161a26',
  line: '#22283a',
  lineSoft: '#1c2132',
  text: '#e8ecf4',
  textDim: '#8b93a7',
  textMute: '#5b6478',
  accent: '#6366f1',
  accent2: '#818cf8',
  green: '#10b981',
  greenSoft: 'rgba(16,185,129,0.12)',
  amber: '#f59e0b',
  amberSoft: 'rgba(245,158,11,0.12)',
  red: '#ef4444',
  redSoft: 'rgba(239,68,68,0.12)',
  wa: '#25d366',
};

const css = `
* { box-sizing: border-box; }
body { margin: 0; background: ${C.bg}; }
@keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
@keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.fade-in { animation: fade-in .3s ease-out; }
.pulse-dot { animation: pulse-dot 1.6s infinite; }
.qr-frame {
  background: #ffffff; border-radius: 16px; padding: 16px;
  box-shadow: 0 8px 32px rgba(99,102,241,.18), 0 2px 8px rgba(0,0,0,.4);
}
.btn-press:active { transform: scale(.97); }
input:focus, textarea:focus { border-color: ${C.accent} !important; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 4px; }
`;

// ---------------------------------------------------------------------------
// Uygulama
// ---------------------------------------------------------------------------
export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('mb_token'));
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>('bot1');
  const [addBotId, setAddBotId] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('bot');

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

  // İşlem durumları
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);

  const authed = Boolean(token);
  const notify = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  async function api<T>(path: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(`${window.location.origin}${path}`, {
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
        if (sel && sel.id !== selectedId) setSelectedId(sel.id);
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
    fetchExtras();
    const t = setInterval(() => { refresh(); fetchExtras(); }, 4000);
    return () => clearInterval(t);
  }, [authed, selectedId]);

  // ---------------------------------------------------------------------------
  const doLogin = async () => {
    try {
      const r = await api<{ success: boolean; token?: string }>('/api/login', {
        method: 'POST',
        body: JSON.stringify({ user: loginUser, pass: loginPass }),
      });
      if (r.success && r.token) {
        localStorage.setItem('mb_token', r.token);
        setToken(r.token);
      } else {
        setLoginErr('Kullanıcı adı veya şifre hatalı');
      }
    } catch {
      setLoginErr('Sunucuya bağlanılamadı');
    }
  };

  const doLogout = () => {
    localStorage.removeItem('mb_token');
    setToken(null);
  };

  const showQR = async () => {
    if (qrLoading) return;
    setQrLoading(true);
    try {
      const r = await api<{ success: boolean; qr?: string | null }>(`/api/qr?token=${token}`, {
        method: 'POST',
        body: JSON.stringify({ botId: selectedId }),
      });
      if (r.success) {
        notify('ok', 'QR kodu oluşturuldu — WhatsApp ile tarayın');
        refresh();
      } else {
        notify('err', 'QR kodu oluşturulamadı');
      }
    } catch {
      notify('err', 'Sunucuya bağlanılamadı');
    } finally {
      setQrLoading(false);
    }
  };

  const doReconnect = async () => {
    setBusy(true);
    try {
      await api(`/api/reconnect?token=${token}`, {
        method: 'POST',
        body: JSON.stringify({ botId: selectedId }),
      });
      notify('ok', 'Bağlantı isteği gönderildi — birkaç saniye içinde bağlanır');
    } catch {
      notify('err', 'Sunucuya bağlanılamadı');
    } finally {
      setBusy(false);
    }
  };

  const doLogoutBot = async () => {
    if (!confirm('Emin misiniz? Bu işlem oturumu siler ve yeni QR gerektirir.')) return;
    await api(`/api/logout?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ botId: selectedId }),
    });
    notify('ok', 'Bot oturumu kapatıldı ve silindi');
    refresh();
  };

  const addAnn = async () => {
    if (!annText.trim()) {
      notify('err', 'Duyuru metni boş olamaz');
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
      notify('ok', 'Duyuru eklendi');
      fetchExtras();
    } else {
      notify('err', 'Duyuru eklenemedi');
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
    notify('ok', running ? 'Duyurular durduruldu' : 'Duyurular başlatıldı');
  };

  const addCust = async () => {
    if (!custName || !custPhone) {
      notify('err', 'Ad ve telefon gereklidir');
      return;
    }
    const r = await api<{ success: boolean }>(`/api/customer/add?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ botId: selectedId, name: custName, phone: custPhone }),
    });
    if (r.success) {
      setCustName('');
      setCustPhone('');
      notify('ok', 'Müşteri eklendi');
      fetchExtras();
    } else {
      notify('err', 'Müşteri eklenemedi (muhtemelen aynı isimde müşteri var)');
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
  // GİRİŞ EKRANI
  // ---------------------------------------------------------------------------
  if (!authed) {
    return (
      <div style={S.centerWrap}>
        <style>{css}</style>
        <div className="fade-in" style={S.loginCard}>
          <div style={S.loginLogo}>
            <div style={S.logoCircle}>
              <Icon.Bot />
            </div>
          </div>
          <h1 style={S.loginTitle}>MiranBot</h1>
          <p style={S.loginSub}>v3 · Yönetim Paneli</p>
          <input
            style={S.input}
            placeholder="Kullanıcı adı"
            autoComplete="username"
            value={loginUser}
            onChange={(e) => { setLoginUser(e.target.value); setLoginErr(''); }}
            onKeyDown={(e) => e.key === 'Enter' && loginPass && doLogin()}
          />
          <input
            style={S.input}
            placeholder="Şifre"
            type="password"
            autoComplete="current-password"
            value={loginPass}
            onChange={(e) => { setLoginPass(e.target.value); setLoginErr(''); }}
            onKeyDown={(e) => e.key === 'Enter' && loginUser && doLogin()}
          />
          {loginErr && <div style={S.errBox}>{loginErr}</div>}
          <button className="btn-press" style={S.primaryBtn} onClick={doLogin}>Giriş Yap</button>
          <div style={S.loginFoot}>7/24 WhatsApp duyuru platformu</div>
        </div>
      </div>
    );
  }

  // Bot listesi boşsa bile panel kullanılabilir kalsın: varsayılan bot1
  const effectiveId = bots.length > 0 ? selectedId : 'bot1';
  const bot = bots.find((b) => b.id === effectiveId) || null;
  const sm = bot ? statusMeta(bot.status) : statusMeta('disconnected');
  const onlineCount = bots.filter((b) => b.status === 'connected').length;

  const tabs: { id: TabId; label: string; icon: JSX.Element }[] = [
    { id: 'bot', label: 'Bot Durumu', icon: <Icon.Bot /> },
    { id: 'ann', label: 'Duyurular', icon: <Icon.Megaphone /> },
    { id: 'cust', label: 'Müşteriler', icon: <Icon.Users /> },
  ];

  // ---------------------------------------------------------------------------
  // ANA EKRAN
  // ---------------------------------------------------------------------------
  return (
    <div style={S.wrap}>
      <style>{css}</style>

      {/* Üst bar */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.logoCircleSmall}>
            <Icon.Bot />
          </div>
          <div>
            <div style={S.headerTitle}>MiranBot <span style={{ color: C.accent2, fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>v3</span></div>
            <div style={S.headerSub}>Yönetim Paneli</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={S.headerPill}>
            <span className={cx('pulse-dot', bot?.status === 'connected' && 'pulse-dot')} style={{ width: 8, height: 8, borderRadius: '50%', background: sm.color, boxShadow: `0 0 8px ${sm.glow}` }} />
            <span style={{ color: C.textDim, fontSize: 12 }}>{onlineCount} / {bots.length} bot çevrimiçi</span>
          </div>
          <button className="btn-press" style={S.iconBtn} onClick={doLogout} title="Çıkış">
            <Icon.LogOut />
          </button>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fade-in" style={toast.type === 'ok' ? S.toast : { ...S.toast, background: C.redSoft, border: `1px solid ${C.red}`, color: '#fca5a5' }}>
          {toast.type === 'ok' && <Icon.Check />} {toast.msg}
        </div>
      )}

      <div style={S.body}>
        {/* Sol menü */}
        <nav style={S.nav}>
          <div style={S.navLabel}>MENÜ</div>
          {tabs.map((t) => (
            <button
              key={t.id}
              className="btn-press"
              style={tab === t.id ? S.navItemActive : S.navItem}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
          <div style={S.navSep} />
          <div style={S.navLabel}>BOTLAR</div>
          {bots.length === 0 && <div style={S.emptyNav}>Henüz bot yok — aşağıdan ekleyin</div>}
          {bots.map((b) => {
            const s = statusMeta(b.status);
            const active = b.id === selectedId;
            return (
              <button
                key={b.id}
                className="btn-press"
                style={active ? S.botItemActive : S.botItem}
                onClick={() => setSelectedId(b.id)}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, boxShadow: `0 0 6px ${s.glow}` }} />
                <span style={{ flex: 1, textAlign: 'left' }}>{b.id}</span>
                <span style={{ fontSize: 10, color: s.color }}>{b.groupCount} grp</span>
              </button>
            );
          })}
          <div style={{ display: 'flex', gap: 6, padding: '8px 10px' }}>
            <input
              style={{ ...S.input, fontSize: 11, padding: '7px 9px' }}
              placeholder="Yeni bot id (örn: bot2)"
              value={addBotId}
              onChange={(e) => setAddBotId(e.target.value)}
            />
            <button
              className="btn-press"
              style={{ ...S.btnGhost, padding: '7px 10px', fontSize: 11 }}
              onClick={async () => {
                const id = addBotId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
                if (!id) { notify('err', 'Geçerli bir bot id girin (harf/rakam)'); return; }
                // QR çağrısı bot config'ini oluşturur
                const r = await api<{ success: boolean; qr?: string | null }>(`/api/qr?token=${token}`, {
                  method: 'POST',
                  body: JSON.stringify({ botId: id }),
                });
                if (r.success) { notify('ok', `Bot "${id}" eklendi ve QR oluşturuldu`); refresh(); }
                else notify('err', 'Bot eklenemedi');
              }}
            >
              <Icon.Plus />
            </button>
          </div>
          <div style={S.navFoot}>MiranBot v3 · stabil motor</div>
        </nav>

        {/* İçerik */}
        <main style={S.main}>
          {tab === 'bot' && (
            <div className="fade-in" key="bot">
              {/* Durum kartı */}
              <div style={S.card}>
                <div style={S.cardHead}>
                  <div>
                    <div style={S.cardTitle}>{bot?.id || 'Seçili bot yok'}</div>
                    <div style={{ ...S.statusPill, background: sm.color + '1a', color: sm.color, border: `1px solid ${sm.color}44` }}>
                      <span className={cx(bot?.status === 'connected' && 'pulse-dot', 'pulse-dot')} style={{ width: 8, height: 8, borderRadius: '50%', background: sm.color, boxShadow: `0 0 8px ${sm.glow}` }} />
                      {sm.label}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-press" style={S.btnGhost} onClick={showQR} disabled={qrLoading}>
                      <Icon.Qr /> {qrLoading ? 'Yükleniyor...' : 'Yeni QR'}
                    </button>
                    <button className="btn-press" style={S.btnGhost} onClick={doReconnect} disabled={busy}>
                      <Icon.Plug /> Yeniden Bağlan
                    </button>
                    <button className="btn-press" style={S.btnDangerGhost} onClick={doLogoutBot}>
                      <Icon.Power /> Oturumu Kapat
                    </button>
                  </div>
                </div>

                <div style={S.statsRow}>
                  <div style={S.stat}>
                    <div style={S.statNum}>{bot?.groupCount ?? 0}</div>
                    <div style={S.statLabel}>Grup</div>
                  </div>
                  <div style={S.statSep} />
                  <div style={S.stat}>
                    <div style={{ ...S.statNum, color: sm.color }}>{sm.label}</div>
                    <div style={S.statLabel}>Durum</div>
                  </div>
                  <div style={S.statSep} />
                  <div style={S.stat}>
                    <div style={S.statNum}>{announcements.length}</div>
                    <div style={S.statLabel}>Duyuru</div>
                  </div>
                  <div style={S.statSep} />
                  <div style={S.stat}>
                    <div style={{ ...S.statNum, color: running ? C.green : C.textMute }}>{running ? 'Aktif' : 'Durdurulmuş'}</div>
                    <div style={S.statLabel}>Yayın</div>
                  </div>
                </div>

                {bot?.activity && <div style={S.activity}>Son aktivite: {bot.activity}</div>}
                {bot?.lastDisconnectReason && (
                  <div style={S.disconnectNote}>Son bağlantı kesilme nedeni: {bot.lastDisconnectReason}</div>
                )}
              </div>

              {/* QR kartı */}
              <div style={{ ...S.card, marginTop: 16 }}>
                <div style={S.cardHead}>
                  <div style={S.cardTitle}>QR Kodu ile Bağlan</div>
                    <button className="btn-press" style={{ ...S.btnGhost, fontSize: 12, padding: '7px 12px' }} onClick={showQR} disabled={qrLoading}>
                      <Icon.Refresh /> QR'ı Yenile
                    </button>
                </div>
                {bot && bot.status === 'waiting_for_qr' && bot.qr ? (
                  <div style={S.qrArea}>
                    <div className="qr-frame">
                      <img src={bot.qr} alt="WhatsApp QR" style={{ width: 280, height: 280 }} />
                    </div>
                    <div style={S.qrSteps}>
                      <div style={S.qrStep}><span style={S.stepNo}>1</span> WhatsApp'ı açın</div>
                      <div style={S.qrStep}><span style={S.stepNo}>2</span> <b>Ayarlar → Bağlı Cihazlar</b> yolunu izleyin</div>
                      <div style={S.qrStep}><span style={S.stepNo}>3</span> <b>Cihaz Bağla</b> ile bu kodu tarayın</div>
                    </div>
                    <div style={S.qrHint}>QR 60 saniyede bir süresi dolabilir — dolarsa yenile butonuna basın.</div>
                  </div>
                ) : bot && bot.status === 'connected' ? (
                  <div style={S.qrConnected}>
                    <Icon.Check /> <span>Botunuz bağlı ve hazır. Gruplara komut gönderebilir, duyurularınızı başlatabilirsiniz.</span>
                  </div>
                ) : (
                  <div style={S.qrEmpty}>
                    <div style={{ opacity: 0.35 }}><Icon.Qr /></div>
                    <div style={{ fontWeight: 600, margin: '10px 0 4px' }}>Henüz QR oluşturulmadı</div>
                    <div style={{ fontSize: 12, color: C.textMute, maxWidth: 340, textAlign: 'center' }}>
                      Sağdaki <b>Yeni QR</b> butonuna basarak WhatsApp bağlantısını başlatın.
                    </div>
                    <button className="btn-press" style={{ ...S.primaryBtn, width: 'auto', padding: '10px 26px', marginTop: 14 }} onClick={showQR} disabled={qrLoading}>
                      <Icon.Qr /> {qrLoading ? 'Oluşturuluyor...' : 'Yeni QR Oluştur'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'ann' && (
            <div className="fade-in" key="ann">
              <div style={S.card}>
                <div style={S.cardHead}>
                  <div style={S.cardTitle}>Duyurular</div>
                  <button
                    className="btn-press"
                    style={running ? S.btnDanger : S.btnPrimary}
                    onClick={toggleBroadcast}
                    disabled={!announcements.length}
                  >
                    {running ? <><Icon.Pause /> Yayını Durdur</> : <><Icon.Play /> Yayını Başlat</>}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <div style={S.fieldLabel}>Mesaj metni</div>
                    <textarea
                      style={S.textarea}
                      rows={3}
                      placeholder="Duyuru mesajı... Link veya görsel URL'si içerebilir; akıllı format ile otomatik gönderilir."
                      value={annText}
                      onChange={(e) => setAnnText(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10 }}>
                  <div>
                    <div style={S.fieldLabel}>Tekrar aralığı (dakika)</div>
                    <input style={S.input} type="number" min={1} value={annInterval} onChange={(e) => setAnnInterval(Number(e.target.value))} />
                  </div>
                  <div>
                    <div style={S.fieldLabel}>Görsel URL'si (isteğe bağlı)</div>
                    <input style={S.input} placeholder="https://...jpg / .png" value={annImage} onChange={(e) => setAnnImage(e.target.value)} />
                  </div>
                </div>
                <button className="btn-press" style={{ ...S.btnPrimary, marginTop: 12, width: 'auto', padding: '10px 22px' }} onClick={addAnn}>
                  <Icon.Plus /> Duyuru Ekle
                </button>

                <div style={S.divider} />
                <div>
                  {announcements.length === 0 && <div style={S.emptyState}>Henüz duyuru yok — yukarıdan ilk duyurunuzu ekleyin.</div>}
                  {announcements.map((a) => (
                    <div key={a.id} style={S.listItem}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.text}</div>
                        <div style={{ fontSize: 11, color: C.textMute, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Icon.Clock /> Her {a.intervalMin} dakikada bir{a.imageUrl ? ' · görselli gönderim' : ''}
                        </div>
                      </div>
                      <button className="btn-press" style={S.delBtn} onClick={() => removeAnn(a.id)}><Icon.Trash /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'cust' && (
            <div className="fade-in" key="cust">
              <div style={S.card}>
                <div style={S.cardHead}>
                  <div style={S.cardTitle}>Müşteriler <span style={{ color: C.textMute, fontSize: 12, fontWeight: 500 }}>({customers.length})</span></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <div style={S.fieldLabel}>Müşteri adı</div>
                    <input style={S.input} placeholder="Örn: Ali Grubu" value={custName} onChange={(e) => setCustName(e.target.value)} />
                  </div>
                  <div>
                    <div style={S.fieldLabel}>Telefon</div>
                    <input style={S.input} placeholder="+90 5xx xxx xx xx" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
                  </div>
                  <button className="btn-press" style={{ ...S.btnPrimary, height: 40 }} onClick={addCust}><Icon.Plus /></button>
                </div>
                <div style={S.divider} />
                <div>
                  {customers.length === 0 && <div style={S.emptyState}>Henüz müşteri yok.</div>}
                  {customers.map((c) => (
                    <div key={c.name + c.phone} style={S.listItem}>
                      <div style={{ flex: 1 }}>
                        <strong style={{ color: C.text }}>{c.name}</strong>
                        <span style={{ fontSize: 12, color: C.textMute, marginLeft: 8 }}>{c.phone}</span>
                      </div>
                      <button className="btn-press" style={S.delBtn} onClick={() => removeCust(c.name)}><Icon.Trash /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stiller
// ---------------------------------------------------------------------------
const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', flexDirection: 'column' },

  // üst bar
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 20px', background: C.surface, borderBottom: `1px solid ${C.line}`,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 15, fontWeight: 800, margin: 0, letterSpacing: -0.2 },
  headerSub: { fontSize: 10, color: C.textMute, letterSpacing: 1.5, textTransform: 'uppercase' },
  headerPill: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
    background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999,
  },
  logoCircle: {
    width: 64, height: 64, borderRadius: 20, background: `linear-gradient(135deg, ${C.accent}, #8b5cf6)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', marginBottom: 14,
  },
  logoCircleSmall: {
    width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.accent}, #8b5cf6)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
  },
  iconBtn: {
    background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 8,
    color: C.textDim, cursor: 'pointer', display: 'flex',
  },

  // toast
  toast: {
    position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
    padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
    background: C.greenSoft, border: `1px solid ${C.green}`, color: '#6ee7b7',
    display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
  },

  // gövde
  body: { display: 'grid', gridTemplateColumns: '230px 1fr', gap: 18, padding: 18, alignItems: 'start', flex: 1 },
  nav: {
    background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14,
    display: 'flex', flexDirection: 'column', position: 'sticky', top: 18,
  },
  navLabel: { fontSize: 10, color: C.textMute, letterSpacing: 2, fontWeight: 600, padding: '8px 10px 4px' },
  navItem: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
    background: 'transparent', border: `1px solid transparent`, borderRadius: 9, color: C.textDim,
    fontSize: 13, cursor: 'pointer', textAlign: 'left',
  },
  navItemActive: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
    background: `${C.accent}1f`, border: `1px solid ${C.accent}55`, borderRadius: 9, color: C.accent2,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
  },
  navSep: { height: 1, background: C.line, margin: '8px 0' },
  emptyNav: { fontSize: 11, color: C.textMute, padding: '8px 10px' },
  botItem: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
    background: 'transparent', border: `1px solid transparent`, borderRadius: 9,
    color: C.textDim, fontSize: 12, cursor: 'pointer', textAlign: 'left',
  },
  botItemActive: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
    background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 9,
    color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
  },
  navFoot: { fontSize: 10, color: C.textMute, padding: '14px 10px 2px' },
  main: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },

  // kartlar
  card: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  cardTitle: { fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: -0.2 },
  divider: { height: 1, background: C.line, margin: '14px 0' },

  // durum
  statusPill: {
    display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '4px 12px',
    fontSize: 11, fontWeight: 700, marginTop: 6,
  },
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', background: C.surface2,
    border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 6px', marginTop: 4,
  },
  stat: { textAlign: 'center' },
  statNum: { fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.2 },
  statLabel: { fontSize: 10, color: C.textMute, marginTop: 3, textTransform: 'uppercase', letterSpacing: 1 },
  statSep: { width: 1, background: C.line, margin: '0 4px' },
  activity: { fontSize: 11, color: C.textMute, marginTop: 10 },
  disconnectNote: {
    fontSize: 11, color: '#fca5a5', marginTop: 6, background: C.redSoft,
    border: `1px solid ${C.red}33`, borderRadius: 8, padding: '6px 10px',
  },

  // butonlar
  primaryBtn: {
    background: `linear-gradient(135deg, ${C.accent}, #8b5cf6)`, color: '#fff', border: 'none',
    borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    boxShadow: `0 4px 16px ${C.accent}44`, width: '100%',
  },
  btnPrimary: {
    background: `linear-gradient(135deg, ${C.accent}, #8b5cf6)`, color: '#fff', border: 'none',
    borderRadius: 9, padding: '9px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    boxShadow: `0 3px 12px ${C.accent}33`, display: 'flex', alignItems: 'center', gap: 7,
  },
  btnDanger: {
    background: `linear-gradient(135deg, ${C.red}, #dc2626)`, color: '#fff', border: 'none',
    borderRadius: 9, padding: '9px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 7,
  },
  btnGhost: {
    background: C.surface2, color: C.textDim, border: `1px solid ${C.line}`, borderRadius: 9,
    padding: '9px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 7,
  },
  btnDangerGhost: {
    background: 'transparent', color: '#f87171', border: `1px solid ${C.red}44`, borderRadius: 9,
    padding: '9px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 7,
  },
  delBtn: {
    background: 'transparent', border: `1px solid transparent`, borderRadius: 8, padding: 7,
    color: C.textMute, cursor: 'pointer', display: 'flex',
  },

  // inputlar
  input: {
    width: '100%', background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 9,
    padding: '10px 12px', color: C.text, fontSize: 13, outline: 'none',
  },
  textarea: {
    width: '100%', background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 9,
    padding: '10px 12px', color: C.text, fontSize: 13, outline: 'none', resize: 'vertical',
  },
  fieldLabel: { fontSize: 11, color: C.textMute, fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },

  // liste
  listItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 2px', borderBottom: `1px solid ${C.lineSoft}` },
  emptyState: { color: C.textMute, fontSize: 12.5, textAlign: 'center', padding: '14px 0' },

  // QR
  qrArea: { display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  qrSteps: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 230 },
  qrStep: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: C.textDim },
  stepNo: {
    width: 22, height: 22, borderRadius: 7, background: `${C.accent}22`, border: `1px solid ${C.accent}55`,
    color: C.accent2, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  qrHint: { width: '100%', textAlign: 'center', fontSize: 11, color: C.textMute, marginTop: 14 },
  qrConnected: {
    display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', padding: 26,
    background: C.greenSoft, border: `1px solid ${C.green}33`, borderRadius: 12, color: '#6ee7b7', fontSize: 13,
  },
  qrEmpty: { textAlign: 'center', padding: '22px 0 10px' },

  // giriş
  centerWrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
    background: `radial-gradient(ellipse at 50% 0%, #151a2e 0%, ${C.bg} 55%)`,
  },
  loginCard: {
    width: 340, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18,
    padding: 30, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.5)',
  },
  loginTitle: { margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: -0.5 },
  loginSub: { margin: '4px 0 22px', fontSize: 12, color: C.textMute, letterSpacing: 1 },
  errBox: {
    margin: '10px 0', padding: '8px 12px', borderRadius: 9, fontSize: 12, color: '#fca5a5',
    background: C.redSoft, border: `1px solid ${C.red}33`,
  },
  loginFoot: { fontSize: 10, color: C.textMute, marginTop: 16 },
};
