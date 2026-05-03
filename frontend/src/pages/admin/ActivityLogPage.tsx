import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield, Search, RefreshCw, Activity, Clock,
  ChevronLeft, ChevronRight, Info, LogIn, Key,
  UserPlus, UserMinus, Edit2, Trash2, Layers, ToggleRight,
  FileUp, Download, CheckCircle, X, TrendingUp, Users,
} from 'lucide-react';
import api from '../../services/api';
import { ROLE_LABELS } from '../../types';

// ── Types ─────────────────────────────────────────────────────
interface LogEntry {
  id: number;
  action: string;
  modul: string;
  entity_id: string | null;
  entity_type: string | null;
  ip_address: string | null;
  created_at: string;
  user_id: string;
  user_nama: string;
  user_role: string;
  user_nik: string;
}

interface LogMeta {
  total: number; page: number; limit: number; totalPages: number;
  moduls: string[]; actions: string[]; action_labels: Record<string, string>;
}

interface SummaryData {
  total_24h: number;
  by_modul_30d: { modul: string; count: number }[];
  by_action_7d: { action: string; label: string; count: number }[];
}

// ── Action icons & colors ─────────────────────────────────────
const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  LOGIN:                { icon: LogIn,       color: 'text-green-700',   bg: 'bg-green-100'   },
  LOGOUT:               { icon: LogIn,       color: 'text-slate-600',   bg: 'bg-slate-100'   },
  CHANGE_PASSWORD:      { icon: Key,         color: 'text-amber-700',   bg: 'bg-amber-100'   },
  RESET_PASSWORD:       { icon: Key,         color: 'text-orange-700',  bg: 'bg-orange-100'  },
  UPDATE_USER_RESET_PW: { icon: Key,         color: 'text-orange-700',  bg: 'bg-orange-100'  },
  CREATE_USER:          { icon: UserPlus,    color: 'text-blue-700',    bg: 'bg-blue-100'    },
  UPDATE_USER:          { icon: Edit2,       color: 'text-indigo-700',  bg: 'bg-indigo-100'  },
  UPDATE_MODULE_ACCESS: { icon: Layers,      color: 'text-violet-700',  bg: 'bg-violet-100'  },
  SET_PASSWORD:         { icon: Key,         color: 'text-amber-700',   bg: 'bg-amber-100'   },
  ACTIVATE_USER:        { icon: ToggleRight, color: 'text-green-700',   bg: 'bg-green-100'   },
  DEACTIVATE_USER:      { icon: UserMinus,   color: 'text-red-700',     bg: 'bg-red-100'     },
  DELETE_USER:          { icon: Trash2,      color: 'text-red-700',     bg: 'bg-red-100'     },
  CREATE_RISK:          { icon: UserPlus,    color: 'text-teal-700',    bg: 'bg-teal-100'    },
  UPDATE_RISK:          { icon: Edit2,       color: 'text-teal-700',    bg: 'bg-teal-100'    },
  DELETE_RISK:          { icon: Trash2,      color: 'text-red-700',     bg: 'bg-red-100'     },
  IMPORT_RISK_TRUST:    { icon: Download,    color: 'text-cyan-700',    bg: 'bg-cyan-100'    },
  IMPORT_RISK_FILE:     { icon: FileUp,      color: 'text-cyan-700',    bg: 'bg-cyan-100'    },
  CREATE_PLAN:          { icon: UserPlus,    color: 'text-primary-700', bg: 'bg-primary-100' },
  UPDATE_PLAN:          { icon: Edit2,       color: 'text-primary-700', bg: 'bg-primary-100' },
  DELETE_PLAN:          { icon: Trash2,      color: 'text-red-700',     bg: 'bg-red-100'     },
  FINALIZE_PLAN:        { icon: CheckCircle, color: 'text-green-700',   bg: 'bg-green-100'   },
};

const MODUL_LABELS: Record<string, string> = {
  auth:            'Autentikasi',
  user_management: 'Manajemen User',
  pkpt:            'PKPT',
  risk:            'Data Risiko',
  penugasan:       'Penugasan',
  audit:           'Audit / KKA',
  pelaporan:       'Pelaporan',
};

const MODUL_COLORS: Record<string, string> = {
  auth:            'bg-green-50 text-green-700',
  user_management: 'bg-blue-50 text-blue-700',
  pkpt:            'bg-primary-50 text-primary-700',
  risk:            'bg-teal-50 text-teal-700',
  penugasan:       'bg-violet-50 text-violet-700',
  audit:           'bg-amber-50 text-amber-700',
  pelaporan:       'bg-rose-50 text-rose-700',
};

const ROLE_COLORS: Record<string, string> = {
  it_admin:          'bg-purple-100 text-purple-700',
  admin_spi:         'bg-blue-100 text-blue-700',
  kepala_spi:        'bg-indigo-100 text-indigo-700',
  pengendali_teknis: 'bg-teal-100 text-teal-700',
  anggota_tim:       'bg-green-100 text-green-700',
  auditee:           'bg-orange-100 text-orange-700',
};

