import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { RiskData, RiskLevelKode } from '../../../types';
import { RiskLevelBadge } from './RiskTab';

const LEVEL_OPTIONS: { value: RiskLevelKode; label: string }[] = [
  { value: 'E',  label: 'E — Ekstrim' },
  { value: 'T',  label: 'T — Tinggi' },
  { value: 'MT', label: 'MT — Menengah Tinggi' },
  { value: 'M',  label: 'M — Menengah' },
  { value: 'RM', label: 'RM — Rendah Menengah' },
  { value: 'R',  label: 'R — Rendah' },
];

interface Props {
  data:          RiskData[];
  total:         number;
  page:          number;
  limit:         number;
  isLoading:     boolean;
  onPageChange:  (p: number) => void;
  onSearch:      (q: string) => void;
  onFilterDept:  (d: string) => void;
  onFilterLevel: (l: string) => void;
  selectedIds:   string[];
  onToggleSelect:(id: string) => void;
  onSelectAll:   () => void;
}

export default function RiskPreviewTable({
  data, total, page, limit, isLoading,
  onPageChange, onSearch, onFilterDept, onFilterLevel,
  selectedIds, onToggleSelect, onSelectAll,
}: Props) {
  const [search, setSearch] = useState('');
  const [level,  setLevel]  = useState('');
  const totalPages = Math.ceil(total / limit);

  function handleSearch(v: string) { setSearch(v); onSearch(v); }
  function handleLevel(v: string)  { setLevel(v);  onFilterLevel(v); }

  // Unique direktorats from current page for filter
  const direktoratOptions = [...new Set(data.map((r) => r.direktorat).filter(Boolean))];

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Cari risiko..."
            className="input pl-9 text-sm"
          />
        </div>
        <select
          value=""
          onChange={(e) => { onFilterDept(e.target.value); }}
          className="input w-44 text-sm"
        >
          <option value="">Semua Direktorat</option>
          {direktoratOptions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={level}
          onChange={(e) => handleLevel(e.target.value)}
          className="input w-44 text-sm"
        >
          <option value="">Semua Level</option>
          {LEVEL_OPTIONS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-slate-700 text-sm">Data Risiko RCSA</h3>
          <div className="flex items-center gap-3">
            {selectedIds.length > 0 && (
              <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-full">
                {selectedIds.length} risiko dipilih
              </span>
            )}
            <span className="text-xs text-slate-400">
              {total > 0
                ? `${Math.min((page - 1) * limit + 1, total)}–${Math.min(page * limit, total)} dari ${total}`
                : 'Tidak ada data'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={data.length > 0 && data.every((r) => selectedIds.includes(r.id))}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          data.some((r) => selectedIds.includes(r.id)) &&
                          !data.every((r) => selectedIds.includes(r.id));
                    }}
                    onChange={onSelectAll}
                    className="rounded"
                    title="Pilih semua di halaman ini"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs">ID Risiko</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs">Direktorat / Divisi</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs">Nama Risiko</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs">Level Inherent</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="h-3 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">
                    Belum ada data risiko tersedia.
                  </td>
                </tr>
              ) : (
                data.map((risk) => (
                  <tr
                    key={risk.id}
                    className={`border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${
                      selectedIds.includes(risk.id) ? 'bg-primary-50/40' : ''
                    }`}
                    onClick={() => onToggleSelect(risk.id)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(risk.id)}
                        onChange={() => onToggleSelect(risk.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-primary-600 whitespace-nowrap">
                      {risk.id_risiko || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      <p className="font-medium">{risk.direktorat}</p>
                      {risk.divisi && <p className="text-slate-400">{risk.divisi}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs">
                      <span className="line-clamp-2 text-xs">{risk.nama_risiko}</span>
                    </td>
                    <td className="px-4 py-3">
                      <RiskLevelBadge
                        level={risk.level_inherent}
                        label={risk.label_inherent}
                        bg={risk.bg_inherent}
                        text={risk.text_inherent}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 flex items-center justify-between border-t border-slate-50">
          <span className="text-xs text-slate-400">
            {total > 0
              ? `Menampilkan ${Math.min((page - 1) * limit + 1, total)}–${Math.min(page * limit, total)} dari ${total} risiko`
              : 'Tidak ada data'}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
              <button
                key={i + 1}
                onClick={() => onPageChange(i + 1)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  page === i + 1 ? 'bg-primary-500 text-white' : 'btn-secondary'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
