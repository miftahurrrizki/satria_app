/**
 * Helper utilities — UI primitives & format helpers (SATRIA style).
 */
import { ItemStatus } from '../../../types';
import { parseLocalDate } from '../../../utils/dateUtils';

export const STATUS_OPTIONS: { value: ItemStatus; label: string; cls: string; dot: string }[] = [
  { value: 'tidak_dimulai', label: 'Belum Mulai',  cls: 'bg-slate-100 text-slate-600 border border-slate-200', dot: 'bg-slate-400' },
  { value: 'dalam_proses',  label: 'Dalam Proses', cls: 'bg-amber-50 text-amber-700 border border-amber-200',  dot: 'bg-amber-400' },
  { value: 'selesai',       label: 'Selesai',      cls: 'bg-green-50 text-green-700 border border-green-200',  dot: 'bg-green-500' },
];

export function StatusBadge({ status }: { status: ItemStatus }) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${opt.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
      {opt.label}
    </span>
  );
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const parsed = parseLocalDate(d);
  if (!parsed || Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtBytes(b: number): string {
  if (!Number.isFinite(b) || b < 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-slate-400';
  return (
    <div className={`w-full h-1.5 bg-slate-100 rounded-full overflow-hidden ${className}`}>
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Cek apakah deadline sudah lewat & status bukan selesai. */
export function isOverdue(deadline: string | null | undefined, status: ItemStatus): boolean {
  if (!deadline || status === 'selesai') return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = parseLocalDate(deadline);
  if (!d) return false;
  return d.getTime() < today.getTime();
}

/** Style untuk bar Gantt — palette SATRIA, gaya JIRA.
 *   - Belum mulai → slate
 *   - Dalam proses → primary (biru SATRIA)
 *   - Selesai → green
 *   - Overdue (deadline lewat & belum selesai) → red */
export function getBarStyle(status: ItemStatus, deadline: string | null | undefined): {
  bar: string; fill: string; text: string; ring: string; dot: string;
} {
  if (isOverdue(deadline, status)) {
    return { bar: 'bg-red-100',     fill: 'bg-red-500',     text: 'text-red-900',     ring: 'ring-red-300',     dot: 'bg-red-500' };
  }
  if (status === 'selesai') {
    return { bar: 'bg-green-100',   fill: 'bg-green-500',   text: 'text-green-900',   ring: 'ring-green-300',   dot: 'bg-green-500' };
  }
  if (status === 'dalam_proses') {
    return { bar: 'bg-primary-100', fill: 'bg-primary-500', text: 'text-primary-900', ring: 'ring-primary-300', dot: 'bg-primary-500' };
  }
  return   { bar: 'bg-slate-100',   fill: 'bg-slate-300',   text: 'text-slate-700',   ring: 'ring-slate-300',   dot: 'bg-slate-400' };
}

/** Cari icon emoji by mime atau extension (sederhana, tanpa lib). */
export function fileIcon(name: string, mime?: string | null): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (mime?.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf' || ext === 'pdf') return '📄';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
  if (['docx', 'doc'].includes(ext)) return '📝';
  if (['pptx', 'ppt'].includes(ext)) return '📑';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  if (['mp4', 'mov', 'mkv', 'avi'].includes(ext)) return '🎬';
  return '📎';
}
