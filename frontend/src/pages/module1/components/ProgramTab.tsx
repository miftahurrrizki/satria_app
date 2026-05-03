import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, CheckCircle2, Clock,
  Loader2, AlertCircle, ChevronLeft, ChevronRight,
  Users, CalendarDays, X, AlertTriangle, Hourglass, PlayCircle, Flag, Search,
  Briefcase, TrendingDown, Trash2, RotateCcw, Building2,
} from 'lucide-react';
import { annualPlansApi, kalenderKerjaApi, settingsApi } from '../../../services/api';
import { AnnualAuditPlan, JenisProgram, StatusPKPT } from '../../../types';
import { useAuthStore } from '../../../store/auth.store';
import toast from 'react-hot-toast';
import ProgramFormModal from './ProgramFormModal';
import ProgramDetailModal from './ProgramDetailModal';

interface Props { tahun: number; }

const JENIS_BADGE: Record<JenisProgram, string> = {
  'PKPT':     'bg-primary-50 text-primary-700 border border-primary-200',
  'Non PKPT': 'bg-purple-50 text-purple-700 border border-purple-200',
};

const STATUS_BADGE: Record<StatusPKPT, { cls: string; icon: React.ElementType }> = {
  'Open':        { cls: 'bg-amber-50 text-amber-700 border border-amber-200',       icon: Clock },
  'On Progress': { cls: 'bg-primary-50 text-primary-700 border border-primary-200', icon: PlayCircle },
  'Closed':      { cls: 'bg-green-50 text-green-700 border border-green-200',        icon: CheckCircle2 },
};

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

type TimelineKey = 'not_started' | 'running' | 'near_deadline' | 'overdue' | 'done';
const TIMELINE_BADGE: Record<TimelineKey, { label: string; cls: string; icon: React.ElementType }> = {
  not_started:   { label: 'Belum Mulai',        cls: 'bg-slate-100 text-slate-600 border border-slate-200',    icon: Hourglass    },
  running:       { label: 'Berjalan',            cls: 'bg-green-50 text-green-700 border border-green-200',     icon: PlayCircle   },
  near_deadline: { label: 'Mendekati Deadline',  cls: 'bg-yellow-50 text-yellow-700 border border-yellow-300',  icon: AlertTriangle },
  overdue:       { label: 'Overdue',             cls: 'bg-red-50 text-red-700 border border-red-200',           icon: AlertTriangle },
  done:          { label: 'Selesai',             cls: 'bg-blue-50 text-blue-700 border border-blue-200',        icon: Flag         },
};

function deriveTimelineStatus(p: { tanggal_mulai?: string; tanggal_selesai?: string; completed_at?: string | null; status_pkpt?: string }): TimelineKey {
  if (p.status_pkpt === 'Closed') return 'done';
  const mulai   = p.tanggal_mulai   ? new Date(p.tanggal_mulai)   : null;
  const selesai = p.tanggal_selesai ? new Date(p.tanggal_selesai) : null;
  if (!mulai || !selesai || Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime())) return 'not_started';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  mulai.setHours(0, 0, 0, 0); selesai.setHours(0, 0, 0, 0);
  if (today < mulai) return 'not_started';
  if (today > selesai) return 'overdue';
  const daysLeft = Math.ceil((selesai.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 7) return 'near_deadline';
  return 'running';
}

