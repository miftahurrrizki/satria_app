import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, TrendingUp, AlertTriangle, Loader2, RefreshCw, Info,
  CalendarDays, X, UserRound, Gauge, ChevronDown, ChevronUp,
} from 'lucide-react';
import { workloadApi, kalenderKerjaApi } from '../../../services/api';
import { WorkloadAuditor } from '../../../types';
import { ROLE_LABELS } from '../../../types';
import { parseLocalDate } from '../../../utils/dateUtils';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

function getCellColor(ratio: number) {
  if (ratio <= 0)   return 'bg-slate-100 text-slate-400';
  if (ratio < 0.5)  return 'bg-green-100 text-green-800';
  if (ratio < 0.8)  return 'bg-emerald-200 text-emerald-900';
  if (ratio < 1.0)  return 'bg-amber-300 text-amber-900';
  return 'bg-red-500 text-white';  // >= 100% bobot = overload
}

function getRoleBadge(role: string) {
  const map: Record<string, string> = {
    kepala_spi:        'bg-purple-100 text-purple-700',
    pengendali_teknis: 'bg-blue-100 text-blue-700',
    anggota_tim:       'bg-teal-100 text-teal-700',
  };
  return map[role] ?? 'bg-slate-100 text-slate-600';
}

function getAuditorLabel(role: string, jabatan: string | null) {
  if (role === 'anggota_tim' && jabatan) return jabatan;
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
}

function getRoleTimBadge(role: string) {
  const map: Record<string, string> = {
    'Ketua Tim':         'bg-indigo-100 text-indigo-700',
    'Anggota Tim':       'bg-teal-100 text-teal-700',
    'Kepala SPI':        'bg-purple-100 text-purple-700',
    'Pengendali Teknis': 'bg-blue-100 text-blue-700',
  };
  return map[role] ?? 'bg-slate-100 text-slate-600';
}

