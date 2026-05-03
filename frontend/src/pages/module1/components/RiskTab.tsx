import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, ChevronLeft, ChevronRight, BarChart3,
  AlertTriangle, X, Download, Upload, Database,
  Trash2, ChevronDown, ChevronUp, Info, ClipboardList,
} from 'lucide-react';
import { risksApi, organisasiApi, settingsApi } from '../../../services/api';
import { RiskData, RiskLevelKode } from '../../../types';
import { useAuthStore } from '../../../store/auth.store';
import toast from 'react-hot-toast';
import RiskDetailModal from './RiskDetailModal';
import RiskFormModal from './RiskFormModal';

interface Props { tahun: number; }

// ── Badge Risk Level ──────────────────────────────────────────
export function RiskLevelBadge({ level, label, bg, text }: {
  level?: string; label?: string; bg?: string; text?: string;
}) {
  if (!level) return <span className="text-slate-300 text-xs">—</span>;
  const bgClass  = bg   || LEVEL_COLORS[level as RiskLevelKode]?.bg   || 'bg-slate-100';
  const txtClass = text || LEVEL_COLORS[level as RiskLevelKode]?.text || 'text-slate-600';
  return (
    <span className={`badge ${bgClass} ${txtClass}`}>
      {level}
      {label && <span className="font-normal opacity-75">({label})</span>}
    </span>
  );
}

