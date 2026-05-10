import { useEffect, useState } from 'react';
import { useNavigate, NavLink, useLocation, matchPath } from 'react-router-dom';
import {
  Bell, LogOut, KeyRound, Users, Menu, X, Shield, Home, FileText, UserCircle, Settings,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { useNotificationStore } from '../../store/notification.store';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi, authApi } from '../../services/api';
import NotificationPanel from '../notifications/NotificationPanel';
import { ROLE_LABELS } from '../../types';
import toast from 'react-hot-toast';

const ADMIN_ROLES = ['admin_spi', 'it_admin'];
const SETTINGS_ROLES = ['kepala_spi', 'admin_spi'];

const MOBILE_NAV = [
  { to: '/',                         icon: Home,     label: 'Home',                               roles: null },
  { to: '/perencanaan/pkpt',         icon: FileText, label: 'Perencanaan Pengawasan Tahunan',     roles: ['kepala_spi','pengendali_teknis','anggota_tim','admin_spi'] },
  { to: '/perencanaan/individual',   icon: FileText, label: 'Perencanaan Pengawasan Individual',  roles: ['kepala_spi','pengendali_teknis','anggota_tim','admin_spi'] },
  { to: '/pelaksanaan',              icon: Shield,   label: 'Pelaksanaan Audit & Kertas Kerja',   roles: ['kepala_spi','pengendali_teknis','anggota_tim','admin_spi'] },
  { to: '/admin/users',              icon: Users,    label: 'Manajemen User',                     roles: ['admin_spi','it_admin'] },
];

const PAGE_TITLES: { pattern: string; title: string; subtitle?: string }[] = [
  { pattern: '/perencanaan/pkpt',       title: 'Perencanaan Pengawasan Tahunan',    subtitle: 'Modul 1 — PKPT & Non PKPT' },
  { pattern: '/perencanaan/individual', title: 'Perencanaan Pengawasan Individual', subtitle: 'Modul 2 — Program Kerja Detail per Penugasan' },
  { pattern: '/pelaksanaan',            title: 'Pelaksanaan Audit & Kertas Kerja',  subtitle: 'Modul 3 — Project Management, Auditor\'s Copy & KKA' },
  { pattern: '/pelaporan',              title: 'Pelaporan & Komunikasi Hasil',      subtitle: 'Modul 4 — Dalam Pengembangan' },
  { pattern: '/sintesis',               title: 'Sintesis Hasil Pengawasan',         subtitle: 'Modul 5 — Dalam Pengembangan' },
  { pattern: '/pemantauan',             title: 'Pemantauan Tindak Lanjut Temuan',  subtitle: 'Modul 6 — Monitoring tindak lanjut hasil audit' },
  { pattern: '/ca-cm',                  title: 'Dashboard CA-CM',                  subtitle: 'Modul 7 — Continuous Auditing & Continuous Monitoring' },
  { pattern: '/admin/users',            title: 'Manajemen User',                   subtitle: 'Kelola akun & hak akses pengguna' },
  { pattern: '/admin/activity-log',     title: 'Log Aktivitas Sistem',             subtitle: 'Riwayat aktivitas seluruh pengguna' },
  { pattern: '/profile',                title: 'Profil Saya',                      subtitle: 'Data akun & keamanan' },
  { pattern: '/pengaturan',             title: 'Pengaturan Sistem',                subtitle: 'Master data konfigurasi Modul Perencanaan' },
  { pattern: '/perencanaan/*',          title: 'Perencanaan',                      subtitle: 'Modul perencanaan pengawasan' },
  { pattern: '/admin/*',                title: 'Administrasi',                     subtitle: 'Pengaturan sistem' },
  { pattern: '/',                       title: 'Dashboard',                        subtitle: 'Sistem Akuntabilitas Internal Audit' },
];

