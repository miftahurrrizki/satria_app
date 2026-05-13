/**
 * Tab 1 — Project Management (Modul 3)
 *
 * UI:
 *   - List view : 3 section (PERENCANAAN · PELAKSANAAN · PELAPORAN), klik row → edit
 *   - Gantt view: timeline custom Tailwind, JIRA-style bar (slate/primary/green/red)
 *
 * Bar color (selaras keputusan):
 *   - Belum mulai          → abu-abu (slate)
 *   - Dalam proses         → biru (primary SATRIA)
 *   - Selesai              → hijau (green)
 *   - Overdue (deadline lewat & belum selesai) → merah (red)
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  List, GanttChart, Loader2, X, Save,
  Edit2, Flag, AlertTriangle, ClipboardList, Target, CalendarClock,
  BookOpen, FileText, Lock, CheckCircle2, Hourglass, PlayCircle, Paperclip, Lightbulb,
} from 'lucide-react';

import { module3Api, penugasanApi } from '../../../services/api';
import { HierarkiM3, RincianM3, FaseItemM3, ItemStatus, KegiatanSummary } from '../../../types';
import { fmtDate, StatusBadge, STATUS_OPTIONS, getBarStyle, isOverdue } from './helpers';
import { parseLocalDate } from '../../../utils/dateUtils';

type ViewKind = 'list' | 'gantt';

// Discriminated edit target — bisa rincian (langkah pelaksanaan) atau fase_item (perencanaan/pelaporan)
type EditTarget =
  | { kind: 'rincian';   data: RincianM3 }
  | { kind: 'fase';      data: FaseItemM3 };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const MS_DAY = 86_400_000;
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const DAY_NAMES = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

function fmtNum(n: number | null | undefined) {
  if (n == null) return '—';
  return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 });
}
function indentPrefix(depth: number): string {
  if (depth <= 1) return '';
  return "'" + '-'.repeat(depth - 1) + '>';
}
function initials(nm: string) {
  return nm.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
/** Alias ke shared utility — semua date-only string diparse sebagai LOCAL midnight. */
function parseDate(s: string | null | undefined): Date | null {
  return parseLocalDate(s);
}
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_DAY);
}