const LEVEL_COLORS: Record<RiskLevelKode, { bg: string; text: string }> = {
  E:  { bg: 'bg-red-100',    text: 'text-red-700' },
  T:  { bg: 'bg-orange-100', text: 'text-orange-700' },
  MT: { bg: 'bg-amber-100',  text: 'text-amber-700' },
  M:  { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  RM: { bg: 'bg-lime-100',   text: 'text-lime-700' },
  R:  { bg: 'bg-green-100',  text: 'text-green-700' },
};

function ProgramsBadge({ count, names }: { count: number; names?: string[] }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (count === 0) return <span className="text-slate-300 text-sm">—</span>;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((v) => !v);
  };

  const popStyle: React.CSSProperties = rect
    ? { position: 'fixed', top: rect.bottom + 6, left: rect.left, zIndex: 9999 }
    : { display: 'none' };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
      >
        <ClipboardList className="w-3 h-3" />
        {count} program
      </button>
      {open && rect && createPortal(
        <div ref={popRef} style={popStyle} className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 min-w-[220px] max-w-[300px]">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
            {count} Program Kerja Terkait
          </p>
          {names && names.length > 0 ? (
            <div className="space-y-1.5">
              {names.map((name, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                  <p className="text-xs text-slate-700 leading-relaxed">{name}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">{count} program kerja terkait risiko ini.</p>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export default function RiskTab({ tahun }: Props) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = ['admin_spi', 'it_admin', 'kepala_spi'].includes(user?.role ?? '');

  const [search, setSearch]               = useState('');
  const [direktoratId, setDirektoratId]   = useState('');
  const [divisiId, setDivisiId]           = useState('');
  const [levelInherent, setLevelInherent] = useState('');
  const [hosKategoriId, setHosKategoriId] = useState('');
  const [sasaranStrategisId, setSasaranStrategisId] = useState('');
  const [page, setPage]                   = useState(1);

  const [detailRiskId, setDetailRiskId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RiskData | null>(null);
  const [formOpen, setFormOpen]         = useState(false);
  const [editRisk, setEditRisk]         = useState<RiskData | null>(null);

  const { data: fullRiskRes } = useQuery({
    queryKey: ['risk-detail', detailRiskId],
    queryFn: () => risksApi.getById(detailRiskId!),
    enabled: !!detailRiskId,
    staleTime: 0,
  });
  const detailRisk = fullRiskRes?.data?.data ?? null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showMethodology, setShowMethodology]   = useState(false);

  async function handleDownloadTemplate() {
    setDownloadingTemplate(true);
    try {
      const res = await risksApi.downloadTemplate();
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'template_import_risiko.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template Excel berhasil diunduh');
    } catch {
      toast.error('Gagal mengunduh template');
    } finally {
      setDownloadingTemplate(false);
    }
  }

  const [importing, setImporting] = useState(false);

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setImporting(true);
    const loadingToast = toast.loading(`Mengimport ${file.name}...`);
    try {
      const res = await risksApi.importExcel(file, tahun);
      const { imported, skipped, errors } = res.data.data ?? { imported: 0, skipped: 0, errors: [] };
      toast.dismiss(loadingToast);
      if (errors.length === 0) {
        toast.success(`Import selesai: ${imported} Top Risk diimport ke tahun ${tahun}, ${skipped} baris dilewati.`);
      } else {
        toast(`Import selesai: ${imported} diimport, ${errors.length} error (baris ${errors.slice(0,3).map(e => e.row).join(', ')}${errors.length > 3 ? '...' : ''})`, { icon: '⚠️' });
      }
      setPage(1);
      await qc.invalidateQueries({ queryKey: ['risks'] });
      await qc.refetchQueries({ queryKey: ['risks'], type: 'active' });
    } catch (err: unknown) {
      toast.dismiss(loadingToast);
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Gagal mengimport file.';
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  }

  const LIMIT = 20;

  const { data: risksRes, isLoading, isError } = useQuery({
    queryKey: ['risks', { tahun, search, direktoratId, divisiId, levelInherent, hosKategoriId, sasaranStrategisId, page }],
    queryFn: () => risksApi.getAll({
      tahun,
      search: search || undefined,
      direktorat_id: direktoratId || undefined,
      divisi_id: divisiId || undefined,
      level_inherent: levelInherent || undefined,
      hos_kategori_id: hosKategoriId || undefined,
      sasaran_strategis_id: sasaranStrategisId || undefined,
      page,
      limit: LIMIT,
    }),
    staleTime: 30_000,
  });

  const { data: direktoratsRes } = useQuery({
    queryKey: ['direktorats-dropdown'],
    queryFn: () => organisasiApi.getDirektorats(),
    staleTime: 3600_000,
  });
  const { data: divisRes } = useQuery({
    queryKey: ['divisi-dropdown', direktoratId],
    queryFn: () => organisasiApi.getDivisis(direktoratId || undefined),
    staleTime: 3600_000,
  });
  const { data: levelRefRes } = useQuery({
    queryKey: ['risk-level-ref'],
    queryFn: () => risksApi.getLevelRef(),
    staleTime: 3600_000,
  });
  const { data: hosKategoriRes } = useQuery({
    queryKey: ['hos-kategori-filter', tahun],
    queryFn: () => settingsApi.getHosKategoris(tahun),
    staleTime: 3600_000,
  });
  const { data: sasaranFilterRes } = useQuery({
    queryKey: ['sasaran-strategis-filter', tahun, hosKategoriId],
    queryFn: () => settingsApi.getSasaranStrategis({ tahun, kategori_id: hosKategoriId || undefined }),
    staleTime: 3600_000,
  });

  const risksList     = risksRes?.data?.data?.data ?? [];
  const meta          = risksRes?.data?.data?.meta;
  const direktorats   = direktoratsRes?.data?.data  ?? [];
  const divisi        = divisRes?.data?.data        ?? [];
  const levelRefs     = levelRefRes?.data?.data     ?? [];
  const hosKategoris  = hosKategoriRes?.data?.data  ?? [];
  const sasaranFilter = sasaranFilterRes?.data?.data ?? [];

  const canFinalize = ['kepala_spi', 'admin_spi'].includes(user?.role ?? '');

  const resetMut = useMutation({
    mutationFn: () => risksApi.reset(tahun),
    onSuccess: (res) => {
      const { deleted, refsCleared } = res.data.data ?? { deleted: 0, refsCleared: 0 };
      toast.success(`${deleted} data risiko dihapus${refsCleared ? `, ${refsCleared} referensi program dibersihkan` : ''}.`);
      setShowResetConfirm(false);
      setPage(1);
      qc.invalidateQueries({ queryKey: ['risks'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'Gagal mereset data risiko');
      setShowResetConfirm(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => risksApi.delete(id),
    onSuccess: () => {
      toast.success('Risiko berhasil dihapus');
      setDeleteTarget(null);
      setDetailRiskId(null);
      qc.invalidateQueries({ queryKey: ['risks'] });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || 'Gagal menghapus risiko';
      toast.error(msg);
      setDeleteTarget(null);
    },
  });

  const handleFilterChange = (key: string, value: string) => {
    setPage(1);
    if (key === 'direktorat') { setDirektoratId(value); setDivisiId(''); }
    if (key === 'divisi') setDivisiId(value);
    if (key === 'level') setLevelInherent(value);
    if (key === 'hos') { setHosKategoriId(value); setSasaranStrategisId(''); }
    if (key === 'sasaran') setSasaranStrategisId(value);
    if (key === 'search') setSearch(value);
  };

  const resetFilters = () => {
    setSearch(''); setDirektoratId(''); setDivisiId('');
    setLevelInherent(''); setHosKategoriId(''); setSasaranStrategisId(''); setPage(1);
  };

  const hasFilters = search || direktoratId || divisiId || levelInherent || hosKategoriId || sasaranStrategisId;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Registri Risiko RCSA {tahun}</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {meta?.total ?? 0} risiko terdaftar · Berdasarkan Report RCSA Transjakarta
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className="btn-secondary"
            >
              <Download className="w-4 h-4" />
              {downloadingTemplate ? 'Menyiapkan...' : 'Download Template'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="btn-primary disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {importing ? 'Mengimport...' : 'Import Excel'}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
            <button
              disabled
              title="Integrasi TRUST — akan tersedia setelah API TRUST terhubung"
              className="btn-secondary opacity-50 cursor-not-allowed"
            >
              <Database className="w-4 h-4" />
              Sinkronisasi TRUST
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">SOON</span>
            </button>
            {canFinalize && (meta?.total ?? 0) > 0 && (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="btn-secondary text-red-600 border-red-200 hover:bg-red-50"
                title="Hapus semua data risiko tahun ini"
              >
                <Trash2 className="w-4 h-4" />
                Reset Data
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Info sumber data ─────────────────────────────── */}
      {isAdmin && (
        <div className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 text-xs text-primary-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary-600" />
          <span>
            Data risiko bersumber dari <strong>TRUST</strong> (otomatis) atau <strong>Import Excel</strong>.
            Unduh template terlebih dahulu untuk melihat field yang dibutuhkan sebelum import.
            <br />
            <span className="text-primary-600 mt-0.5 inline-block">Klik baris data untuk melihat detail risiko.</span>
          </span>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="filter-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari ID Risiko atau Nama Risiko..."
            value={search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="input pl-10"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div>
            <label className="section-label block mb-1.5">Direktorat</label>
            <select value={direktoratId} onChange={(e) => handleFilterChange('direktorat', e.target.value)} className="select-input">
              <option value="">Semua Direktorat</option>
              {direktorats.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1.5">Divisi</label>
            <select value={divisiId} onChange={(e) => handleFilterChange('divisi', e.target.value)} className="select-input">
              <option value="">Semua Divisi</option>
              {divisi.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1.5">Perspektif HoS</label>
            <select value={hosKategoriId} onChange={(e) => handleFilterChange('hos', e.target.value)} className="select-input">
              <option value="">Semua Perspektif</option>
              {hosKategoris.map((h) => (
                <option key={h.id} value={h.id}>{h.kode} — {h.nama_perspektif}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1.5">Sasaran Strategis</label>
            <select
              value={sasaranStrategisId}
              onChange={(e) => handleFilterChange('sasaran', e.target.value)}
              className="select-input"
              disabled={sasaranFilter.length === 0}
            >
              <option value="">Semua Sasaran</option>
              {(() => {
                const isChild = (kode?: string | null) => !!kode && kode.includes('.');
                const byKode  = (a: { kode?: string | null }, b: { kode?: string | null }) =>
                  (a.kode ?? '').localeCompare(b.kode ?? '', 'id', { numeric: true });
                const parents  = sasaranFilter.filter((s) => !isChild(s.kode)).sort(byKode);
                const children = sasaranFilter.filter((s) =>  isChild(s.kode)).sort(byKode);
                const pfx = (kode: string) => { const m = kode.match(/^([A-Za-z]+)(\d+)$/); return m ? `${m[1]}.${m[2]}.` : `${kode}.`; };
                const els: React.ReactNode[] = [];
                for (const p of parents) {
                  els.push(
                    <option key={`hdr-${p.id}`} value={p.id} disabled>
                      {p.kode ? `${p.kode} — ${p.nama}` : p.nama}
                    </option>
                  );
                  for (const c of children.filter((ch) => ch.kode?.startsWith(pfx(p.kode ?? '')))) {
                    els.push(<option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>);
                  }
                }
                for (const c of children.filter((ch) => !parents.some((p) => ch.kode?.startsWith(pfx(p.kode ?? ''))))) {
                  els.push(<option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>);
                }
                return els;
              })()}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1.5">Tingkat Risiko</label>
            <select value={levelInherent} onChange={(e) => handleFilterChange('level', e.target.value)} className="select-input">
              <option value="">Semua Level</option>
              {levelRefs.map((lr) => <option key={lr.kode} value={lr.kode}>{lr.kode} - {lr.label}</option>)}
            </select>
          </div>
          {hasFilters && (
            <div className="flex items-end">
              <button onClick={resetFilters} className="btn-secondary w-full justify-center">
                <X className="w-4 h-4" /> Reset Filter
              </button>
            </div>
          )}
        </div>

        {hasFilters && (
          <div className="flex flex-wrap gap-2 pt-1">
            {search && (
              <span className="filter-chip bg-primary-50 border-primary-200 text-primary-700">
                Cari: {search}
                <button onClick={() => handleFilterChange('search', '')} className="ml-1"><X className="w-3 h-3" /></button>
              </span>
            )}
            {direktoratId && (
              <span className="filter-chip bg-blue-50 border-blue-200 text-blue-700">
                Dir: {direktorats.find(d => d.id === direktoratId)?.nama}
                <button onClick={() => handleFilterChange('direktorat', '')} className="ml-1"><X className="w-3 h-3" /></button>
              </span>
            )}
            {divisiId && (
              <span className="filter-chip bg-green-50 border-green-200 text-green-700">
                Div: {divisi.find(d => d.id === divisiId)?.nama}
                <button onClick={() => handleFilterChange('divisi', '')} className="ml-1"><X className="w-3 h-3" /></button>
              </span>
            )}
            {levelInherent && (
              <span className="filter-chip bg-orange-50 border-orange-200 text-orange-700">
                Level: {levelInherent}
                <button onClick={() => handleFilterChange('level', '')} className="ml-1"><X className="w-3 h-3" /></button>
              </span>
            )}
            {hosKategoriId && (
              <span className="filter-chip bg-indigo-50 border-indigo-200 text-indigo-700">
                HoS: {hosKategoris.find(h => h.id === hosKategoriId)?.kode} — {hosKategoris.find(h => h.id === hosKategoriId)?.nama_perspektif}
                <button onClick={() => handleFilterChange('hos', '')} className="ml-1"><X className="w-3 h-3" /></button>
              </span>
            )}
            {sasaranStrategisId && (
              <span className="filter-chip bg-teal-50 border-teal-200 text-teal-700">
                Sasaran: {sasaranFilter.find(s => s.id === sasaranStrategisId)?.kode}
                <button onClick={() => handleFilterChange('sasaran', '')} className="ml-1"><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Data Table ──────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border border-slate-300 border-t-primary-600" />
        </div>
      ) : isError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">Gagal memuat data risiko</p>
            <p className="text-sm text-red-700 mt-1">Silakan coba refresh halaman atau hubungi support</p>
          </div>
        </div>
      ) : risksList.length === 0 ? (
        <div className="card p-8 text-center">
          <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Tidak ada risiko yang ditemukan</p>
          <p className="text-sm text-slate-400 mt-1">Coba ubah filter, atau import data dari Excel / TRUST.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base min-w-[900px]">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3 text-left">ID Risiko</th>
                  <th className="px-5 py-3 text-left">Direktorat</th>
                  <th className="px-5 py-3 text-left">Divisi</th>
                  <th className="px-5 py-3 text-left">Nama Risiko</th>
                  <th className="px-5 py-3 text-center">Tingkat Risiko</th>
                  <th className="px-5 py-3 text-center">Program Kerja</th>
                  <th className="px-5 py-3 text-left">Perspektif HoS</th>
                  <th className="px-5 py-3 text-left">Sasaran Strategis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {risksList.map((r) => {
                  const cnt = r.programs_count ?? 0;
                  const programNames = Array.isArray(r.programs) ? (r.programs as string[]) : [];
                  return (
                  <tr
                    key={r.id}
                    onClick={() => setDetailRiskId(r.id)}
                    className="table-row"
                    title="Klik untuk melihat detail risiko"
                  >
                    <td className="px-5 py-4 font-mono text-xs text-slate-600">{r.id_risiko}</td>
                    <td className="px-5 py-4 text-slate-800 text-sm">{r.direktorat || '—'}</td>
                    <td className="px-5 py-4 text-slate-800 text-sm">{r.divisi || '—'}</td>
                    <td className="px-5 py-4 max-w-xs">
                      <p className="font-medium text-slate-900 text-sm line-clamp-2">{r.nama_risiko}</p>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <RiskLevelBadge
                        level={r.level_inherent}
                        label={r.label_inherent}
                        bg={r.bg_inherent}
                        text={r.text_inherent}
                      />
                    </td>
                    <td className="px-5 py-4 text-center">
                      <ProgramsBadge count={cnt} names={programNames} />
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {r.hos_kategori_nama ? (
                        <span className="badge bg-indigo-50 border border-indigo-100 text-indigo-700">
                          {r.hos_kategori_nama}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-xs max-w-[200px]">
                      {r.sasaran_strategis_nama ? (
                        <p className="text-slate-700 line-clamp-2" title={r.sasaran_strategis_nama}>
                          {r.sasaran_strategis_nama}
                        </p>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Halaman <strong>{page}</strong> dari <strong>{totalPages}</strong> · Total <strong>{meta?.total}</strong> risiko
          </p>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-icon hover:bg-slate-100 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, page - 2) + i;
              if (pageNum > totalPages) return null;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    page === pageNum ? 'bg-primary-600 text-white' : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-icon hover:bg-slate-100 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────── */}
      {detailRiskId && detailRisk && (
        <RiskDetailModal
          risk={detailRisk}
          open={!!detailRisk}
          onClose={() => setDetailRiskId(null)}
          onEdit={isAdmin ? () => {
            setEditRisk(detailRisk);
            setDetailRiskId(null);
            setFormOpen(true);
          } : undefined}
          onDelete={isAdmin ? () => setDeleteTarget(detailRisk) : undefined}
        />
      )}

      {formOpen && (
        <RiskFormModal
          tahun={tahun}
          editData={editRisk}
          onClose={() => { setFormOpen(false); setEditRisk(null); }}
          onSuccess={() => {
            setFormOpen(false);
            setEditRisk(null);
            qc.invalidateQueries({ queryKey: ['risks'] });
          }}
        />
      )}

      {/* ── Metodologi Perhitungan ─────────────────────────── */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowMethodology((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Info className="w-4 h-4 text-primary-500" />
            Metodologi Penilaian Risiko
          </div>
          {showMethodology ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showMethodology && (
          <div className="border-t border-slate-100 px-5 py-4 space-y-5 text-sm text-slate-700">

            {/* Formula */}
            <div>
              <p className="font-bold text-slate-800 mb-1">Rumus Tingkat Risiko</p>
              <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-100 rounded-lg px-4 py-2 text-primary-800 font-mono text-sm">
                Tingkat Risiko = <strong>Dampak</strong> × <strong>Kemungkinan</strong>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Kode skor ditulis sebagai dua digit: <strong>Dampak + Kemungkinan</strong>. Contoh: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">54</code> = Dampak 5 × Kemungkinan 4 = skor <strong>20</strong> = Ekstrim.
              </p>
            </div>

            {/* Level table */}
            <div>
              <p className="font-bold text-slate-800 mb-2">Level Tingkat Risiko</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Kode</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Level</th>
                      <th className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-600">Skor (D × K)</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">Contoh Kode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { kode: 'E',  label: 'Ekstrim',          min: 20, max: 25, contoh: '54, 55, 45',           bg: 'bg-red-100',    text: 'text-red-700'    },
                      { kode: 'T',  label: 'Tinggi',           min: 15, max: 19, contoh: '53, 44, 35',           bg: 'bg-orange-100', text: 'text-orange-700' },
                      { kode: 'MT', label: 'Menengah Tinggi',  min: 10, max: 14, contoh: '52, 43, 34, 25',       bg: 'bg-amber-100',  text: 'text-amber-700'  },
                      { kode: 'M',  label: 'Menengah',         min: 5,  max: 9,  contoh: '51, 42, 33, 23, 15',   bg: 'bg-yellow-100', text: 'text-yellow-800' },
                      { kode: 'RM', label: 'Rendah Menengah',  min: 4,  max: 4,  contoh: '41, 22, 14',           bg: 'bg-lime-100',   text: 'text-lime-700'   },
                      { kode: 'R',  label: 'Rendah',           min: 1,  max: 3,  contoh: '31, 21, 11, 12, 13',   bg: 'bg-green-100',  text: 'text-green-700'  },
                    ].map((l) => (
                      <tr key={l.kode} className="hover:bg-slate-50">
                        <td className="border border-slate-200 px-3 py-2">
                          <span className={`badge ${l.bg} ${l.text} font-bold`}>{l.kode}</span>
                        </td>
                        <td className="border border-slate-200 px-3 py-2 font-medium">{l.label}</td>
                        <td className="border border-slate-200 px-3 py-2 text-center font-mono text-slate-600">
                          {l.min === l.max ? l.min : `${l.min} – ${l.max}`}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 font-mono text-slate-500 text-[11px]">{l.contoh}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Matriks ringkasan */}
            <div>
              <p className="font-bold text-slate-800 mb-2">Matriks Risiko (Dampak × Kemungkinan)</p>
              <div className="overflow-x-auto">
                <table className="text-[11px] border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-slate-200 bg-slate-100 px-2 py-1.5 font-semibold text-slate-600">D\K</th>
                      {['1 Jarang', '2 K.Kecil', '3 Mungkin', '4 K.Besar', '5 H.Pasti'].map((h) => (
                        <th key={h} className="border border-slate-200 bg-slate-100 px-2 py-1.5 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { d: '5 Kritikal', scores: ['M','MT','T','E','E'] },
                      { d: '4 Berat',    scores: ['RM','M','MT','T','E'] },
                      { d: '3 Sedang',   scores: ['R','M','M','MT','T'] },
                      { d: '2 Ringan',   scores: ['R','RM','M','M','MT'] },
                      { d: '1 T.Berarti',scores: ['R','R','R','RM','M'] },
                    ].map((row) => (
                      <tr key={row.d}>
                        <td className="border border-slate-200 bg-slate-50 px-2 py-1.5 font-semibold text-slate-600 whitespace-nowrap">{row.d}</td>
                        {row.scores.map((s, i) => {
                          const cfg = LEVEL_COLORS[s as RiskLevelKode];
                          return (
                            <td key={i} className={`border border-slate-200 px-2 py-1.5 text-center font-bold ${cfg?.bg ?? ''} ${cfg?.text ?? ''}`}>{s}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Sumber: Pedoman Manajemen Risiko Transjakarta — Selera Risiko: <strong>Rendah</strong> · Toleransi: <strong>Rendah Menengah</strong>
              </p>
            </div>

          </div>
        )}
      </div>

      {/* ── Reset confirmation ─────────────────────────────── */}
      {showResetConfirm && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm" onClick={() => !resetMut.isPending && setShowResetConfirm(false)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full pointer-events-auto space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">Reset Semua Data Risiko?</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Seluruh <strong>{meta?.total ?? 0} data risiko</strong> tahun <strong>{tahun}</strong> akan dihapus permanen, termasuk referensi dari program PKPT. Aksi ini tidak dapat dibatalkan.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={resetMut.isPending}
                  className="btn-secondary flex-1 justify-center"
                >
                  Batal
                </button>
                <button
                  onClick={() => resetMut.mutate()}
                  disabled={resetMut.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {resetMut.isPending ? 'Menghapus...' : 'Ya, Hapus Semua'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm" onClick={() => !deleteMut.isPending && setDeleteTarget(null)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full pointer-events-auto space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">Hapus Risiko?</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Risiko <strong className="text-slate-700">{deleteTarget.id_risiko}</strong> akan dihapus permanen. Aksi ini tidak dapat dibatalkan.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending} className="btn-secondary flex-1 justify-center">Batal</button>
                <button
                  onClick={() => deleteMut.mutate(deleteTarget.id)}
                  disabled={deleteMut.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleteMut.isPending ? 'Menghapus...' : 'Ya, Hapus'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