function deriveTimelineDuration(key: TimelineKey, p: { tanggal_mulai?: string; tanggal_selesai?: string }): string | null {
  const MS_DAY = 1000 * 60 * 60 * 24;
  const today  = new Date(); today.setHours(0, 0, 0, 0);

  if (key === 'running' || key === 'near_deadline') {
    const mulai = p.tanggal_mulai ? new Date(p.tanggal_mulai) : null;
    if (!mulai) return null;
    mulai.setHours(0, 0, 0, 0);
    const days = Math.floor((today.getTime() - mulai.getTime()) / MS_DAY);
    if (days < 1)  return 'Hari ini';
    if (days < 30) return `${days} hari`;
    const months = Math.floor(days / 30);
    const sisa   = days % 30;
    return sisa > 0 ? `${months} bln ${sisa} hr` : `${months} bulan`;
  }

  if (key === 'overdue') {
    const selesai = p.tanggal_selesai ? new Date(p.tanggal_selesai) : null;
    if (!selesai) return null;
    selesai.setHours(0, 0, 0, 0);
    const days = Math.floor((today.getTime() - selesai.getTime()) / MS_DAY);
    if (days < 1)  return 'Hari ini';
    if (days < 30) return `+${days} hari`;
    const months = Math.floor(days / 30);
    const sisa   = days % 30;
    return sisa > 0 ? `+${months} bln ${sisa} hr` : `+${months} bulan`;
  }

  return null;
}