const PicNameList = ({ pics }: { pics: { user_id: string; nama: string }[] }) => {
  if (!pics.length) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {pics.map((p) => (
        <span key={p.user_id} className="inline-flex items-center gap-1.5 text-xs text-slate-700 leading-tight">
          <span className="w-5 h-5 rounded-full bg-primary-500 text-white text-[8px] font-bold flex items-center justify-center shrink-0">
            {initials(p.nama)}
          </span>
          <span className="truncate">{p.nama}</span>
        </span>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Timeline badge (mirip Modul 1)
// ─────────────────────────────────────────────────────────────────────────────
type TimelineKey3 = 'not_started' | 'running' | 'overdue' | 'done';

const TIMELINE_CFG: Record<TimelineKey3, { label: string; cls: string; Icon: React.ElementType }> = {
  not_started: { label: 'Belum Mulai', cls: 'bg-slate-100 text-slate-600 border border-slate-200',  Icon: Hourglass      },
  running:     { label: 'Berjalan',    cls: 'bg-green-50 text-green-700 border border-green-200',   Icon: PlayCircle     },
  overdue:     { label: 'Overdue',     cls: 'bg-red-50 text-red-700 border border-red-200',         Icon: AlertTriangle  },
  done:        { label: 'Selesai',     cls: 'bg-blue-50 text-blue-700 border border-blue-200',      Icon: CheckCircle2   },
};

function deriveTimeline(status: ItemStatus, deadline: string | null | undefined): TimelineKey3 {
  if (status === 'selesai') return 'done';
  if (isOverdue(deadline, status)) return 'overdue';
  if (status === 'dalam_proses') return 'running';
  return 'not_started';
}

function TimelineBadge({ status, deadline }: { status: ItemStatus; deadline: string | null | undefined }) {
  const key = deriveTimeline(status, deadline);
  const { label, cls, Icon } = TIMELINE_CFG[key];
  let sub: string | null = null;
  if (key === 'overdue' && deadline) {
    const d = parseLocalDate(deadline);
    if (d) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = Math.floor((today.getTime() - d.getTime()) / MS_DAY);
      sub = `Lewat +${days} hari`;
    }
  }
  return (
    <div>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${cls}`}>
        <Icon className="w-3 h-3" />{label}
      </span>
      {sub && <p className="text-xs text-red-500 mt-0.5 whitespace-nowrap">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function Tab1ProjectMgmt({ programId }: { programId: string }) {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewKind>('list');

  // Klik nama kegiatan → buka halaman edit full-page
  const handleEdit = (t: EditTarget) => {
    const type = t.kind === 'fase' ? 'fase-item' : 'rincian';
    navigate(`/pelaksanaan/program/${programId}/kegiatan/${type}/${t.data.id}`);
  };

  const { data: hier, isLoading } = useQuery({
    queryKey: ['m3-hierarki', programId],
    queryFn: () => module3Api.getHierarki(programId).then((r) => r.data.data),
    staleTime: 5_000,
  });

  // Summary count per kegiatan (untuk badge KP / Temuan / OFI / Lampiran)
  const { data: summaryRows } = useQuery({
    queryKey: ['m3-kegiatan-summary', programId],
    queryFn: () => module3Api.getKegiatanSummary(programId).then((r) => r.data.data),
    staleTime: 10_000,
  });
  const summaryMap = useMemo(() => {
    const m = new Map<string, KegiatanSummary>();
    for (const s of summaryRows ?? []) m.set(s.kegiatan_id, s);
    return m;
  }, [summaryRows]);

  const empty = !hier || (
    (!hier.perencanaan?.length) && (!hier.pelaksanaan?.length) && (!hier.pelaporan?.length)
  );

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="card p-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat hierarki…
        </div>
      ) : empty ? (
        <div className="card p-12 text-center text-sm text-slate-400">
          Hierarki belum dibuat. Buat kegiatan/tujuan/risiko/prosedur/langkah di Modul 2.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-slate-700 text-sm">Rincian Program Audit</h3>
              <p className="text-xs text-slate-400 mt-0.5">Struktur hierarki: Perencanaan · Pelaksanaan · Pelaporan</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-0.5 inline-flex gap-0.5">
              <ViewBtn active={view === 'list'}  onClick={() => setView('list')}  icon={<List className="w-4 h-4" />}        label="List" />
              <ViewBtn active={view === 'gantt'} onClick={() => setView('gantt')} icon={<GanttChart className="w-4 h-4" />}  label="Gantt" />
            </div>
          </div>

          {view === 'list' && (
            <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-6 flex-wrap">
              <span className="section-label">Keterangan:</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-600">
                <Flag className="w-3.5 h-3.5 text-blue-500" />
                <span className="badge bg-blue-100 text-blue-700 border border-blue-200">T</span>
                Tujuan Audit
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-600">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="badge bg-red-100 text-red-700 border border-red-200">R</span>
                Risiko
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-600">
                <ClipboardList className="w-3.5 h-3.5 text-yellow-500" />
                <span className="badge bg-yellow-100 text-yellow-700 border border-yellow-300">P</span>
                Prosedur
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="w-5 h-5 rounded border border-slate-300 bg-white text-slate-500 text-[10px] font-bold flex items-center justify-center">1</span>
                Kegiatan / Langkah
              </span>
            </div>
          )}

          {view === 'list' ? (
            <ListView hier={hier!} onEdit={handleEdit} summaryMap={summaryMap} />
          ) : (
            <GanttView hier={hier!} onEdit={handleEdit} />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function ViewBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
        active ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700',
      ].join(' ')}
    >
      {icon}{label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST VIEW — 3 section + click row to edit
// ─────────────────────────────────────────────────────────────────────────────
function ListView({ hier, onEdit, summaryMap }: {
  hier: HierarkiM3;
  onEdit: (t: EditTarget) => void;
  summaryMap: Map<string, KegiatanSummary>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base min-w-[900px]">
        <thead className="table-head">
          <tr>
            <th className="px-5 py-3.5 w-24 text-center">Kode</th>
            <th className="px-5 py-3.5">Uraian Kegiatan</th>
            <th className="px-5 py-3.5 w-32">Status</th>
            <th className="px-5 py-3.5 w-28 text-right">Hari Penugasan</th>
            <th className="px-5 py-3.5 w-52">PIC</th>
            <th className="px-5 py-3.5 w-28">Deadline</th>
            <th className="px-5 py-3.5 w-36">Timeline</th>
          </tr>
        </thead>
        <tbody>
          {/* PERENCANAAN section */}
          <SectionRow icon={<BookOpen className="w-4 h-4 text-slate-500" />} title="Perencanaan" />
          {hier.perencanaan.length === 0 ? (
            <EmptySubrow text="Tidak ada kegiatan perencanaan" />
          ) : (
            hier.perencanaan.map((it, i) => (
              <FaseRow key={it.id} item={it} seq={i + 1}
                summary={summaryMap.get(it.id)}
                onClick={() => onEdit({ kind: 'fase', data: it })} />
            ))
          )}

          {/* PELAKSANAAN section */}
          <SectionRow icon={<Target className="w-4 h-4 text-slate-500" />} title="Pelaksanaan" />
          {hier.pelaksanaan.length === 0 ? (
            <EmptySubrow text="Tidak ada hierarki pelaksanaan" />
          ) : (
            <PelaksanaanRows hier={hier.pelaksanaan} onEdit={onEdit} summaryMap={summaryMap} />
          )}

          {/* PELAPORAN section */}
          <SectionRow icon={<FileText className="w-4 h-4 text-slate-500" />} title="Pelaporan" />
          {hier.pelaporan.length === 0 ? (
            <EmptySubrow text="Tidak ada kegiatan pelaporan" />
          ) : (
            hier.pelaporan.map((it, i) => (
              <FaseRow key={it.id} item={it} seq={i + 1}
                summary={summaryMap.get(it.id)}
                onClick={() => onEdit({ kind: 'fase', data: it })} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SummaryBadges({ summary, showHasilAudit }: { summary?: KegiatanSummary; showHasilAudit: boolean }) {
  if (!summary) return null;
  const items: React.ReactNode[] = [];
  if (showHasilAudit) {
    if (summary.konfirmasi_count > 0) {
      items.push(
        <span key="kp" className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1 py-0.5"
          title={`${summary.konfirmasi_count} Konfirmasi Positif`}>
          <CheckCircle2 className="w-2.5 h-2.5" /> {summary.konfirmasi_count}
        </span>,
      );
    }
    if (summary.temuan_count > 0) {
      items.push(
        <span key="t" className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded px-1 py-0.5"
          title={`${summary.temuan_count} Temuan${summary.temuan_high_count > 0 ? ` (${summary.temuan_high_count} High)` : ''}`}>
          <AlertTriangle className="w-2.5 h-2.5" /> {summary.temuan_count}
          {summary.temuan_high_count > 0 && <span className="ml-0.5 font-bold">!</span>}
        </span>,
      );
    }
    if (summary.ofi_count > 0) {
      items.push(
        <span key="o" className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5"
          title={`${summary.ofi_count} Opportunity for Improvement`}>
          <Lightbulb className="w-2.5 h-2.5" /> {summary.ofi_count}
        </span>,
      );
    }
  }
  if (items.length === 0) return null;
  return <span className="inline-flex items-center gap-1 ml-2 align-middle">{items}</span>;
}

function SectionRow({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <tr className="border-b-2 border-slate-200 bg-white">
      <td colSpan={7} className="px-5 py-3">
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="font-bold text-sm text-slate-700 uppercase tracking-wider">{title}</span>
        </div>
      </td>
    </tr>
  );
}

function EmptySubrow({ text }: { text: string }) {
  return (
    <tr className="border-b border-slate-50">
      <td colSpan={7} className="px-5 py-4 text-center text-xs italic text-slate-400">{text}</td>
    </tr>
  );
}

function FaseRow({ item, seq, onClick, summary }: { item: FaseItemM3; seq: number; onClick: () => void; summary?: KegiatanSummary }) {
  const overdue = isOverdue(item.tanggal_jatuh_tempo, item.status);
  return (
    <tr
      onClick={onClick}
      className="border-b border-slate-100 hover:bg-primary-50/40 transition-colors cursor-pointer group"
    >
      <td className="px-5 py-3.5 text-center">
        <span className="w-6 h-6 rounded border border-slate-200 bg-slate-50 text-slate-500 text-xs font-semibold flex items-center justify-center mx-auto">
          {seq}
        </span>
      </td>
      <td className="px-5 py-3.5">
        <span className="font-medium text-slate-700 block" style={{ paddingLeft: '0.5rem' }}>
          <span className="text-slate-300 font-mono mr-1">'-&gt;</span>
          {item.title}
          <SummaryBadges summary={summary} showHasilAudit={false} />
        </span>
      </td>
      <td className="px-5 py-3.5"><StatusBadge status={item.status} /></td>
      <td className="px-5 py-3.5 text-right">
        {item.est_hari != null
          ? <span className="font-medium tabular-nums text-slate-700">{fmtNum(item.est_hari)}</span>
          : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-5 py-3.5"><PicNameList pics={item.pics} /></td>
      <td className="px-5 py-3.5 text-xs">
        {item.tanggal_jatuh_tempo
          ? <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}>{fmtDate(item.tanggal_jatuh_tempo)}</span>
          : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-5 py-3.5">
        <TimelineBadge status={item.status} deadline={item.tanggal_jatuh_tempo} />
      </td>
    </tr>
  );
}

function PelaksanaanRows({ hier, onEdit, summaryMap }: {
  hier: HierarkiM3['pelaksanaan'];
  onEdit: (t: EditTarget) => void;
  summaryMap: Map<string, KegiatanSummary>;
}) {
  return (
    <>
      {hier.flatMap((t, ti) => {
        const nodes: React.ReactNode[] = [];
        nodes.push(
          <tr key={`t-${t.id}`} className="border-b border-slate-100 bg-slate-50/30">
            <td className="px-5 py-3.5 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Flag className="w-3.5 h-3.5 text-blue-500" />
                <span className="badge bg-blue-100 text-blue-700 border border-blue-200">T{ti + 1}</span>
              </div>
            </td>
            <td className="px-5 py-3.5" colSpan={6}>
              <span className="font-bold text-slate-800">{t.title}</span>
            </td>
          </tr>,
        );
        for (let ri = 0; ri < t.risiko.length; ri++) {
          const r = t.risiko[ri];
          nodes.push(
            <tr key={`r-${r.id}`} className="border-b border-slate-100">
              <td className="px-5 py-3.5 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  <span className="badge bg-red-100 text-red-700 border border-red-200">R{ri + 1}</span>
                </div>
              </td>
              <td className="px-5 py-3.5" colSpan={4}>
                <span className="font-bold text-slate-800 block" style={{ paddingLeft: '1rem' }}>
                  <span className="text-slate-300 font-mono mr-1">'--&gt;</span>{r.title}
                </span>
              </td>
              <td className="px-5 py-3.5 text-xs text-slate-600">{r.tanggal_jatuh_tempo ? fmtDate(r.tanggal_jatuh_tempo) : <span className="text-slate-300">—</span>}</td>
              <td className="px-5 py-3.5"></td>
            </tr>,
          );
          for (let pi = 0; pi < r.prosedur.length; pi++) {
            const p = r.prosedur[pi];
            nodes.push(
              <tr key={`p-${p.id}`} className="border-b border-slate-100">
                <td className="px-5 py-3.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-yellow-500" />
                    <span className="badge bg-yellow-100 text-yellow-700 border border-yellow-300">P{pi + 1}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5" colSpan={4}>
                  <span className="font-bold text-slate-800 block" style={{ paddingLeft: '2rem' }}>
                    <span className="text-slate-300 font-mono mr-1">'---&gt;</span>{p.title}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-600">{p.tanggal_jatuh_tempo ? fmtDate(p.tanggal_jatuh_tempo) : <span className="text-slate-300">—</span>}</td>
                <td className="px-5 py-3.5"></td>
              </tr>,
            );
            for (let li = 0; li < p.rincian.length; li++) {
              const langkah = p.rincian[li];
              const overdue = isOverdue(langkah.tanggal_jatuh_tempo, langkah.status);
              nodes.push(
                <tr
                  key={`l-${langkah.id}`}
                  onClick={() => onEdit({ kind: 'rincian', data: langkah })}
                  className="border-b border-slate-100 hover:bg-primary-50/40 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3.5 text-center">
                    <span className="w-6 h-6 rounded border border-slate-200 bg-slate-50 text-slate-500 text-xs font-semibold flex items-center justify-center mx-auto">
                      {li + 1}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-slate-700 block" style={{ paddingLeft: '3rem' }}>
                      <span className="text-slate-300 font-mono mr-1">'----&gt;</span>{langkah.title}
                      <SummaryBadges summary={summaryMap.get(langkah.id)} showHasilAudit={true} />
                    </span>
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={langkah.status} /></td>
                  <td className="px-5 py-3.5 text-right">
                    {langkah.est_hari != null
                      ? <span className="font-medium tabular-nums text-slate-700">{fmtNum(langkah.est_hari)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5"><PicNameList pics={langkah.pics} /></td>
                  <td className="px-5 py-3.5 text-xs">
                    {langkah.tanggal_jatuh_tempo
                      ? <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}>{fmtDate(langkah.tanggal_jatuh_tempo)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <TimelineBadge status={langkah.status} deadline={langkah.tanggal_jatuh_tempo} />
                  </td>
                </tr>,
              );
            }
          }
        }
        return nodes;
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GANTT VIEW — Custom Tailwind (3 section, JIRA bar colors)
// ─────────────────────────────────────────────────────────────────────────────
type Zoom = 'day' | 'week' | 'month';

type GanttRow =
  | { kind: 'section'; id: string; label: string; color: 'slate' }
  | { kind: 'item'; id: string; label: string; sub: string; deadline: string | null; status: ItemStatus; estHari: number | null; onEdit: () => void };

function GanttView({ hier, onEdit }: { hier: HierarkiM3; onEdit: (t: EditTarget) => void }) {
  const [zoom, setZoom] = useState<Zoom>('week');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build rows (section header + item rows) — mempertahankan urutan visual
  const rows: GanttRow[] = useMemo(() => {
    const out: GanttRow[] = [];
    if (hier.perencanaan.length || hier.pelaksanaan.length || hier.pelaporan.length) {
      // Perencanaan section
      out.push({ kind: 'section', id: 'sec-pr', label: 'Perencanaan', color: 'slate' });
      hier.perencanaan.forEach((fi, i) => out.push({
        kind: 'item', id: fi.id,
        label: fi.title, sub: `PR-${i + 1}`,
        deadline: fi.tanggal_jatuh_tempo, status: fi.status, estHari: fi.est_hari,
        onEdit: () => onEdit({ kind: 'fase', data: fi }),
      }));

      // Pelaksanaan
      out.push({ kind: 'section', id: 'sec-pl', label: 'Pelaksanaan', color: 'slate' });
      hier.pelaksanaan.forEach((t, ti) => {
        t.risiko.forEach((r, ri) => {
          r.prosedur.forEach((p, pi) => {
            p.rincian.forEach((langkah, li) => out.push({
              kind: 'item', id: langkah.id,
              label: langkah.title,
              sub: `T${ti + 1}·R${ri + 1}·P${pi + 1}·${li + 1}`,
              deadline: langkah.tanggal_jatuh_tempo, status: langkah.status, estHari: langkah.est_hari,
              onEdit: () => onEdit({ kind: 'rincian', data: langkah }),
            }));
          });
        });
      });

      // Pelaporan
      out.push({ kind: 'section', id: 'sec-pp', label: 'Pelaporan', color: 'slate' });
      hier.pelaporan.forEach((fi, i) => out.push({
        kind: 'item', id: fi.id,
        label: fi.title, sub: `PP-${i + 1}`,
        deadline: fi.tanggal_jatuh_tempo, status: fi.status, estHari: fi.est_hari,
        onEdit: () => onEdit({ kind: 'fase', data: fi }),
      }));
    }
    return out;
  }, [hier, onEdit]);

  // Date range — dari item rows yang punya deadline
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const deadlines: number[] = [];
    rows.forEach((r) => {
      if (r.kind !== 'item' || !r.deadline) return;
      const parsed = parseDate(r.deadline);
      if (!parsed) return;
      const d = startOfDay(parsed);
      const days = r.estHari ? Math.max(1, Math.round(Number(r.estHari))) : 1;
      const start = new Date(d.getTime() - (days - 1) * MS_DAY);
      deadlines.push(start.getTime(), d.getTime());
    });
    if (deadlines.length === 0) return { minDate: null, maxDate: null, totalDays: 0 };
    const mn = startOfDay(new Date(Math.min(...deadlines)));
    const mx = startOfDay(new Date(Math.max(...deadlines)));
    mn.setDate(mn.getDate() - 3);
    mx.setDate(mx.getDate() + 3);
    return { minDate: mn, maxDate: mx, totalDays: diffDays(mn, mx) + 1 };
  }, [rows]);

  // Auto scroll to today
  const dayWidth = zoom === 'day' ? 44 : zoom === 'week' ? 18 : 6;
  useEffect(() => {
    if (!scrollRef.current || !minDate) return;
    const today = startOfDay(new Date());
    const offset = diffDays(minDate, today);
    if (offset >= 0) {
      scrollRef.current.scrollLeft = Math.max(0, offset * dayWidth - 200);
    }
  }, [zoom, minDate, dayWidth]);

  if (rows.length === 0 || !minDate || !maxDate) {
    return (
      <div className="px-5 py-16 text-center">
        <CalendarClock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm text-slate-500 font-medium">Belum ada item dengan tanggal jatuh tempo</p>
        <p className="text-xs text-slate-400 mt-1">Tambahkan tanggal jatuh tempo agar muncul di Gantt.</p>
      </div>
    );
  }

  const totalWidth = totalDays * dayWidth;
  const today = startOfDay(new Date());
  const todayOffset = diffDays(minDate, today);
  const showTodayLine = todayOffset >= 0 && todayOffset <= totalDays;

  // Build header rows
  const months: { label: string; days: number }[] = [];
  const days: { date: Date; isWeekStart: boolean }[] = [];
  const cursor = new Date(minDate);
  for (let i = 0; i < totalDays; i++) {
    days.push({ date: new Date(cursor), isWeekStart: cursor.getDay() === 1 });
    const monthKey = `${cursor.getMonth()}-${cursor.getFullYear()}`;
    if (months.length === 0 || months[months.length - 1].label !== monthKey) {
      months.push({ label: monthKey, days: 1 });
    } else {
      months[months.length - 1].days += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const monthBlocks = months.map((m) => {
    const [mo, yr] = m.label.split('-').map(Number);
    return { name: `${MONTH_NAMES[mo]} ${yr}`, days: m.days };
  });

  return (
    <div className="bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 bg-slate-50 flex-wrap gap-2">
        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-slate-300 border border-slate-400" /> Belum Mulai
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-primary-500 border border-primary-600" /> Dalam Proses
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-green-500 border border-green-600" /> Selesai
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-500 border border-red-600" /> Lewat Deadline
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-0.5 h-3 bg-rose-500 rounded" /> Hari Ini
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!scrollRef.current) return;
              const off = diffDays(minDate, today);
              scrollRef.current.scrollTo({ left: Math.max(0, off * dayWidth - 200), behavior: 'smooth' });
            }}
            className="btn-secondary text-xs px-2 py-1 inline-flex items-center gap-1.5"
          >
            <CalendarClock className="w-3.5 h-3.5" /> Hari Ini
          </button>
          <div className="bg-white border border-slate-200 rounded-lg p-0.5 inline-flex gap-0.5">
            {(['day','week','month'] as Zoom[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={['px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  zoom === z ? 'bg-primary-50 text-primary-700' : 'text-slate-500 hover:bg-slate-50'].join(' ')}
              >
                {z === 'day' ? 'Hari' : z === 'week' ? 'Minggu' : 'Bulan'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gantt body */}
      <div className="flex">
        {/* LEFT */}
        <div className="border-r border-slate-200 bg-slate-50/40 flex-shrink-0" style={{ width: 320 }}>
          <div className="h-[60px] border-b border-slate-200 px-4 flex items-center bg-slate-50">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Item</span>
          </div>
          {rows.map((r) =>
            r.kind === 'section' ? (
              <div key={r.id} className="h-9 px-4 flex items-center bg-slate-100 border-b-2 border-slate-200">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{r.label}</span>
              </div>
            ) : (
              <div
                key={r.id}
                className="h-10 px-4 flex items-center border-b border-slate-100 hover:bg-white cursor-pointer transition-colors"
                onClick={r.onEdit}
                title={r.label}
              >
                <div className="flex items-center gap-2 min-w-0 w-full">
                  <span className="text-xs text-slate-700 truncate flex-1">{r.label}</span>
                  <span className={`shrink-0 w-2 h-2 rounded-full ${getBarStyle(r.status, r.deadline).dot}`} />
                </div>
              </div>
            ),
          )}
        </div>

        {/* RIGHT — timeline */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto relative" style={{ scrollBehavior: 'smooth' }}>
          <div style={{ width: totalWidth }}>
            {/* Month row */}
            <div className="h-[30px] border-b border-slate-200 flex bg-slate-50/80 sticky top-0 z-10">
              {monthBlocks.map((m, i) => (
                <div
                  key={i}
                  style={{ width: m.days * dayWidth }}
                  className="border-r border-slate-200 flex items-center px-2 text-xs font-bold text-slate-700"
                >
                  {m.name}
                </div>
              ))}
            </div>
            {/* Day row */}
            <div className="h-[30px] border-b border-slate-200 flex bg-white">
              {days.map((d, i) => {
                const isWeekend = d.date.getDay() === 0 || d.date.getDay() === 6;
                if (zoom === 'day') {
                  return (
                    <div key={i} style={{ width: dayWidth }}
                      className={['border-r border-slate-100 flex flex-col items-center justify-center text-[10px]',
                        isWeekend ? 'bg-rose-50/40 text-rose-400' : 'text-slate-500'].join(' ')}>
                      <span className="font-bold leading-none">{d.date.getDate()}</span>
                      <span className="text-[8px] leading-none mt-0.5">{DAY_NAMES[d.date.getDay()]}</span>
                    </div>
                  );
                } else if (zoom === 'week') {
                  return (
                    <div key={i} style={{ width: dayWidth }}
                      className={['border-r border-slate-100 flex items-center justify-center text-[10px]',
                        isWeekend ? 'bg-rose-50/40' : ''].join(' ')}>
                      {(d.isWeekStart || i === 0) && <span className="font-semibold text-slate-500">{d.date.getDate()}</span>}
                    </div>
                  );
                }
                return <div key={i} style={{ width: dayWidth }} className={`border-r border-slate-100 ${isWeekend ? 'bg-rose-50/30' : ''}`} />;
              })}
            </div>

            {/* Body */}
            <div className="relative">
              {showTodayLine && (
                <div className="absolute top-0 bottom-0 w-px bg-rose-500 z-20 pointer-events-none"
                  style={{ left: todayOffset * dayWidth + dayWidth / 2 }}>
                  <div className="absolute -top-2 -left-1.5 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white" />
                </div>
              )}
              {rows.map((r) => {
                if (r.kind === 'section') {
                  return <div key={r.id} className="h-9 border-b-2 border-slate-200 bg-slate-100" />;
                }
                if (!r.deadline) {
                  return <div key={r.id} className="h-10 border-b border-slate-100" />;
                }
                const deadlineDate = startOfDay(parseDate(r.deadline)!);
                const days = r.estHari ? Math.max(1, Math.round(Number(r.estHari))) : 1;
                const start = new Date(deadlineDate.getTime() - (days - 1) * MS_DAY);
                const offset = diffDays(minDate, start);
                const length = diffDays(start, deadlineDate) + 1;
                const left = offset * dayWidth;
                const width = Math.max(dayWidth - 2, length * dayWidth - 2);
                const sty = getBarStyle(r.status, r.deadline);
                const progress = r.status === 'selesai' ? 100 : r.status === 'dalam_proses' ? 50 : 0;
                const overdue = isOverdue(r.deadline, r.status);

                return (
                  <div key={r.id} className="h-10 border-b border-slate-100 relative hover:bg-slate-50/50 transition-colors">
                    <button
                      onClick={r.onEdit}
                      title={`${r.label}\nDeadline: ${fmtDate(r.deadline)}\nStatus: ${STATUS_OPTIONS.find((s) => s.value === r.status)?.label}${overdue ? ' (LEWAT DEADLINE)' : ''}`}
                      className={[
                        'absolute top-1.5 h-7 rounded-md hover:ring-2 hover:ring-offset-1 transition-all overflow-hidden border',
                        sty.bar,
                        overdue ? 'border-red-400' : 'border-black/10',
                        overdue ? 'hover:ring-red-400' : 'hover:ring-primary-400',
                      ].join(' ')}
                      style={{ left, width }}
                    >
                      <div className={['absolute inset-y-0 left-0', sty.fill].join(' ')} style={{ width: `${progress}%` }} />
                      {width > 60 && (
                        <span className={`relative z-10 px-2 text-[10px] font-semibold truncate block leading-7 ${sty.text}`}>
                          {r.label}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDIT MODAL — handle Rincian (langkah pelaksanaan) + FaseItem (perencanaan/pelaporan)
//
// Yang bisa diedit di Modul 3: Status + PIC saja.
// Deadline / Est. Hari / Man Days sudah ditetapkan di Modul 2 → read-only.
// PIC: hanya anggota tim program (bukan semua auditor).
// ─────────────────────────────────────────────────────────────────────────────
function EditModal({ target, programId, onClose }: { target: EditTarget; programId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const isFase = target.kind === 'fase';
  const data = target.data;

  const [status, setStatus] = useState<ItemStatus>(data.status);

  const save = useMutation({
    mutationFn: async () => {
      if (target.kind === 'rincian') {
        await module3Api.updateProgress(target.data.id, { status });
      } else {
        await penugasanApi.updateFaseItem(target.data.id, { status });
      }
    },
    onSuccess: () => {
      toast.success('Tersimpan');
      qc.invalidateQueries({ queryKey: ['m3-hierarki', programId] });
      qc.invalidateQueries({ queryKey: ['m3-overview', programId] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Gagal menyimpan'),
  });

  const subtitle = isFase
    ? `${target.data.fase === 'perencanaan' ? 'Perencanaan' : 'Pelaporan'} · ${data.title}`
    : data.title;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto overflow-hidden">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary-100 text-primary-600 shrink-0">
                <Edit2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-800">{isFase ? 'Edit Kegiatan' : 'Edit Langkah'}</h2>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

            {/* Status — pill buttons */}
            <div>
              <p className="section-label mb-1.5">Status</p>
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStatus(s.value)}
                    className={[
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      status === s.value
                        ? s.cls + ' ring-2 ring-offset-1 ring-primary-300'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Info dari Modul 2 — read-only: Deadline, Est Hari, Man Days, PIC */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
              <p className="section-label mb-2.5 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Ditetapkan di Modul 2 (tidak dapat diubah)
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="section-label mb-1">Deadline (Tanggal Jatuh Tempo)</p>
                  <p className="text-sm font-medium text-slate-700">
                    {data.tanggal_jatuh_tempo ? fmtDate(data.tanggal_jatuh_tempo) : '—'}
                  </p>
                </div>
                <div>
                  <p className="section-label mb-1">Est. Hari</p>
                  <p className="text-sm font-medium text-slate-700">{data.est_hari != null ? data.est_hari : '—'}</p>
                </div>
                <div>
                  <p className="section-label mb-1">Man Days</p>
                  <p className="text-sm font-medium text-slate-700">{data.man_days != null ? data.man_days : '—'}</p>
                </div>
              </div>

              {/* PIC — read-only, ditetapkan dari Modul 2 */}
              <div className="border-t border-slate-200 mt-3 pt-3">
                <p className="section-label mb-2">PIC</p>
                {data.pics.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Belum ada PIC</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {data.pics.map((p) => (
                      <span key={p.user_id} className="inline-flex items-center gap-2 text-xs text-slate-700">
                        <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                          {initials(p.nama)}
                        </span>
                        {p.nama}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
            <button onClick={onClose} className="btn-secondary">Batal</button>
            <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