function getPageTitle(pathname: string) {
  const match = PAGE_TITLES.find(({ pattern }) =>
    matchPath({ path: pattern, end: pattern === '/' }, pathname),
  );
  return match ?? PAGE_TITLES[PAGE_TITLES.length - 1];
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { unreadCount, isPanelOpen, togglePanel, setNotifications } = useNotificationStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const page = getPageTitle(location.pathname);

  useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        const res = await notificationsApi.getAll();
        setNotifications(res.data.data ?? [], res.data.meta?.unread_count ?? 0);
        return res.data;
      } catch (err) {
        // Jangan crash halaman jika notifikasi gagal — cukup log
        console.warn('[Header] Gagal memuat notifikasi:', err);
        return null;
      }
    },
    refetchInterval: 30_000,
    enabled: !!user,
    retry: 2,
    retryDelay: 5_000,
  });

  useEffect(() => {
    document.title = `${page.title} · SATRIA`;
  }, [page.title]);

  async function handleLogout() {
    try {
      // Beritahu server untuk menghapus httpOnly cookie sesi
      await authApi.logout();
    } catch {
      // Lanjutkan logout lokal meski server gagal (cookie akan expire sendiri)
    }
    logout();
    toast.success('Berhasil keluar');
    navigate('/login');
    setProfileOpen(false);
    setMobileOpen(false);
  }

  const role = user?.role ?? '';
  // Mendefinisikan status isAdmin (meliputi admin_spi & it_admin)
  const isAdmin = ADMIN_ROLES.includes(role);
  const canSettings = SETTINGS_ROLES.includes(role);

  return (
    <>
      {/* Header dengan efek backdrop blur agar lebih modern */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="h-full max-w-screen-xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">

          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="sm:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Buka menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <button
              onClick={() => { navigate('/'); setMobileOpen(false); }}
              className="flex items-center gap-2.5 flex-shrink-0"
              aria-label="Kembali ke Home"
            >
              <div className="w-9 h-9 bg-primary-700 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-slate-800 text-xl tracking-tight hidden sm:block">
                SATRIA
              </span>
            </button>

            <div className="h-8 w-px bg-slate-200 hidden sm:block flex-shrink-0" />

            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-bold text-slate-800 leading-tight truncate">
                {page.title}
              </h1>
              {page.subtitle && (
                <p className="text-[11px] text-slate-500 leading-tight truncate hidden sm:block">
                  {page.subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="relative">
              <button
                onClick={() => { togglePanel(); setProfileOpen(false); }}
                className={`relative p-2 rounded-xl transition-colors ${
                  isPanelOpen ? 'bg-primary-50 text-primary-600' : 'text-slate-500 hover:bg-slate-100'
                }`}
                aria-label={`Notifikasi${unreadCount > 0 ? ` (${unreadCount} belum dibaca)` : ''}`}
                aria-expanded={isPanelOpen}
                aria-haspopup="true"
              >
                <Bell className="w-5 h-5" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span
                    className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white"
                    aria-hidden="true"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <NotificationPanel />
            </div>

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            <div className="relative">
              <button
                onClick={() => { setProfileOpen((o) => !o); }}
                className="flex items-center gap-3 p-1 pr-2 rounded-full border border-transparent hover:bg-slate-100 hover:border-slate-200 transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center font-bold text-primary-700 text-sm flex-shrink-0">
                  {user?.nama?.charAt(0).toUpperCase() ?? 'U'}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-semibold text-slate-800 leading-none max-w-[120px] truncate">
                    {user?.nama ?? 'User'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-none">
                    {user ? ROLE_LABELS[user.role] : ''}
                  </p>
                </div>
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <p className="text-sm font-bold text-slate-800 truncate">{user?.nama}</p>
                      <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    </div>
                    <div className="py-2">
                      {/* Profil Saya — semua role non-admin (identity + ubah password) */}
                      {!isAdmin && (
                        <button onClick={() => { setProfileOpen(false); navigate('/profile'); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <UserCircle className="w-4 h-4 text-slate-400" /> Profil Saya
                        </button>
                      )}
                      
                      {/* Menu eksklusif untuk admin_spi & it_admin */}
                      {isAdmin && (
                        <>
                          <button onClick={() => { setProfileOpen(false); navigate('/admin/users'); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                            <Users className="w-4 h-4 text-slate-400" /> Manajemen User
                          </button>
                          <button onClick={() => { setProfileOpen(false); navigate('/admin/activity-log'); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                            <Shield className="w-4 h-4 text-slate-400" /> Log Aktivitas
                          </button>
                        </>
                      )}

                      {/* Pengaturan Sistem — Kepala SPI + Admin SPI */}
                      {canSettings && (
                        <button onClick={() => { setProfileOpen(false); navigate('/pengaturan'); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <Settings className="w-4 h-4 text-slate-400" /> Pengaturan Sistem
                        </button>
                      )}
                    </div>
                    <div className="border-t border-slate-100 py-1">
                      <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                        <LogOut className="w-4 h-4" /> Keluar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm sm:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed top-16 left-0 bottom-0 w-72 bg-white z-30 shadow-2xl sm:hidden overflow-y-auto border-r border-slate-100">
            <nav className="p-4 space-y-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 mb-3">Menu Utama</p>
              {MOBILE_NAV.filter((link) => link.roles === null || (user && link.roles.includes(user.role))).map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink key={link.to} to={link.to} end={link.to === '/'} onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Icon className="w-5 h-5" /> {link.label}
                  </NavLink>
                );
              })}
              <div className="pt-4 border-t border-slate-100 mt-4">
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50">
                  <LogOut className="w-5 h-5" /> Keluar
                </button>
              </div>
            </nav>
          </div>
        </>
      )}
    </>
  );
}