export default function ProgramTab({ tahun }: Props) {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const [search, setSearch]                         = useState('');
  const [jenisFilter, setJenisFilter]               = useState('');
  const [statusFilter, setStatusFilter]             = useState('');
  const [kategoriFilter, setKategoriFilter]         = useState('');
  const [sifatProgramFilter, setSifatProgramFilter] = useState('');
  const [kategoriAnggaranFilter, setKategoriAnggaranFilter] = useState('');
  const [bulanFilter, setBulanFilter]               = useState('');
  const [page, setPage]                             = useState(1);

  const [formOpen, setFormOpen]       = useState(false);
  const [editProgram, setEditProgram] = useState<AnnualAuditPlan | null>(null);
  const [detailId, setDetailId]       = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnualAuditPlan | null>(null);
  const [showTrash, setShowTrash]     = useState(false);
  const [purgeAllConfirm, setPurgeAllConfirm] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<string | null>(null);

  const LIMIT = 10;

  const { data: kelompokRes } = useQuery({
    queryKey: ['kelompok-penugasan'],
    queryFn: () => settingsApi.getKelompokPenugasan().then((r) => r.data.data ?? []),
    staleTime: 5 * 60_000,
  });
  const kategoriOptions      = useMemo(() => (kelompokRes ?? []).filter((k) => k.tipe === 'Kategori' && k.is_active).map((k) => k.nilai), [kelompokRes]);
  const sifatOptions         = useMemo(() => (kelompokRes ?? []).filter((k) => k.tipe === 'Sifat Program' && k.is_active).map((k) => k.nilai), [kelompokRes]);
  const kategoriAnggaranOptions = useMemo(() => (kelompokRes ?? []).filter((k) => k.tipe === 'Kategori Anggaran' && k.is_active).map((k) => k.nilai), [kelompokRes]);

  const { data: planRes, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['annual-plans', { tahun, search, jenisFilter, statusFilter, kategoriFilter, sifatProgramFilter, kategoriAnggaranFilter, bulanFilter, page }],
    queryFn: async () => {
      const res = await annualPlansApi.getAll({
        tahun,
        search: search || undefined,
        jenis_program: jenisFilter || undefined,
        status_pkpt: statusFilter || undefined,
        kategori_program: kategoriFilter || undefined,
        status_program: sifatProgramFilter || undefined,
        kategori_anggaran: kategoriAnggaranFilter || undefined,
        bulan: bulanFilter || undefined,
        page,
        limit: LIMIT,
      });
      return res.data as unknown as {
        data: AnnualAuditPlan[];
        meta: { total: number; page: number; limit: number; totalPages: number };
      };
    },
    placeholderData: (prev) => prev,
  });

  const plans = planRes?.data ?? [];
  const total = planRes?.meta?.total ?? 0;
  const pages = Math.ceil(total / LIMIT);

  const { data: allPlansRes } = useQuery({
    queryKey: ['annual-plans-all-yearly', tahun],
    queryFn: async () => {
      const res = await annualPlansApi.getAll({ tahun, limit: 500 });
      return (res.data as unknown as { data: AnnualAuditPlan[] }).data ?? [];
    },
    staleTime: 60_000,
  });
  const { data: trashRes } = useQuery({
    queryKey: ['annual-plans-trash', tahun],
    queryFn: () => annualPlansApi.getTrash(tahun).then((r) => r.data.data ?? []),
    enabled: ['kepala_spi', 'admin_spi', 'pengendali_teknis'].includes(user?.role ?? ''),
    staleTime: 30_000,
  });
  const trashItems = trashRes ?? [];

  const { data: kalenderRes } = useQuery({
    queryKey: ['kalender-kerja-program-tab', tahun],
    queryFn: () => kalenderKerjaApi.get(tahun),
    staleTime: 5 * 60_000,
  });

  const paguHP        = kalenderRes?.data?.data?.header?.hari_pemeriksaan_tersedia ?? 0;
  const totalTerpakai = (allPlansRes ?? []).reduce((s, p) => s + Number(p.man_days_terpakai ?? 0), 0);
  const sisaHP        = Math.max(0, paguHP - totalTerpakai);
  const persenHP      = paguHP > 0 ? (totalTerpakai / paguHP) * 100 : 0;

  const deleteMut = useMutation({
    mutationFn: (id: string) => annualPlansApi.delete(id),
    onSuccess: () => {
      toast.success('Program berhasil dihapus');
      qc.invalidateQueries({ queryKey: ['annual-plans'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setDeleteTarget(null);
      setDetailId(null);
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.message ?? 'Gagal menghapus program';
      toast.error(msg);
    },
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => annualPlansApi.restore(id),
    onSuccess: () => {
      toast.success('Program berhasil dipulihkan');
      qc.invalidateQueries({ queryKey: ['annual-plans'] });
      qc.invalidateQueries({ queryKey: ['annual-plans-trash', tahun] });
    },
    onError: () => toast.error('Gagal memulihkan program'),
  });

  const purgeMut = useMutation({
    mutationFn: (id: string) => annualPlansApi.purge(id),
    onSuccess: () => {
      toast.success('Program dihapus permanen');
      setPurgeTarget(null);
      qc.invalidateQueries({ queryKey: ['annual-plans-trash', tahun] });
    },
    onError: () => { toast.error('Gagal menghapus permanen'); setPurgeTarget(null); },
  });

  const purgeAllMut = useMutation({
    mutationFn: () => annualPlansApi.purgeAll(tahun),
    onSuccess: (res) => {
      const count = res.data.data?.count ?? 0;
      toast.success(`${count} program dihapus permanen dari trash`);
      setPurgeAllConfirm(false);
      setShowTrash(false);
      qc.invalidateQueries({ queryKey: ['annual-plans-trash', tahun] });
    },
    onError: () => { toast.error('Gagal menghapus semua'); setPurgeAllConfirm(false); },
  });

  const finalizeMut = useMutation({
    mutationFn: (id: string) => annualPlansApi.finalize(id),
    onSuccess: () => {
      toast.success('Program ditutup (Closed)');
      qc.invalidateQueries({ queryKey: ['annual-plans'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setDetailId(null);
    },
    onError: () => toast.error('Gagal menutup program'),
  });

  const canCreate   = ['kepala_spi', 'admin_spi', 'pengendali_teknis'].includes(user?.role ?? '');
  const canFinalize = ['kepala_spi', 'admin_spi'].includes(user?.role ?? '');

  function fmtDate(d?: string) {
    if (!d) return '—';
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtRupiahShort(v?: number | null): string {
    if (v == null) return '—';
    if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (v >= 1_000_000)     return `Rp ${(v / 1_000_000).toFixed(1).replace(/\.?0+$/, '')}jt`;
    if (v >= 1_000)         return `Rp ${(v / 1_000).toFixed(0)}rb`;
    return `Rp ${v}`;
  }

  const resetAllFilters = () => {
    setSearch(''); setJenisFilter(''); setStatusFilter('');
    setKategoriFilter(''); setSifatProgramFilter(''); setKategoriAnggaranFilter('');
    setBulanFilter(''); setPage(1);
  };

  const hasFilters = search || jenisFilter || statusFilter || kategoriFilter || sifatProgramFilter || kategoriAnggaranFilter || bulanFilter;

  return (
    <div className="space-y-5">

      {/* ── Header + Create ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-800">Daftar Program Kerja Tahun {tahun}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {canFinalize && trashItems.length > 0 && (
            <button
              onClick={() => setShowTrash((v) => !v)}
              className={`btn-secondary gap-2 ${showTrash ? 'bg-red-50 border-red-200 text-red-700' : ''}`}
            >
              <Trash2 className="w-4 h-4" />
              Trash
              <span className="text-[11px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">{trashItems.length}</span>
            </button>
          )}
          {canCreate && (
            <button type="button" onClick={() => { setEditProgram(null); setFormOpen(true); }} className="btn-primary w-full sm:w-auto justify-center">
              <Plus className="w-4 h-4" /> Buat Program Kerja
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="filter-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari Judul Program atau Auditee..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-10"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="section-label block mb-1.5">Bulan</label>
            <select value={bulanFilter} onChange={(e) => { setBulanFilter(e.target.value); setPage(1); }} className="select-input">
              <option value="">Semua Bulan</option>
              {MONTH_LABELS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1.5">Jenis Program</label>
            <select value={jenisFilter} onChange={(e) => { setJenisFilter(e.target.value); setPage(1); }} className="select-input">
              <option value="">Semua Jenis</option>
              <option value="PKPT">PKPT</option>
              <option value="Non PKPT">Non PKPT</option>
            </select>
          </div>
          <div>
            <label className="section-label block mb-1.5">Status PKPT</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="select-input">
              <option value="">Semua Status</option>
              <option value="Open">Open</option>
              <option value="On Progress">On Progress</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="section-label block mb-1.5">Kategori Program</label>
            <select value={kategoriFilter} onChange={(e) => { setKategoriFilter(e.target.value); setPage(1); }} className="select-input">
              <option value="">Semua Kategori</option>
              {kategoriOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1.5">Sifat Program</label>
            <select value={sifatProgramFilter} onChange={(e) => { setSifatProgramFilter(e.target.value); setPage(1); }} className="select-input">
              <option value="">Semua Sifat</option>
              {sifatOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1.5">Kategori Anggaran</label>
            <select value={kategoriAnggaranFilter} onChange={(e) => { setKategoriAnggaranFilter(e.target.value); setPage(1); }} className="select-input">
              <option value="">Semua Kategori</option>
              {kategoriAnggaranOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
            {search && (
              <span className="filter-chip bg-primary-50 border-primary-200 text-primary-700">
                Cari: {search} <button onClick={() => { setSearch(''); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {bulanFilter && (
              <span className="filter-chip bg-blue-50 border-blue-200 text-blue-700">
                Bulan: {MONTH_LABELS[Number(bulanFilter) - 1]} <button onClick={() => { setBulanFilter(''); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {jenisFilter && (
              <span className="filter-chip bg-violet-50 border-violet-200 text-violet-700">
                Jenis: {jenisFilter} <button onClick={() => { setJenisFilter(''); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {statusFilter && (
              <span className="filter-chip bg-amber-50 border-amber-200 text-amber-700">
                Status: {statusFilter} <button onClick={() => { setStatusFilter(''); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {kategoriFilter && (
              <span className="filter-chip bg-green-50 border-green-200 text-green-700">
                Kategori: {kategoriFilter} <button onClick={() => { setKategoriFilter(''); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {sifatProgramFilter && (
              <span className="filter-chip bg-indigo-50 border-indigo-200 text-indigo-700">
                Sifat: {sifatProgramFilter} <button onClick={() => { setSifatProgramFilter(''); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {kategoriAnggaranFilter && (
              <span className="filter-chip bg-slate-50 border-slate-200 text-slate-700">
                Anggaran: {kategoriAnggaranFilter} <button onClick={() => { setKategoriAnggaranFilter(''); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            <button onClick={resetAllFilters} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="w-3 h-3" /> Reset Semua
            </button>
          </div>
        )}
      </div>

      {/* ── Utilisasi Pagu HP ── */}
      {paguHP > 0 && (
        <div className="card p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary-50">
                <Briefcase className="w-4 h-4 text-primary-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">Utilisasi Pagu Hari Pemeriksaan {tahun}</p>
                <p className="text-[11px] text-slate-400">Total Man-Days terpakai dari semua program vs pagu kalender kerja</p>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="text-right">
                <p className="section-label">Pagu</p>
                <p className="text-base font-black text-slate-700 tabular-nums">{paguHP.toLocaleString('id-ID')} <span className="text-[10px] font-semibold text-slate-400">HP</span></p>
              </div>
              <div className="text-right">
                <p className="section-label">Terpakai</p>
                <p className={`text-base font-black tabular-nums ${persenHP >= 100 ? 'text-red-700' : persenHP >= 80 ? 'text-amber-700' : 'text-primary-700'}`}>
                  {totalTerpakai.toFixed(1)} <span className="text-[10px] font-semibold opacity-70">HP</span>
                </p>
              </div>
              <div className="text-right">
                <p className="section-label flex items-center justify-end gap-1"><TrendingDown className="w-2.5 h-2.5" /> Sisa</p>
                <p className={`text-base font-black tabular-nums ${sisaHP === 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {sisaHP.toFixed(1)} <span className="text-[10px] font-semibold opacity-70">HP</span>
                </p>
              </div>
            </div>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${persenHP >= 100 ? 'bg-red-500' : persenHP >= 80 ? 'bg-amber-500' : persenHP >= 50 ? 'bg-emerald-500' : 'bg-primary-500'}`}
              style={{ width: `${Math.max(2, Math.min(100, persenHP))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
            {persenHP.toFixed(1)}% pagu sudah terpakai
            {persenHP >= 100 && <span className="ml-2 font-bold text-red-700">⚠ MELAMPAUI PAGU TAHUNAN</span>}
          </p>
        </div>
      )}

      {/* ── Stat Cards — selalu pakai allPlansRes (semua program tahun ini, tanpa filter) ── */}
      {(() => {
        const all = allPlansRes ?? [];
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Program', val: all.length,                                                       color: 'text-slate-800' },
              { label: 'Open',          val: all.filter((p) => p.status_pkpt === 'Open').length,               color: 'text-amber-700' },
              { label: 'On Progress',   val: all.filter((p) => p.status_pkpt === 'On Progress').length,        color: 'text-primary-700' },
              { label: 'Closed',        val: all.filter((p) => p.status_pkpt === 'Closed').length,             color: 'text-green-700' },
              { label: 'PKPT',          val: all.filter((p) => p.jenis_program === 'PKPT').length,             color: 'text-primary-700' },
              { label: 'Non PKPT',      val: all.filter((p) => p.jenis_program === 'Non PKPT').length,         color: 'text-purple-700' },
            ].map((c) => (
              <div key={c.label} className="card px-4 py-3 flex flex-col justify-center">
                <p className={`text-2xl font-black ${c.color}`}>{c.val}</p>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">{c.label}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Data Table ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-slate-700 text-sm">
            Data Program Kerja <span className="text-slate-400 font-normal">— klik baris untuk detail</span>
          </h3>
          <span className="text-xs text-slate-400">
            {total > 0 ? `${Math.min((page - 1) * LIMIT + 1, total)}–${Math.min(page * LIMIT, total)} dari ${total} program` : 'Belum ada program'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base min-w-[1024px] text-xs">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Judul Program</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Personil</th>
                <th className="px-4 py-3 text-center">Est. Hari</th>
                <th className="px-4 py-3 text-center">Man-Days</th>
                <th className="px-4 py-3 text-right">Anggaran</th>
                <th className="px-4 py-3">Periode</th>
                <th className="px-4 py-3">Timeline</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Sifat</th>
                <th className="px-4 py-3">Kat. Anggaran</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 13 }).map((__, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-100 rounded animate-pulse" /></td>)}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10">
                    <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
                      <AlertCircle className="w-6 h-6 text-red-400" />
                      <p>Gagal memuat data program.</p>
                      <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary text-xs">Coba lagi</button>
                    </div>
                  </td>
                </tr>
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <AlertCircle className="w-10 h-10 text-slate-200" />
                      <p className="text-slate-400 text-sm">Belum ada program kerja untuk tahun {tahun}.</p>
                      {canCreate && (
                        <button onClick={() => { setEditProgram(null); setFormOpen(true); }} className="btn-primary text-sm mt-1">
                          <Plus className="w-4 h-4" /> Buat Program Pertama
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                plans.map((plan, idx) => {
                  const SBadge = STATUS_BADGE[plan.status_pkpt as StatusPKPT];
                  const SIcon  = SBadge?.icon ?? Clock;
                  const rowNum = (page - 1) * LIMIT + idx + 1;
                  const timelineKey      = deriveTimelineStatus(plan as any);
                  const timelineInfo     = TIMELINE_BADGE[timelineKey];
                  const timelineDuration = deriveTimelineDuration(timelineKey, plan as any);
                  const TIcon = timelineInfo.icon;

                  return (
                    <tr
                      key={plan.id}
                      onClick={() => setDetailId(plan.id)}
                      className="table-row"
                      title="Klik untuk melihat detail program"
                    >
                      <td className="px-4 py-3 text-slate-400 text-center">{rowNum}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`badge ${JENIS_BADGE[plan.jenis_program as JenisProgram]}`}>{plan.jenis_program}</span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-semibold text-slate-800 text-primary-600 break-words line-clamp-2">{plan.judul_program}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`badge ${SBadge?.cls}`}>
                          <SIcon className="w-3 h-3" /> {plan.status_pkpt}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className="inline-flex items-center justify-center gap-1 text-slate-600">
                          <Users className="w-3 h-3 text-slate-400" /> {plan.jumlah_personil ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className="badge bg-slate-100 text-slate-700">
                          <CalendarDays className="w-3 h-3 text-slate-400" /> {plan.estimasi_hari}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center font-semibold text-slate-700">
                        {plan.man_days_terpakai != null ? Number(plan.man_days_terpakai).toFixed(1) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-slate-700">{fmtRupiahShort(plan.anggaran)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-slate-600">{fmtDate(plan.tanggal_mulai)}</p>
                        <p className="text-slate-400">s/d {fmtDate(plan.tanggal_selesai)}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-0.5">
                          <span className={`badge ${timelineInfo.cls}`}>
                            <TIcon className="w-3 h-3" /> {timelineInfo.label}
                          </span>
                          {timelineDuration && (
                            <span className={`text-[10px] font-medium pl-0.5 ${
                              timelineKey === 'overdue' ? 'text-red-600' : 'text-slate-500'
                            }`}>
                              {timelineKey === 'overdue' ? `Lewat ${timelineDuration}` : `Berjalan ${timelineDuration}`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="badge bg-blue-50 text-blue-700 border border-blue-200">{plan.kategori_program}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200">{plan.status_program || '—'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {plan.kategori_anggaran ? (
                          <span className={`badge border ${plan.kategori_anggaran === 'Subsidi' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                            {plan.kategori_anggaran}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              Halaman {page} dari {pages}
            </span>
            <div className="flex items-center gap-1">
              {/* Prev */}
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* Page numbers with smart ellipsis */}
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
                .reduce<(number | '...')[]>((acc, n, i, arr) => {
                  if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(n);
                  return acc;
                }, [])
                .map((item, i) =>
                  item === '...' ? (
                    <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-slate-400">
                      ···
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item as number)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold border transition-colors ${
                        page === item
                          ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

              {/* Next */}
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Trash Panel ── */}
      {canFinalize && showTrash && (
        <div className="card overflow-hidden border-red-100">
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-600" />
              <span className="font-semibold text-red-800 text-sm">Trash — Program Terhapus ({trashItems.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {trashItems.length > 0 && (
                <button
                  onClick={() => setPurgeAllConfirm(true)}
                  className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 bg-white rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
                >
                  Hapus Permanen Semua
                </button>
              )}
              <button onClick={() => setShowTrash(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {trashItems.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">Trash kosong</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {trashItems.map((item) => (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{item.judul_program}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.jenis_program} · {item.kategori_program} · Dihapus: {new Date(item.deleted_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => restoreMut.mutate(item.id)}
                      disabled={restoreMut.isPending}
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-1.5 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Pulihkan
                    </button>
                    <button
                      onClick={() => setPurgeTarget(item.id)}
                      disabled={purgeMut.isPending}
                      className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-1.5 hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus Permanen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Purge single confirm ── */}
      {purgeTarget && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm" onClick={() => !purgeMut.isPending && setPurgeTarget(null)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full pointer-events-auto space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">Hapus Permanen?</p>
                  <p className="text-sm text-slate-500 mt-1">Program ini akan dihapus dari sistem secara permanen dan tidak dapat dipulihkan.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPurgeTarget(null)} disabled={purgeMut.isPending} className="btn-secondary flex-1 justify-center">Batal</button>
                <button
                  onClick={() => purgeMut.mutate(purgeTarget)}
                  disabled={purgeMut.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {purgeMut.isPending ? 'Menghapus...' : 'Ya, Hapus Permanen'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Purge all confirm ── */}
      {purgeAllConfirm && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm" onClick={() => !purgeAllMut.isPending && setPurgeAllConfirm(false)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full pointer-events-auto space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">Hapus Semua dari Trash?</p>
                  <p className="text-sm text-slate-500 mt-1">
                    <strong>{trashItems.length} program</strong> di trash akan dihapus permanen. Aksi ini tidak dapat dibatalkan.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPurgeAllConfirm(false)} disabled={purgeAllMut.isPending} className="btn-secondary flex-1 justify-center">Batal</button>
                <button
                  onClick={() => purgeAllMut.mutate()}
                  disabled={purgeAllMut.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {purgeAllMut.isPending ? 'Menghapus...' : `Hapus ${trashItems.length} Program`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full pointer-events-auto">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">Hapus Program?</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Program <span className="font-semibold text-slate-700">"{deleteTarget.judul_program}"</span> akan dihapus permanen.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 justify-center">Batal</button>
                <button
                  onClick={() => deleteMut.mutate(deleteTarget.id)}
                  disabled={deleteMut.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {deleteMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Hapus
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <ProgramFormModal
          key={editProgram?.id ?? 'new'}
          tahun={tahun}
          editData={editProgram}
          onClose={() => { setFormOpen(false); setEditProgram(null); }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['annual-plans'] });
            qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
            setFormOpen(false);
            setEditProgram(null);
          }}
        />
      )}

      {detailId && (
        <ProgramDetailModal
          programId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={canCreate ? (plan) => {
            setDetailId(null);
            setEditProgram(plan);
            setFormOpen(true);
          } : undefined}
          onFinalize={canFinalize ? (id) => finalizeMut.mutate(id) : undefined}
          onDelete={canCreate ? (plan) => {
            setDetailId(null);
            setDeleteTarget(plan);
          } : undefined}
        />
      )}
    </div>
  );
}
