import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  MessageSquare, 
  Power, 
  LogOut, 
  Plus, 
  Trash2, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Bot,
  Users,
  UserPlus,
  Lock,
  User,
  Key,
  Shield,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Broadcast {
  id: string;
  message: string;
  interval: number;
  imageUrl?: string;
  lastSent?: number;
}

interface BotConfig {
  adminGroupId: string;
  broadcasts: Broadcast[];
  isActive: boolean;
  sentCount?: number;
}

interface BotState {
  id: string;
  status: 'connected' | 'disconnected' | 'waiting_for_qr' | 'connecting';
  qr: string | null;
  pairingCode?: string | null;
  pairingPhone?: string | null;
  hasSession?: boolean;
  activity?: string;
  groupCount?: number;
  config: BotConfig;
}

interface StatusResponse {
  bots: BotState[];
}

interface UserState {
  username: string;
  role: 'admin' | 'user';
  botId: string;
}

interface ClientUser {
  username: string;
  password: string;
  role: string;
  botId: string;
  expiresAt?: string;
}

export default function App() {
  // Authentication & session state
  const [user, setUser] = useState<UserState | null>(() => {
    try {
      const saved = localStorage.getItem('miran_user');
      if (!saved || saved === 'undefined') return null;
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved user:', e);
      try { localStorage.removeItem('miran_user'); } catch (_) {}
      return null;
    }
  });
  
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // App core states
  const [bots, setBots] = useState<BotState[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [newMessage, setNewMessage] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newInterval, setNewInterval] = useState(60);
  const [loading, setLoading] = useState(false);

  // Admin-only management states
  const [usersList, setUsersList] = useState<ClientUser[]>([]);
  const [newClientUsername, setNewClientUsername] = useState('');
  const [newClientPassword, setNewClientPassword] = useState('');
  const [newClientExpiresAt, setNewClientExpiresAt] = useState('');
  const [editingClient, setEditingClient] = useState<ClientUser | null>(null);
  const [editClientPassword, setEditClientPassword] = useState('');
  const [editClientExpiresAt, setEditClientExpiresAt] = useState('');
  const [clientError, setClientError] = useState('');
  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [activeView, setActiveView] = useState<'bot' | 'clients'>('bot');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      setLoginError('Lütfen tüm alanları doldurun.');
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${window.location.origin}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('miran_user', JSON.stringify(data.user));
        setSelectedBotId(data.user.botId);
      } else {
        setLoginError(data.message || 'Giriş başarısız. Kullanıcı adı veya şifre hatalı!');
      }
    } catch (err) {
      setLoginError('Sunucu bağlantısı kurulamadı.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setBots([]);
    setUsersList([]);
    setSelectedBotId('');
    localStorage.removeItem('miran_user');
  };

  const fetchStatus = async () => {
    if (!user) return;
    try {
      const url = `${window.location.origin}/api/status?role=${user.role}&botId=${user.botId}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data: StatusResponse = await res.json();
      setBots(data.bots || []);
      
      // Auto-set selected bot if not already set or invalid
      if (data.bots && data.bots.length > 0) {
        const botExists = data.bots.some(b => b.id === selectedBotId);
        if (!selectedBotId || !botExists) {
          setSelectedBotId(data.bots[0].id);
        }
      }
    } catch (e) {
      console.error('Fetch error:', e);
    }
  };

  const fetchClients = async () => {
    if (!user || user.role !== 'admin') return;
    try {
      const res = await fetch(`${window.location.origin}/api/admin/users`);
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
      }
    } catch (e) {
      console.error('Fetch clients error:', e);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStatus();
      if (user.role === 'admin') {
        fetchClients();
      }
      const interval = setInterval(() => {
        fetchStatus();
        if (user.role === 'admin') {
          fetchClients();
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [user, selectedBotId]);

  const updateConfig = async (botId: string, updates: Partial<BotConfig>) => {
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, ...updates }),
      });
      const data = await res.json();
      if (data.success === false && data.message) {
        alert(data.message);
      }
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const manageBroadcast = async (botId: string, action: 'add' | 'delete', broadcast?: any) => {
    setLoading(true);
    try {
      await fetch(`${window.location.origin}/api/broadcasts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, action, broadcast }),
      });
      await fetchStatus();
      if (action === 'add') {
        setNewMessage('');
        setNewImageUrl('');
        setNewInterval(60);
      }
    } finally {
      setLoading(false);
    }
  };

  const logoutBot = async (botId: string) => {
    if (!confirm('Bu WhatsApp oturumunu kapatmak istediğinize emin misiniz?')) return;
    setLoading(true);
    try {
      await fetch(`${window.location.origin}/api/logout`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId })
      });
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const reconnectBot = async (botId: string) => {
    setLoading(true);
    try {
      await fetch(`${window.location.origin}/api/reconnect`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId })
      });
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const resetBot = async (botId: string) => {
    if (!confirm('Botu tamamen sıfırlamak ve yeni QR kod almak istediğinize emin misiniz?')) return;
    setLoading(true);
    try {
      await fetch(`${window.location.origin}/api/reset`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId })
      });
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const addClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientUsername || !newClientPassword) {
      setClientError('Tüm alanları doldurun.');
      return;
    }
    setLoading(true);
    setClientError('');
    try {
      const res = await fetch(`${window.location.origin}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: newClientUsername, 
          password: newClientPassword, 
          expiresAt: newClientExpiresAt 
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewClientUsername('');
        setNewClientPassword('');
        setNewClientExpiresAt('');
        setShowAddClientForm(false);
        await fetchClients();
        await fetchStatus();
      } else {
        setClientError(data.message || 'Müşteri eklenirken hata oluştu!');
      }
    } catch (err) {
      setClientError('Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  };

  const editClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/admin/users/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: editingClient.username, 
          password: editClientPassword, 
          expiresAt: editClientExpiresAt 
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingClient(null);
        setEditClientPassword('');
        setEditClientExpiresAt('');
        await fetchClients();
        await fetchStatus();
      } else {
        alert(data.message || 'Müşteri güncellenirken hata oluştu!');
      }
    } catch (err) {
      alert('Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  };

  const deleteClient = async (username: string) => {
    if (!confirm(`${username} isimli müşteriyi ve tüm bot oturum verilerini silmek istediğinize emin misiniz?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/admin/users/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      if (res.ok) {
        await fetchClients();
        await fetchStatus();
        if (selectedBotId === `bot_${username.toLowerCase()}`) {
          setSelectedBotId('bot1');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Auth Guard: Render elegant login screen if user is not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4 relative overflow-hidden font-sans">
        {/* Subtle decorative background lights */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 relative shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mx-auto border border-blue-500/20">
              <Bot className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-4">Miran Bot Portalı</h1>
            <p className="text-slate-400 text-sm">Giriş yaparak botunuzu yönetin ve duyuru sistemini başlatın</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kullanıcı Adı</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Kullanıcı adınız..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Şifre</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Key className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Şifreniz..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>
            </div>

            {loginError && (
              <div className="p-3 bg-red-950/30 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold py-3 rounded-xl transition-all shadow-lg hover:shadow-blue-500/10 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {loginLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>Giriş Yap</>
              )}
            </button>
          </form>

          <div className="border-t border-slate-800/80 pt-4 text-center">
            <p className="text-[11px] text-slate-500">
              Miran Bot • SaaS Çoklu Müşteri Dağıtım Sistemi v2.0
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Handle empty state while loading first bot data
  if (bots.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="text-center space-y-4">
          <RefreshCw className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
          <p className="text-sm text-slate-400">Veriler yükleniyor, lütfen bekleyin...</p>
        </div>
      </div>
    );
  }

  const selectedBot = bots.find(b => b.id === selectedBotId) || bots[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4 font-sans selection:bg-blue-500/30">
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        
        {/* Navigation / Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sticky top-4 z-10 backdrop-blur-md bg-slate-900/80 shadow-2xl flex flex-col gap-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 border border-blue-500/20">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Miran Bot Paneli
                  {user.role === 'admin' && (
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Yönetici
                    </span>
                  )}
                </h1>
                <p className="text-slate-400 text-xs mt-0.5">
                  Giriş yapan: <span className="text-blue-400 font-semibold">{user.username}</span>
                </p>
              </div>
            </div>

            {/* Role navigation & actions */}
            <div className="flex items-center gap-2">
              {user.role === 'admin' && (
                <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center">
                  <button
                    onClick={() => setActiveView('bot')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      activeView === 'bot' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Bot Yönetimi
                  </button>
                  <button
                    onClick={() => setActiveView('clients')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeView === 'clients' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" /> Müşteriler
                  </button>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-slate-800 bg-slate-950/50 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                title="Oturumu Kapat"
              >
                <LogOut className="w-3.5 h-3.5" /> Çıkış Yap
              </button>
            </div>
          </div>

          {/* Bot instance Selector for admin */}
          {user.role === 'admin' && activeView === 'bot' && bots.length > 1 && (
            <div className="flex items-center gap-3 bg-slate-950/80 p-2 rounded-xl border border-slate-800/80">
              <span className="text-xs text-slate-400 font-semibold pl-2">Görüntülenen Bot Cihazı:</span>
              <div className="flex flex-wrap gap-2">
                {bots.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBotId(b.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                      selectedBotId === b.id
                        ? 'bg-blue-600/15 border-blue-500 text-blue-400 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {b.id === 'bot1' ? 'Miran Ana Bot (Siz)' : b.id.replace('bot_', 'Müşteri: ')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* View Switcher based on selection */}
        <AnimatePresence mode="wait">
          {activeView === 'clients' && user.role === 'admin' ? (
            <motion.div
              key="clients-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {/* Client Management Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" />
                    Kiralık Müşteri Lisanslama & Yönetim
                  </h2>
                  <p className="text-slate-400 text-xs">Müşterilerinize özel bağımsız bot hesapları açıp şifre atayabilirsiniz</p>
                </div>
                <button
                  onClick={() => setShowAddClientForm(!showAddClientForm)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg hover:shadow-blue-500/10 cursor-pointer transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  Yeni Müşteri Ekle
                </button>
              </div>

              {/* Add Client Form */}
              {showAddClientForm && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl shadow-2xl relative">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-blue-500" />
                    Müşteri Kayıt Detayları
                  </h3>
                  <form onSubmit={addClient} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-semibold uppercase">Kullanıcı Adı</label>
                        <input
                          type="text"
                          required
                          value={newClientUsername}
                          onChange={(e) => setNewClientUsername(e.target.value.replace(/\s+/g, ''))}
                          placeholder="Orn: miranmedya"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-semibold uppercase">Şifre</label>
                        <input
                          type="text"
                          required
                          value={newClientPassword}
                          onChange={(e) => setNewClientPassword(e.target.value)}
                          placeholder="Giriş şifresi belirleyin"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-semibold uppercase">Kiralama Bitiş Tarihi</label>
                        <input
                          type="date"
                          value={newClientExpiresAt}
                          onChange={(e) => setNewClientExpiresAt(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                    </div>

                    {clientError && (
                      <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" /> {clientError}
                      </p>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAddClientForm(false)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        İptal
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        Müşteriyi Oluştur
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Edit Client Form */}
              {editingClient && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl shadow-2xl relative">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-blue-500" />
                    Müşteri Bilgilerini Güncelle: <span className="text-blue-400 font-bold">{editingClient.username}</span>
                  </h3>
                  <form onSubmit={editClientSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-semibold uppercase">Yeni Şifre</label>
                        <input
                          type="text"
                          required
                          value={editClientPassword}
                          onChange={(e) => setEditClientPassword(e.target.value)}
                          placeholder="Şifreyi güncelle..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-semibold uppercase">Kiralama Bitiş Tarihi</label>
                        <input
                          type="date"
                          value={editClientExpiresAt}
                          onChange={(e) => setEditClientExpiresAt(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingClient(null)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        İptal
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        Kaydet ve Güncelle
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Clients Table */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-slate-800 bg-slate-900/30">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Aktif Müşteri Lisansları ({usersList.length})</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                     <thead>
                      <tr className="border-b border-slate-800 text-slate-500">
                        <th className="p-4 font-semibold">Müşteri Kullanıcı Adı</th>
                        <th className="p-4 font-semibold">Giriş Şifresi</th>
                        <th className="p-4 font-semibold">Atanan Bot ID</th>
                        <th className="p-4 font-semibold">Kiralama Süresi / Durumu</th>
                        <th className="p-4 font-semibold">WhatsApp Bağlantısı</th>
                        <th className="p-4 font-semibold">Grup Sayısı</th>
                        <th className="p-4 font-semibold text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {usersList.map((client) => {
                        const clientBot = bots.find(b => b.id === client.botId);
                        const isConnected = clientBot?.status === 'connected';
                        
                        // Expiration checks
                        const todayStr = new Date().toISOString().split('T')[0];
                        const isExpired = client.expiresAt && client.expiresAt < todayStr;
                        const hasExpiration = !!client.expiresAt;

                        return (
                          <tr key={client.username} className="hover:bg-slate-900/20 transition-all">
                            <td className="p-4 font-semibold text-white">{client.username}</td>
                            <td className="p-4 font-mono text-slate-300">{client.password}</td>
                            <td className="p-4 text-slate-400 font-mono">{client.botId}</td>
                            <td className="p-4">
                              {hasExpiration ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-medium text-[10px] border ${
                                  isExpired 
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}>
                                  <Clock className="w-3 h-3" />
                                  {client.expiresAt} {isExpired ? '(Süre Doldu!)' : '(Aktif)'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-medium text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Sınırsız / Ömür Boyu
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-medium ${
                                isConnected ? 'bg-green-500/10 text-green-400 border border-green-500/10' : 'bg-red-500/10 text-red-400 border border-red-500/10'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                {isConnected ? 'Bağlı' : (clientBot?.status || 'Bağlantı Kesik')}
                              </span>
                            </td>
                            <td className="p-4 font-semibold text-slate-300">
                              {clientBot?.groupCount || 0} grup
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    setEditingClient(client);
                                    setEditClientPassword(client.password);
                                    setEditClientExpiresAt(client.expiresAt || '');
                                  }}
                                  className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all cursor-pointer"
                                  title="Düzenle"
                                >
                                  <Settings className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteClient(client.username)}
                                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer"
                                  title="Müşteriyi Sil"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {usersList.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500">
                            Henüz kiralık müşteri bulunmuyor. Yeni bir tane ekleyerek başlayabilirsiniz!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : (
            // Bot Management Dashboard View
            <motion.div
              key="bot-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {/* Selected Bot details badge for clients */}
              {user.role === 'user' && (
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-300 text-sm">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Kişisel Bot Hesabınız: <span className="text-white font-bold">{user.username.toUpperCase()} BOT</span>
                  </div>
                </div>
              )}

              {/* Header Active Bot Controls */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Cihaz Kontrolleri:</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => updateConfig(selectedBot.id, { isActive: !selectedBot.config.isActive })}
                    disabled={loading}
                    className={`flex items-center gap-2 px-4 py-2 text-xs rounded-xl font-bold cursor-pointer transition-all border ${
                      selectedBot.config.isActive 
                        ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20' 
                        : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                    {selectedBot.config.isActive ? 'Bot Sistemi Açık' : 'Bot Sistemi Kapalı'}
                  </button>

                  <button
                    onClick={() => logoutBot(selectedBot.id)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl font-semibold bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> WhatsApp Çıkış
                  </button>
                  <button
                    onClick={() => resetBot(selectedBot.id)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl font-semibold bg-red-950/20 text-red-400 border border-red-900/30 hover:bg-red-900/40 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Sıfırla
                  </button>
                  <button
                    onClick={() => reconnectBot(selectedBot.id)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl font-semibold bg-blue-950 text-blue-400 border border-blue-900/30 hover:bg-blue-900/40 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Yeniden Bağlan
                  </button>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Hesap İsmi</p>
                    <p className="text-sm font-bold text-white">{selectedBot.id === 'bot1' ? 'Miran Ana Bot' : `${selectedBot.id.replace('bot_', '')} Bot`}</p>
                  </div>
                </div>
                
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Atılan Duyurular</p>
                    <p className="text-sm font-bold text-white">{selectedBot.config.sentCount || 0} adet</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Aktif Grup Sayısı</p>
                    <p className="text-sm font-bold text-white">{selectedBot.groupCount || 0} grup</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-500">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Kurulu Duyurular</p>
                    <p className="text-sm font-bold text-white">{selectedBot.config.broadcasts.length} duyuru</p>
                  </div>
                </div>
              </div>

              {/* Current Activity Banner */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <span className="relative flex h-3 w-3">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${selectedBot.config.isActive && selectedBot.status === 'connected' ? 'bg-green-400' : 'bg-red-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${selectedBot.config.isActive && selectedBot.status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </span>
                <p className="text-xs text-slate-300">
                  <span className="font-semibold text-white mr-1.5 font-mono">Anlık Durum:</span>
                  {selectedBot.activity || 'Boşta bekleniyor.'}
                </p>
              </div>

              {/* Grid Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: QR code and settings */}
                <div className="lg:col-span-1 space-y-6">
                  <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-md">
                    <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-white">
                      <RefreshCw className="w-4 h-4 text-blue-500" />
                      Cihaz Bağlama QR Kodu
                    </h2>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-xs">Bağlantı</span>
                        <div className="flex items-center gap-2">
                          {selectedBot.status === 'connected' && (
                            <span className="flex items-center gap-1.5 text-green-400 text-xs font-semibold">
                              <CheckCircle2 className="w-4 h-4" /> Aktif & Bağlı
                            </span>
                          )}
                          {selectedBot.status !== 'connected' && selectedBot.hasSession && (
                            <span className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold">
                              <AlertCircle className="w-4 h-4 animate-pulse" /> Oturum Var (Giriş Yapılıyor)
                            </span>
                          )}
                          {selectedBot.status === 'disconnected' && !selectedBot.hasSession && (
                            <span className="flex items-center gap-1.5 text-red-500 text-xs font-semibold">
                              <XCircle className="w-4 h-4" /> Bağlantı Yok
                            </span>
                          )}
                          {selectedBot.status === 'connecting' && !selectedBot.hasSession && (
                            <span className="flex items-center gap-1.5 text-blue-500 text-xs font-semibold">
                              <AlertCircle className="w-4 h-4 animate-pulse" /> Bağlanıyor...
                            </span>
                          )}
                          {selectedBot.status === 'waiting_for_qr' && !selectedBot.hasSession && (
                            <span className="flex items-center gap-1.5 text-yellow-500 text-xs font-semibold">
                              <AlertCircle className="w-4 h-4" /> QR Çizdirildi
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Display QR for scanning */}
                      {!selectedBot.hasSession && selectedBot.status === 'waiting_for_qr' && selectedBot.qr ? (
                        <div className="bg-white p-4 rounded-xl flex flex-col items-center gap-3 shadow-inner">
                          <img src={selectedBot.qr} alt="WhatsApp QR Code" className="w-full max-w-[180px]" referrerPolicy="no-referrer" />
                          <p className="text-slate-900 text-[10px] font-bold text-center">
                            Telefonunuzdan WhatsApp {'>'} Bağlı Cihazlar {'>'} Cihaz Bağla bölümüne girip bu QR kodu taratın.
                          </p>
                        </div>
                      ) : selectedBot.hasSession ? (
                        <div className="bg-slate-950 border border-emerald-500/10 p-4 rounded-xl text-center space-y-3">
                          <div className="mx-auto flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400">
                            <CheckCircle2 className="w-5 h-5 animate-pulse" />
                          </div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">WhatsApp Bağlantısı Hazır</h3>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Oturum bilgileriniz başarıyla kaydedildi. Bot arka planda 7/24 çalışıyor.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center space-y-3">
                          <RefreshCw className="w-6 h-6 text-slate-600 animate-spin mx-auto" />
                          <p className="text-[11px] text-slate-500">QR kod hazırlanıyor veya bekleniyor...</p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Group Setting */}
                  <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-md">
                    <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-white">
                      <Settings className="w-4 h-4 text-purple-500" />
                      Yönetim Grubu Belirleme
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[11px] text-slate-400 font-semibold mb-1.5 uppercase">Admin Grup ID</label>
                        <input
                          type="text"
                          value={selectedBot.config.adminGroupId || ''}
                          onChange={(e) => updateConfig(selectedBot.id, { adminGroupId: e.target.value })}
                          placeholder="12036xxxxxx@g.us"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                        />
                        <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                          Yönetici olmak istediğiniz gruptan <code className="text-blue-400 font-bold font-mono">!adminburasi</code> komutunu göndererek bu bota bağlayabilirsiniz.
                        </p>
                      </div>
                    </div>
                  </section>
                </div>

                {/* Right Column: Broadcast builder and lists */}
                <div className="lg:col-span-2 space-y-6">
                  <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-md">
                    <h2 className="text-sm font-bold uppercase tracking-wider mb-6 flex items-center gap-2 text-white">
                      <MessageSquare className="w-4 h-4 text-pink-500" />
                      Otomatik Duyuru Gönderimi
                    </h2>

                    {/* Add New Broadcast */}
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 mb-6 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 space-y-1.5">
                          <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">Duyuru Metni</label>
                          <textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Otomatik olarak gruplara gönderilecek reklam veya duyuru metnini yazın..."
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs h-20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-none text-white leading-relaxed"
                          />
                        </div>
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">Resim URL (Opsiyonel)</label>
                            <input
                              type="text"
                              value={newImageUrl}
                              onChange={(e) => setNewImageUrl(e.target.value)}
                              placeholder="Orn: http://site.com/resim.jpg"
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">Süre Aralığı (Dakika)</label>
                            <input
                              type="number"
                              value={newInterval}
                              onChange={(e) => setNewInterval(parseInt(e.target.value) || 5)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white font-mono"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => manageBroadcast(selectedBot.id, 'add', { message: newMessage, interval: newInterval, imageUrl: newImageUrl })}
                          disabled={loading || !newMessage}
                          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-blue-500/10"
                        >
                          <Plus className="w-4 h-4" /> Duyuruyu Listeye Ekle
                        </button>
                      </div>
                    </div>

                    {/* Broadcast List */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        Aktif Kampanyalar & Döngüler ({selectedBot.config.broadcasts.length})
                      </h3>
                      <div className="grid grid-cols-1 gap-4">
                        <AnimatePresence mode="popLayout">
                          {selectedBot.config.broadcasts.map((b) => (
                            <motion.div
                              key={b.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex items-start justify-between gap-4"
                            >
                              <div className="space-y-2 flex-1">
                                {b.imageUrl && b.imageUrl.startsWith('http') && (
                                  <img 
                                    src={b.imageUrl} 
                                    alt="Duyuru Görseli" 
                                    className="w-full max-h-32 object-cover rounded-lg mb-2 border border-slate-800"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{b.message}</p>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-500 pt-1">
                                  <span className="flex items-center gap-1 font-semibold text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                                    <Clock className="w-3 h-3" /> {b.interval} dakikada bir
                                  </span>
                                  {b.lastSent && (
                                    <span className="flex items-center gap-1 font-semibold text-green-400 bg-green-500/5 px-2 py-0.5 rounded-md border border-green-500/10">
                                      <CheckCircle2 className="w-3 h-3" /> 
                                      Son gönderim: {new Date(b.lastSent).toLocaleTimeString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => manageBroadcast(selectedBot.id, 'delete', b)}
                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer shrink-0"
                                title="Duyuruyu Kaldır"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        {selectedBot.config.broadcasts.length === 0 && (
                          <div className="text-center py-10 bg-slate-950/30 border border-dashed border-slate-800/80 rounded-xl">
                            <MessageSquare className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                            <p className="text-slate-500 text-xs">Aktif çalışan bir duyuru döngüsü kurulmamış.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
