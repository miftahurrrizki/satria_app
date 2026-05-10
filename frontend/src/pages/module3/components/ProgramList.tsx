/**
 * Program List — Modul 3 (Pelaksanaan Audit & Kertas Kerja).
 * - Heading + Filter card SELARAS Modul 2 (breadcrumb, year filter, search + 3 dropdown, chips reset).
 * - List program tetap card layout (bukan tabel) — supaya beda peran dengan Modul 2.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Home, Search, Calendar, ChevronRight, FolderOpen, ClipboardList, X, AlertTriangle, Loader2,
} from 'lucide-react';
import { penugasanApi } from '../../../services/api';
import { AuditProgram } from '../../../types';
import { fmtDate } from './helpers';

const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i);

const JENIS_BADGE: Record<string, string> = {
  'PKPT':     'bg-primary-50 text-primary-700 border border-primary-200',
  'Non PKPT': 'bg-purple-50 text-purple-700 border border-purple-200',
};

const Spinner = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <Loader2 className={`animate-spin text-primary-500 ${className}`} />
);

const YearFilter = ({ value, onChange }: { value: number; onChange: (y: number) => void }) => (
  <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-primary-400 transition-all">
    <div className="flex items-center gap-1.5 pl-3 pr-2 py-2 bg-slate-50 border-r border-slate-200">
      <Calendar className="w-4 h-4 text-slate-500" />
      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider hidden sm:block">Tahun</span>
    </div>
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="appearance-none bg-transparent text-slate-800 text-sm font-bold pl-3 pr-8 py-2 focus:outline-none cursor-pointer hover:bg-slate-50 transition-colors"
    >
      {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  </div>
);

export default function ProgramList({ onSelect }: { onSelect: (id: string) => void }) {
  const navigate = useNavigate();
  const [tahun, setTahun]                   = useState(new Date().getFullYear());
  const [search, setSearch]                 = useState('');
  const [filterJenis, setFilterJenis]       = useState('');
  const [filterKategori, setFilterKategori] = useState('');
  const [filterSifat, setFilterSifat]       = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['m3-program-list', tahun],
    queryFn: () => penugasanApi.listPrograms(tahun).then((r) => r.data.data ?? []),
    staleTime: 30_000,
  });

  // Hanya program yg sudah ada di Modul 2 (id != null)
  const programs = useMemo(
    () => (data ?? []).filter((p): p is AuditProgram & { id: string } => p.id != null),
    [data],
  );

  const kategoriOptions = useMemo(
    () => Array.from(new Set(programs.map((p) => p.kategori_program).filter(Boolean))).sort() as string[],
    [programs],
  );
  const sifatOptions = useMemo(
    () => Array.from(new Set(programs.map((p) => p.status_program).filter(Boolean))).sort() as string[],
    [programs],
  );

  const filtered = useMemo(() => {
    return programs.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const hit =
          p.annual_plan_judul.toLowerCase().includes(q) ||
          (p.auditee?.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }
      if (filterJenis    && p.jenis_program    !== filterJenis)    return false;
      if (filterKategori && p.kategori_program !== filterKategori) return false;
      if (filterSifat    && p.status_program   !== filterSifat)    return false;
      return true;
    });
  }, [programs, search, filterJenis, filterKategori, filterSifat]);

  const hasFilters = !!(search || filterJenis || filterKategori || filterSifat);
  function resetAllFilters() {
    setSearch(''); setFilterJenis(''); setFilterKategori(''); setFilterSifat('');
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* ── Breadcrumb + Year Filter (selaras Modul 2) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-700 transition-colors group"
        >
          <Home className="w-3.5 h-3.5 group-hover:text-primary-600 transition-colors" />
          <span>Beranda</span>
          <span className="text-slate-300 mx-0.5">/</span>
          <span className="text-slate-700 font-semibold">Pelaksanaan Audit & Kertas Kerja</span>
        </button>
        <YearFilter value={tahun} onChange={setTahun} />
      </div>

      {/* ── Filter card (selaras Modul 2) ── */}
      <div className="filter-card">
        {/* Search input (full width) */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari judul program atau auditee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="section-label block mb-1">Jenis Program</label>
            <select value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)} className="select-input">
              <option value="">Semua Jenis</option>
              <option value="PKPT">PKPT</option>
              <option value="Non PKPT">Non PKPT</option>
            </select>
          </div>
          <div>
            <label className="section-label block mb-1">Kategori</label>
            <select value={filterKategori} onChange={(e) => setFilterKategori(e.target.value)} className="select-input">
              <option value="">Semua Kategori</option>
              {kategoriOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1">Sifat Program</label>
            <select value={filterSifat} onChange={(e) => setFilterSifat(e.target.value)} className="select-input">
              <option value="">Semua Sifat</option>
              {sifatOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Active filter chips */}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-xs text-slate-400 font-medium">Filter aktif:</span>
            {search && (
              <span className="filter-chip">
                Pencarian: "{search}"
                <button onClick={() => setSearch('')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterJenis && (
              <span className="filter-chip">
                Jenis: {filterJenis}
                <button onClick={() => setFilterJenis('')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterKategori && (
              <span className="filter-chip">
                Kategori: {filterKategori}
                <button onClick={() => setFilterKategori('')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterSifat && (
              <span className="filter-chip">
                Sifat: {filterSifat}
                <button onClick={() => setFilterSifat('')}><X className="w-3 h-3" /></button>
              </span>
            )}
            <button onClick={resetAllFilters} className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors ml-1">
              Reset semua
            </button>
          </div>
        )}
      </div>

      {/* ── List program (CARD layout — bukan tabel, supaya beda peran dengan Modul 2) ── */}
      {isLoading ? (
        <div className="card flex items-center justify-center py-20">
          <Spinner className="w-8 h-8" />
        </div>
      ) : isError ? (
        <div className="card flex flex-col items-center justify-center py-20 text-slate-400">
          <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">Gagal memuat data. Coba refresh halaman.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="w-12 h-12 text-slate-200 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-slate-500 font-medium">
            {hasFilters
              ? 'Tidak ada program yang cocok dengan filter aktif.'
              : `Belum ada program kerja siap dilaksanakan di tahun ${tahun}.`}
          </p>
          {!hasFilters && (
            <p className="text-xs text-slate-400 mt-1">
              Pastikan program sudah dibuat di Modul 2 — Perencanaan Pengawasan Individual.
            </p>
          )}
          {hasFilters && (
            <button onClick={resetAllFilters} className="mt-3 text-xs text-primary-600 hover:underline">
              Reset semua filter
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id!)}
              className="group card p-4 sm:p-5 text-left hover:border-primary-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <FolderOpen className="w-5 h-5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm sm:text-base truncate">
                        {p.annual_plan_judul}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {p.jenis_program && (
                          <span className={`badge ${JENIS_BADGE[p.jenis_program] ?? 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                            {p.jenis_program}
                          </span>
                        )}
                        {p.kategori_program && (
                          <span className="badge bg-blue-50 text-blue-700 border border-blue-200">{p.kategori_program}</span>
                        )}
                        {p.status_program && (
                          <span className="badge bg-violet-50 text-violet-700 border border-violet-200">{p.status_program}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{fmtDate(p.tanggal_mulai)} — {fmtDate(p.tanggal_selesai)}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary-500 transition-colors flex-shrink-0" />
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