function fmtDate(d: string) {
  const parsed = parseLocalDate(d);
  if (!parsed) return '—';
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function workloadStatus(utilisasi: number) {
  if (utilisasi > 100) return { label: 'Overload',     text: 'text-red-700',     bar: 'bg-red-500' };
  if (utilisasi > 80)  return { label: 'Tinggi',       text: 'text-amber-700',   bar: 'bg-amber-500' };
  return                      { label: 'Terkendali',   text: 'text-emerald-700', bar: 'bg-emerald-500' };
}

interface HeatmapRowProps {
  auditor: WorkloadAuditor;
  viewMode: 'utilisasi' | 'bobot';
  paguBobotPerBulan: number;
}

function HeatmapRow({ auditor, viewMode, paguBobotPerBulan }: HeatmapRowProps) {
  const [expanded, setExpanded] = useState(false);

  const max      = Number(auditor.max_load);
  const overwork = max > paguBobotPerBulan;
  const utilisasi = auditor.utilisasi_mandays ?? 0;
  const status   = workloadStatus(utilisasi);
  const remaining = (auditor.kapasitas_mandays ?? 0) - (auditor.total_mandays ?? 0);

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${expanded ? 'border-primary-300 shadow-md' : 'border-slate-200 hover:border-primary-200 hover:shadow-sm'}`}>
      {/* ── Header row ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-4 hover:bg-primary-50/20 transition-colors flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${expanded ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-700'}`}>
            <UserRound className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-slate-800 truncate">{auditor.nama_lengkap}</p>
              <span className={`badge ${getRoleBadge(auditor.role)}`}>
                {getAuditorLabel(auditor.role, auditor.jabatan)}
              </span>
              {overwork && (
                <span className="badge bg-red-100 text-red-700 font-bold">
                  <AlertTriangle className="h-3 w-3" /> OVERWORK
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
              <span>NIK {auditor.nik}</span>
              {auditor.total_mandays != null && auditor.kapasitas_mandays != null && (
                <>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span><b className="text-slate-700">{auditor.total_mandays.toFixed(1)}</b> / {auditor.kapasitas_mandays} HP</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span className={`font-semibold ${utilisasi > 100 ? 'text-red-600' : utilisasi > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {Math.min(utilisasi, 100).toFixed(0)}% Digunakan
                    {utilisasi > 100 && <span className="text-red-500"> (+{(utilisasi - 100).toFixed(0)}%)</span>}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mini heatmap */}
        <div className="hidden lg:flex gap-1 flex-shrink-0">
          {Array.from({ length: 12 }, (_, i) => {
            const bobot = Number(auditor.monthly_load?.[String(i + 1)] ?? 0);
            const ratio = paguBobotPerBulan > 0 ? bobot / paguBobotPerBulan : bobot;
            const display = viewMode === 'utilisasi'
              ? (bobot > 0 ? `${Math.round(ratio * 100)}%` : '')
              : (bobot > 0 ? bobot.toFixed(2) : '');
            return (
              <div
                key={i}
                title={`${MONTH_LABELS[i]}: ${(ratio * 100).toFixed(0)}% utilisasi`}
                className={`w-10 h-7 rounded text-[10px] font-medium flex items-center justify-center ${getCellColor(ratio)}`}
              >
                {display}
              </div>
            );
          })}
        </div>

        <div className="text-slate-400 flex-shrink-0 ml-2">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-5 grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">

          {/* Left: Profil + Kapasitas */}
          <div className="xl:col-span-4 space-y-4">
            {/* Profil card */}
            <div className="card-sm p-4">
              <p className="section-label mb-3">Profil Auditor</p>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">NIK</span>
                  <span className="font-bold text-slate-900">{auditor.nik}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Jabatan</span>
                  <span className="font-bold text-slate-900 text-right">
                    {auditor.jabatan || getAuditorLabel(auditor.role, auditor.jabatan)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Program Aktif</span>
                  <span className="font-bold text-slate-900">{auditor.programs.length} program</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Beban Bulanan Maks</span>
                  <span className={`font-bold ${overwork ? 'text-red-700' : 'text-slate-900'}`}>{max.toFixed(2)} bobot</span>
                </div>
              </div>
            </div>

            {/* Kapasitas gauge */}
            {auditor.total_mandays != null && auditor.kapasitas_mandays != null && (
              <div className="card-sm p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="section-label">Utilisasi Kapasitas</p>
                  <Gauge className="h-4 w-4 text-slate-400" />
                </div>

                <div className="flex items-end justify-between mb-2">
                  <p className="text-3xl font-bold text-slate-900">{Math.min(utilisasi, 100).toFixed(1)}%</p>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`text-sm font-bold ${status.text}`}>{status.label}</span>
                    {utilisasi > 100 && (
                      <span className="text-[10px] font-semibold text-red-500">
                        +{(utilisasi - 100).toFixed(1)}% melebihi kapasitas
                      </span>
                    )}
                  </div>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-4">
                  <div className={`h-full transition-all ${status.bar}`} style={{ width: `${Math.min(utilisasi, 100)}%` }} />
                </div>

                <div className="flex items-start justify-between pt-4 border-t border-slate-100">
                  <div>
                    <p className="section-label mb-0.5">Terpakai</p>
                    <p className="text-base font-bold text-slate-900">{auditor.total_mandays.toFixed(1)} <span className="text-xs font-normal text-slate-500">HP</span></p>
                  </div>
                  <div className="text-right">
                    <p className="section-label mb-0.5">Sisa</p>
                    <p className={`text-base font-bold ${remaining < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                      {remaining.toFixed(1)} <span className="text-xs font-normal text-slate-500">HP</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Program list */}
          <div className="xl:col-span-8">
            <p className="section-label mb-3">Daftar Program ({auditor.programs.length})</p>
            <div className="card-sm overflow-hidden">
              {auditor.programs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Belum ada program terkait.</div>
              ) : (
                <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100">
                  {auditor.programs.map((p) => {
                    const mandays = Number(p.mandays ?? 0);
                    const totalMandaysForAuditor = auditor.total_mandays ?? 0;
                    const percentOfTotal = totalMandaysForAuditor > 0 ? (mandays / totalMandaysForAuditor) * 100 : 0;

                    return (
                      <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 hover:bg-slate-50 transition-colors gap-3">
                        <div className="flex gap-3 items-start flex-1 min-w-0">
                          <CalendarDays className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800 text-sm truncate" title={p.judul_program}>
                              {p.judul_program}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                              <span>{fmtDate(p.tanggal_mulai)} — {fmtDate(p.tanggal_selesai)}</span>
                              <span className={`badge ${getRoleTimBadge(p.role_tim)}`}>{p.role_tim}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex sm:flex-col items-center sm:items-end justify-between flex-shrink-0 pl-7 sm:pl-0">
                          <span className="text-sm font-bold text-slate-900">{mandays.toFixed(1)} HP</span>
                          <span className="text-[10px] font-medium text-slate-400">{percentOfTotal.toFixed(0)}% dr total</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, tone }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; tone: 'primary' | 'green' | 'red' | 'amber';
}) {
  const toneClass = {
    primary: { icon: 'bg-primary-50 text-primary-700', label: 'text-primary-700' },
    green:   { icon: 'bg-green-50 text-green-700',     label: 'text-green-700' },
    red:     { icon: 'bg-red-50 text-red-700',         label: 'text-red-700' },
    amber:   { icon: 'bg-amber-50 text-amber-700',     label: 'text-amber-700' },
  }[tone];

  return (
    <div className="stat-card">
      <div className={`p-2 rounded-lg flex-shrink-0 ${toneClass.icon}`}><Icon className="h-5 w-5" /></div>
      <div>
        <p className="text-2xl font-bold leading-none text-slate-900">{value}</p>
        <p className={`text-xs font-bold mt-1 ${toneClass.label}`}>{label}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main WorkloadTab ──────────────────────────────────────────
export default function WorkloadTab({ tahun }: { tahun: number }) {
  const [filterMonth, setFilterMonth]       = useState<string>('');
  const [filterRoleTeam, setFilterRoleTeam] = useState<string>('all');
  const [sortBy, setSortBy]                 = useState<'max' | 'avg' | 'nama'>('max');
  const [viewMode, setViewMode]             = useState<'utilisasi' | 'bobot'>('utilisasi');

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['workload', tahun],
    queryFn: () => workloadApi.get(tahun).then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: kalenderRes } = useQuery({
    queryKey: ['kalender-kerja-workload', tahun],
    queryFn: () => kalenderKerjaApi.get(tahun),
    staleTime: 5 * 60_000,
  });
  const kalender = kalenderRes?.data?.data;

  const paguBobotPerBulan = data?.summary?.pagu_bobot_per_bulan ?? 2.0;
  const bobotPeran        = data?.summary?.bobot_peran ?? {};
  const fmtBobot = (peran: string, fallback: number) => Number(bobotPeran[peran] ?? fallback).toString();

  const summary  = data?.summary;
  const auditors = useMemo(() => {
    let list = data?.data ?? [];
    if (filterMonth) {
      list = list.filter((a) => Number(a.monthly_load?.[filterMonth] ?? 0) > 0);
    }
    if (filterRoleTeam !== 'all') {
      list = list.filter((a) => a.programs.some((p) => p.role_tim === filterRoleTeam));
    }
    if (sortBy === 'max')  return [...list].sort((a, b) => Number(b.max_load) - Number(a.max_load));
    if (sortBy === 'avg')  return [...list].sort((a, b) => Number(b.avg_load) - Number(a.avg_load));
    return [...list].sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap));
  }, [data, filterMonth, filterRoleTeam, sortBy]);

  const hasFilters = filterMonth !== '' || filterRoleTeam !== 'all';

  return (
    <div className="space-y-5">

      {/* ── Filter + Stat Cards — satu bounding box ── */}
      <div className="card p-4 space-y-4">

        {/* Info singkat */}
        <div className="flex gap-3 text-sm text-slate-600 bg-primary-50/60 rounded-lg px-3 py-2.5">
          <Info className="h-4 w-4 text-primary-600 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed text-xs">
            Beban kerja = <b>bobot peran × porsi hari penugasan</b>.
            Bobot: Ketua Tim <b>{fmtBobot('Ketua Tim', 1.0)}</b> · Anggota Tim <b>{fmtBobot('Anggota Tim', 0.5)}</b> ·
            Pengendali Teknis <b>{fmtBobot('Pengendali Teknis', 0.25)}</b> · Kepala SPI <b>{fmtBobot('Penanggung Jawab', 0.25)}</b>.
            Batas normal <b>{paguBobotPerBulan.toFixed(1)}</b>/bulan.
            {kalender?.header && <span> Pagu {tahun}: <b>{kalender.header.hari_pemeriksaan_tersedia}</b> man-days.</span>}
            <span className="text-slate-400"> · Klik baris auditor untuk detail.</span>
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterRoleTeam} onChange={(e) => setFilterRoleTeam(e.target.value)} className="select-input w-auto h-10">
            <option value="all">Semua Role</option>
            <option value="Ketua Tim">Ketua Tim</option>
            <option value="Anggota Tim">Anggota Tim</option>
            <option value="Kepala SPI">Kepala SPI</option>
            <option value="Pengendali Teknis">Pengendali Teknis</option>
          </select>

          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="select-input w-auto h-10">
            <option value="">Semua Bulan</option>
            {MONTH_LABELS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="select-input w-auto h-10">
            <option value="max">Urut: Max Load</option>
            <option value="avg">Urut: Avg Load</option>
            <option value="nama">Urut: Nama</option>
          </select>

          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm h-10">
            <button
              onClick={() => setViewMode('utilisasi')}
              className={`px-3 py-1 font-semibold transition-colors ${viewMode === 'utilisasi' ? 'bg-primary-600 text-white' : 'text-slate-600 bg-white hover:bg-slate-50'}`}
            >%</button>
            <button
              onClick={() => setViewMode('bobot')}
              className={`px-3 py-1 font-semibold transition-colors border-l border-slate-200 ${viewMode === 'bobot' ? 'bg-primary-600 text-white' : 'text-slate-600 bg-white hover:bg-slate-50'}`}
            >Bobot</button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {hasFilters && (
              <button onClick={() => { setFilterMonth(''); setFilterRoleTeam('all'); }} className="btn-secondary h-10">
                <X className="w-3.5 h-3.5" /> Reset
              </button>
            )}
            <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary h-10">
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Divider */}
        {summary && <div className="border-t border-slate-100" />}

        {/* Summary stat cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Users} label="Total Auditor" value={summary.total_auditor} sub={`Tahun ${summary.tahun}`} tone="primary" />
            <StatCard
              icon={TrendingUp}
              label="Avg Utilisasi / Bulan"
              value={`${((summary.avg_load / paguBobotPerBulan) * 100).toFixed(0)}%`}
              sub={`Avg bobot ${summary.avg_load.toFixed(2)} dari Maks ${paguBobotPerBulan.toFixed(1)}`}
              tone="green"
            />
            <StatCard
              icon={AlertTriangle}
              label={`Overwork (>${paguBobotPerBulan.toFixed(1)})`}
              value={summary.overwork}
              sub="Melampaui maks bobot"
              tone="red"
            />
            <StatCard icon={Users} label="Idle" value={summary.idle} sub="Tanpa penugasan aktif" tone="amber" />
          </div>
        )}
      </div>

      {/* Month labels header */}
      {!isLoading && auditors.length > 0 && (
        <div className="hidden lg:flex items-center gap-4 px-4 pt-1">
          <div className="flex-1" />
          <div className="flex gap-1 flex-shrink-0">
            {MONTH_LABELS.map((m) => (
              <div key={m} className="w-10 text-[10px] font-bold text-slate-400 text-center uppercase tracking-wider">{m}</div>
            ))}
          </div>
          <div className="w-6" />
        </div>
      )}

      {/* ── Loading / error / empty ── */}
      {isLoading && (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary-500" /></div>
      )}
      {isError && (
        <div className="card p-6 text-center text-red-600 bg-red-50 border-red-200">
          Gagal memuat data beban kerja.
        </div>
      )}

      {!isLoading && (
        auditors.length === 0 ? (
          <div className="card text-center py-16">
            <Users className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">Tidak ada auditor ditemukan</p>
          </div>
        ) : (
          <div className="space-y-2">
            {auditors.map((a) => (
              <HeatmapRow
                key={a.user_id}
                auditor={a}
                viewMode={viewMode}
                paguBobotPerBulan={paguBobotPerBulan}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