function ActionBadge({ action, label }: { action: string; label: string }) {
  const cfg = ACTION_CONFIG[action] ?? { icon: Info, color: 'text-slate-600', bg: 'bg-slate-100' };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3 flex-shrink-0" />
      {label}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function timeAgo(dateStr: string) {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}d lalu`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m lalu`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}j lalu`;
  return `${Math.floor(secs / 86400)}h lalu`;
}

// ── Main Page ─────────────────────────────────────────────────
export default function ActivityLogPage() {
  const [search,   setSearch]   = useState('');
  const [modul,    setModul]    = useState('');
  const [action,   setAction]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [page,     setPage]     = useState(1);

  const { data: logData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['activity-log', search, modul, action, dateFrom, dateTo, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 10 };
      if (search)   params.search    = search;
      if (modul)    params.modul     = modul;
      if (action)   params.action    = action;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const res = await api.get('/activity-log', { params });
      return res.data as { success: boolean; data: LogEntry[]; meta: LogMeta };
    },
    staleTime: 30_000,
  });

  const { data: summary } = useQuery({
    queryKey: ['activity-log-summary'],
    queryFn: async () => {
      const res = await api.get('/activity-log/summary');
      return res.data.data as SummaryData;
    },
    staleTime: 60_000,
  });

  const logs: LogEntry[]         = logData?.data ?? [];
  const meta: LogMeta | undefined = logData?.meta;
  const actionLabels              = meta?.action_labels ?? {};
  const hasFilters                = !!(search || modul || action || dateFrom || dateTo);

  function handleReset() {
    setSearch(''); setModul(''); setAction('');
    setDateFrom(''); setDateTo(''); setPage(1);
  }

  // Build pagination buttons
  function paginationPages(current: number, total: number): number[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [1];
    const start = Math.max(2, current - 1);
    const end   = Math.min(total - 1, current + 1);
    if (start > 2) pages.push(-1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push(-1);
    pages.push(total);
    return pages;
  }

  return (
    <div className="space-y-5">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Log Aktivitas Sistem</h1>
            <p className="text-sm text-slate-500">Riwayat seluruh aktivitas pengguna dalam sistem</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="p-2 rounded-lg flex-shrink-0 bg-primary-50 text-primary-600">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-slate-900">{summary?.total_24h ?? 0}</p>
            <p className="text-xs font-bold mt-1 text-primary-700">Aktivitas 24 Jam</p>
          </div>
        </div>
        {(summary?.by_modul_30d ?? []).slice(0, 3).map((m) => (
          <div key={m.modul} className="stat-card">
            <div className="p-2 rounded-lg flex-shrink-0 bg-slate-100 text-slate-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none text-slate-900">{m.count}</p>
              <p className="text-xs font-bold mt-1 text-slate-600">{MODUL_LABELS[m.modul] ?? m.modul}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">30 hari terakhir</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Top actions — 7 hari ── */}
      {(summary?.by_action_7d ?? []).length > 0 && (
        <div className="card p-4">
          <p className="section-label mb-3">Aksi Terbanyak — 7 Hari Terakhir</p>
          <div className="flex flex-wrap gap-2">
            {(summary?.by_action_7d ?? []).map((a) => (
              <div key={a.action} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                <ActionBadge action={a.action} label={a.label} />
                <span className="text-sm font-bold text-slate-600">{a.count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter card ── */}
      <div className="filter-card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="flex flex-col gap-1.5 lg:col-span-1">
            <label className="section-label">Pencarian</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari nama user, aksi..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="input pl-9"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="section-label">Modul</label>
            <select value={modul} onChange={(e) => { setModul(e.target.value); setPage(1); }} className="select-input">
              <option value="">Semua Modul</option>
              {(meta?.moduls ?? []).map((m) => (
                <option key={m} value={m}>{MODUL_LABELS[m] ?? m}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="section-label">Aksi</label>
            <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="select-input">
              <option value="">Semua Aksi</option>
              {(meta?.actions ?? []).map((a) => (
                <option key={a} value={a}>{actionLabels[a] ?? a}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="section-label">Dari</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="input"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="section-label">Sampai</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="input"
            />
          </div>
        </div>

        {hasFilters && (
          <div className="flex items-center gap-2 pt-1">
            {search && <span className="filter-chip bg-primary-50 text-primary-700 border-primary-200">{search} <button onClick={() => { setSearch(''); setPage(1); }} className="ml-0.5 hover:text-primary-900"><X className="w-3 h-3" /></button></span>}
            {modul && <span className="filter-chip bg-primary-50 text-primary-700 border-primary-200">{MODUL_LABELS[modul] ?? modul} <button onClick={() => { setModul(''); setPage(1); }} className="ml-0.5 hover:text-primary-900"><X className="w-3 h-3" /></button></span>}
            {action && <span className="filter-chip bg-primary-50 text-primary-700 border-primary-200">{actionLabels[action] ?? action} <button onClick={() => { setAction(''); setPage(1); }} className="ml-0.5 hover:text-primary-900"><X className="w-3 h-3" /></button></span>}
            {(dateFrom || dateTo) && <span className="filter-chip bg-primary-50 text-primary-700 border-primary-200">{dateFrom || '…'} — {dateTo || '…'} <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }} className="ml-0.5 hover:text-primary-900"><X className="w-3 h-3" /></button></span>}
            <button onClick={handleReset} className="btn-secondary">
              <X className="w-3.5 h-3.5" /> Reset Semua
            </button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="card overflow-hidden">
        {/* Table toolbar */}
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">
              {meta ? (
                <>
                  <span className="text-primary-700">{meta.total.toLocaleString('id-ID')}</span>
                  <span className="text-slate-400 font-normal"> entri log</span>
                </>
              ) : 'Log Aktivitas'}
            </span>
            {hasFilters && (
              <span className="badge bg-amber-50 text-amber-700">Filter aktif</span>
            )}
          </div>
          {meta && meta.totalPages > 1 && (
            <p className="text-xs text-slate-400">
              Hal. {meta.page} / {meta.totalPages}
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="table-base min-w-[800px]">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3 text-left w-8">#</th>
                <th className="px-4 py-3 text-left">Aksi</th>
                <th className="px-4 py-3 text-left">Modul</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">IP Address</th>
                <th className="px-4 py-3 text-right">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: j === 0 ? '24px' : j === 6 ? '80px' : '100%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              )}

              {!isLoading && logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Activity className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                    <p className="text-sm text-slate-400">Tidak ada aktivitas ditemukan</p>
                    {hasFilters && (
                      <button onClick={handleReset} className="mt-2 text-xs text-primary-600 hover:underline">
                        Hapus filter
                      </button>
                    )}
                  </td>
                </tr>
              )}

              {!isLoading && logs.map((log, idx) => {
                const label    = actionLabels[log.action] ?? log.action;
                const initials = log.user_nama.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
                const rowNum   = (page - 1) * (meta?.limit ?? 10) + idx + 1;

                return (
                  <tr key={log.id} className="hover:bg-primary-50/30 transition-colors">
                    {/* No */}
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">{rowNum}</td>

                    {/* Aksi */}
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} label={label} />
                    </td>

                    {/* Modul */}
                    <td className="px-4 py-3">
                      <span className={`badge text-[11px] ${MODUL_COLORS[log.modul] ?? 'bg-slate-50 text-slate-500'}`}>
                        {MODUL_LABELS[log.modul] ?? log.modul}
                      </span>
                    </td>

                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-primary-700">{initials}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate leading-tight">{log.user_nama}</p>
                          <p className="text-[11px] text-slate-400 font-mono leading-tight">{log.user_nik}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <span className={`badge text-[11px] ${ROLE_COLORS[log.user_role] ?? 'bg-slate-100 text-slate-500'}`}>
                        {ROLE_LABELS[log.user_role as keyof typeof ROLE_LABELS] ?? log.user_role}
                      </span>
                    </td>

                    {/* IP / Entity */}
                    <td className="px-4 py-3">
                      {log.ip_address ? (
                        <code className="text-xs text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                          {log.ip_address}
                        </code>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                      {log.entity_id && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{log.entity_id.slice(0, 8)}…</p>
                      )}
                    </td>

                    {/* Waktu */}
                    <td className="px-4 py-3 text-right">
                      <p className="text-xs font-medium text-slate-700 leading-tight">{formatDate(log.created_at)}</p>
                      <p className="text-[11px] text-slate-500 leading-tight">{formatTime(log.created_at)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(log.created_at)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">
              {((meta.page - 1) * meta.limit + 1).toLocaleString('id-ID')}–{Math.min(meta.page * meta.limit, meta.total).toLocaleString('id-ID')}
              {' '}dari {meta.total.toLocaleString('id-ID')} log
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {paginationPages(page, meta.totalPages).map((p, i) =>
                p === -1 ? (
                  <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-slate-400 text-xs">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === page ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Kebijakan retensi ── */}
      <div className="card p-4 flex gap-3">
        <Shield className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-0.5">Kebijakan Retensi Log</p>
          <p className="text-xs text-slate-500">
            Log aktivitas bersifat <strong>append-only</strong> dan tidak dapat dihapus untuk menjaga integritas audit trail.
            Setiap aksi penting (login, perubahan data, reset password, dll.) tercatat otomatis beserta timestamp dan IP address.
          </p>
        </div>
      </div>

    </div>
  );
}
