import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Calendar, Users, ArrowUpRight,
  ClipboardList, CheckCircle2, AlertCircle, Clock,
  Sparkles, Shield, Layers, LayoutTemplate,
  FileText, PieChart, CheckSquare,
  LayoutDashboard, Server, ServerOff, Loader2, RefreshCw,
} from 'lucide-react';
import { dashboardApi, module3Api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { UserRole } from '../types';

const MODULES = [
  {
    id:        'pkpt',
    icon:      Calendar,
    title:     'Perencanaan Pengawasan Tahunan',
    subtitle:  'Menyusun rencana audit tahunan secara sistematis berdasarkan arah strategis perusahaan dan risiko yang diidentifikasi.',
    path:      '/perencanaan/pkpt',
    roles:     ['kepala_spi','pengendali_teknis','anggota_tim','admin_spi'] as UserRole[],
    isActive:  true,
  },
  {
    id:        'individual',
    icon:      Layers,
    title:     'Perencanaan Pengawasan Individual',
    subtitle:  'Menyusun program kerja audit individual lengkap dengan tujuan, risiko, prosedur, dan rincian kegiatan per penugasan.',
    path:      '/perencanaan/individual',
    roles:     ['kepala_spi','pengendali_teknis','anggota_tim','admin_spi'] as UserRole[],
    isActive:  true,
  },
  {
    id:        'pelaksanaan',
    icon:      Shield,
    title:     'Pelaksanaan Audit & Kertas Kerja',
    subtitle:  'Mengelola proses audit secara langsung di lapangan maupun off-site tanpa menggunakan dokumen terpisah (Excel/Word).',
    path:      '/pelaksanaan',
    roles:     ['kepala_spi','pengendali_teknis','anggota_tim','admin_spi'] as UserRole[],
    isActive:  true,
  },
  {
    id:        'pelaporan',
    icon:      FileText,
    title:     'Pelaporan & Komunikasi Hasil',
    subtitle:  'Menyusun laporan hasil audit hingga menyampaikannya secara digital kepada Auditee untuk mendapatkan tanggapan resmi.',
    path:      '#',
    roles:     null,
    isActive:  false,
  },
  {
    id:        'sintesis',
    icon:      PieChart,
    title:     'Sintesis Hasil Pengawasan',
    subtitle:  'Menyatukan seluruh hasil audit dan menghasilkan gambaran risiko strategis serta pola temuan berulang lintas unit atau periode.',
    path:      '#',
    roles:     null,
    isActive:  false,
  },
  {
    id:        'pemantauan',
    icon:      CheckSquare,
    title:     'Pemantauan Tindak Lanjut Temuan',
    subtitle:  'Memastikan setiap temuan audit ditindaklanjuti hingga selesai dengan bukti perbaikan yang tervalidasi.',
    path:      '/pemantauan',
    roles:     ['kepala_spi','pengendali_teknis','anggota_tim','admin_spi','it_admin'] as UserRole[],
    isActive:  true,
  },
  {
    id:        'ca-cm',
    icon:      LayoutDashboard,
    title:     'Dashboard CA-CM',
    subtitle:  'Memantau siklus operasional swakelola dengan dashboard CA-CM untuk memastikan efektivitas pengendalian dan mitigasi risiko.',
    path:      '/ca-cm',
    roles:     ['kepala_spi','pengendali_teknis','anggota_tim','admin_spi','it_admin'] as UserRole[],
    isActive:  true,
  },
];

function NasStatusRow() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['nas-health'],
    queryFn: () => module3Api.nasHealth().then((r) => r.data.data),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
  const connected = data?.connected ?? false;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Memeriksa NAS…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group" title={data?.message ?? `NAS path: ${data?.basePath ?? '-'}`}>
      <span className="relative flex h-2.5 w-2.5">
        {connected ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
          </>
        ) : (
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
        )}
      </span>
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${connected ? 'text-slate-600' : 'text-red-600'}`}>
        {connected ? <><Server className="inline w-3 h-3 mr-1 -mt-0.5" />NAS Terhubung</> : <><ServerOff className="inline w-3 h-3 mr-1 -mt-0.5" />NAS Terputus</>}
      </span>
      <button
        onClick={() => refetch()}
        className="ml-auto p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        title="Cek ulang"
      >
        <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat Pagi';
  if (h < 15) return 'Selamat Siang';
  if (h < 18) return 'Selamat Sore';
  return 'Selamat Malam';
}

const APP_DESCRIPTION =
  'Sistem Akuntabilitas for TransJakarta Internal Audit (SATRIA) dikembangkan untuk mendukung kegiatan pengawasan dan audit internal oleh Satuan Pengawas Internal (SPI) PT Transportasi Jakarta. Aplikasi ini berfungsi sebagai sistem terintegrasi yang mengelola seluruh siklus audit, mulai dari perencanaan pengawasan tahunan, pelaksanaan audit, pemantauan tindak lanjut, hingga Dashboard CA-CM demi meningkatkan efektivitas dan efisiensi perusahaan.';

// Module definitions with their IDs for access control
const MODULE_IDS = ['pkpt', 'individual', 'pelaksanaan', 'pelaporan', 'sintesis', 'pemantauan', 'ca-cm'] as const;
export type ModuleId = typeof MODULE_IDS[number];

// Helper to check if user has access to a module
function canAccessModule(userModuleAccess: string[] | undefined, moduleId: string): boolean {
  // If no module_access defined, fall back to role-based access from MODULES config
  if (!userModuleAccess || userModuleAccess.length === 0) return false;
  return userModuleAccess.includes(moduleId);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const role = user?.role as UserRole | undefined;
  const moduleAccess = (user as unknown as { module_access?: string[] })?.module_access;

  // State untuk jam real-time
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn:  () => dashboardApi.getStats().then((r) => r.data.data),
    staleTime: 60_000,
  });

  const statCards = [
    { label: 'Total Program', value: stats?.pkpt_programs ?? 0, icon: ClipboardList, color: 'text-primary-600', bg: 'bg-primary-50/50' },
    { label: 'Belum Selesai', value: stats?.program_belum_selesai ?? 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50/50' },
    { label: 'Selesai', value: stats?.program_selesai ?? 0, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50/50' },
    { label: 'Total Risiko', value: stats?.total_risks ?? 0, icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-50/50' },
    { label: 'Total Auditor', value: stats?.total_auditors ?? 0, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50/50' },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">

      {/* ═══ 1. Hero Banner ═══ */}
      <div className="relative bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-gradient-to-br from-primary-50 to-transparent rounded-full blur-3xl opacity-60 pointer-events-none" />
        
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
          <div className="lg:col-span-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5 text-primary-500" />
              {getGreeting()}, {user?.nama?.split(' ')[0] ?? 'Pengguna'}
            </div>
            
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug mb-3">
              Sistem Akuntabilitas Internal Audit <br className="hidden md:block" />
              <span className="text-primary-600">PT Transportasi Jakarta</span>
            </h1>
            
            <p className="text-sm text-slate-600 leading-relaxed text-justify md:text-left max-w-2xl">
              {APP_DESCRIPTION}
            </p>
          </div>

          <div className="lg:col-span-1 flex justify-start lg:justify-end">
            <div className="w-full max-w-sm bg-slate-50/80 border border-slate-100 rounded-2xl p-5 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Waktu Saat Ini</p>
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
              
              <div className="mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-slate-800 tracking-tighter">
                    {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-sm font-bold text-slate-500">WIB</span>
                </div>
                <p className="text-xs font-medium text-slate-500 mt-1">
                  {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200/60 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                    Sistem Berjalan Normal
                  </span>
                </div>
                <NasStatusRow />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 2. Statistik Eksekutif ═══ */}
      {/* Overview audit hanya untuk SPI leaders, bukan Admin IT */}
      {(role === 'admin_spi' || role === 'kepala_spi') && (
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">
            Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {statCards.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div className={`p-2 rounded-lg ${s.bg}`}>
                      <Icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-slate-800 tracking-tight mb-0.5">{s.value}</p>
                    <p className="text-[11px] font-semibold text-slate-500">{s.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 3. Menu Modul ═══ */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Module
          </h2>
        </div>

        {/* Diperbarui menjadi lg:grid-cols-3 dan md:grid-cols-2 agar tampilannya seimbang untuk 6 modul */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map((mod) => {
            const Icon = mod.icon;

            // Module access control:
            // - it_admin tidak memiliki akses ke modul audit sama sekali
            // - admin_spi & kepala_spi lihat semua modul
            // - User lain: cek module_access
            if (role === 'it_admin') return null;
            const isSpiLeader = role === 'admin_spi' || role === 'kepala_spi';
            const canSee = isSpiLeader
              ? true
              : mod.isActive && canAccessModule(moduleAccess, mod.id);

            if (!canSee) return null;

            return (
              <div
                key={mod.id}
                onClick={() => { if (mod.isActive && mod.path !== '#') navigate(mod.path); }}
                className={`group relative flex flex-col bg-white rounded-2xl p-6 border transition-all duration-300 ${
                  mod.isActive
                    ? 'border-slate-200 hover:border-primary-400 hover:shadow-md cursor-pointer hover:-translate-y-0.5'
                    : 'border-dashed border-slate-200 opacity-50 cursor-default select-none'
                }`}
              >
                {/* Icon & status badge */}
                <div className="flex justify-between items-start mb-5">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 ${
                    mod.isActive ? 'bg-primary-50 text-primary-600 group-hover:scale-110' : 'bg-slate-50 text-slate-300'
                  }`}>
                    <Icon className="w-6 h-6" strokeWidth={1.5} />
                  </div>

                  {mod.isActive ? (
                    <div className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-primary-50 transition-colors">
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary-600 transition-colors" />
                    </div>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Segera Hadir
                    </span>
                  )}
                </div>

                {/* Content */}
                <h3 className={`text-base font-bold mb-2 ${mod.isActive ? 'text-slate-900 group-hover:text-primary-700' : 'text-slate-400'}`}>
                  {mod.title}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {mod.subtitle}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ 4. Footer Info Kecil ═══ */}
      <div className="mt-8 pt-6 border-t border-slate-200/60 flex items-center justify-center gap-2 text-slate-400">
        <LayoutTemplate className="w-4 h-4" />
        <span className="text-[11px] font-medium tracking-wide">SATRIA Internal Audit System © {new Date().getFullYear()}</span>
      </div>

    </div>
  );
}