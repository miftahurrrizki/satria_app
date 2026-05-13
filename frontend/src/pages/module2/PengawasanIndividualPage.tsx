/**
 * Module 2 — Perencanaan Pengawasan Individual
 * Redesigned: unified hierarchical table (matching Module 1 UI style)
 *
 * Tampilan tabel mengikuti referensi Excel:
 *   '-> Perencanaan (section)
 *     '--> Pembuatan Surat Tugas (kegiatan)
 *   '-> Pelaksanaan (section)
 *     '--> Tujuan (T1)
 *     '---> Risiko (R1)
 *     '----> Prosedur (P1)
 *     '-----> Langkah (rincian)
 *   '-> Pelaporan (section)
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Calendar, ChevronDown, ChevronRight, Plus, Edit2, Trash2,
  AlertTriangle, ClipboardList, Target, Users, Clock, TrendingUp, ArrowLeft,
  X, Check, Loader2, Search, FileText, BookOpen, Info, Flag, Home, Save,
} from 'lucide-react';

import { penugasanApi, annualPlansApi, settingsApi } from '../../services/api';
import {
  AuditProgram, ProgramDetail, FaseItem, Tujuan, Risiko, Prosedur, Rincian,
  ItemStatus, PicUser, AnnualAuditPlan,
} from '../../types';
import { parseLocalDate, toInputDate } from '../../utils/dateUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i);


const ITEM_STATUS_OPTIONS: { value: ItemStatus; label: string; cls: string; dot: string }[] = [
  { value: 'tidak_dimulai', label: 'Belum Mulai',  cls: 'bg-slate-100 text-slate-600 border border-slate-200',  dot: 'bg-slate-400' },
  { value: 'dalam_proses',  label: 'Dalam Proses', cls: 'bg-amber-50 text-amber-700 border border-amber-200',   dot: 'bg-amber-400' },
  { value: 'selesai',       label: 'Selesai',      cls: 'bg-green-50 text-green-700 border border-green-200',   dot: 'bg-green-500' },
];

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 });
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const parsed = parseLocalDate(d);
  if (!parsed || Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function sumField<T>(arr: T[], field: keyof T): number {
  return arr.reduce((acc, item) => acc + (Number(item[field]) || 0), 0);
}
function countAuditees(auditee: string | null | undefined): number {
  if (!auditee?.trim()) return 0;
  let total = 0;
  for (const group of auditee.split('; ')) {
    const colonIdx = group.indexOf(': ');
    if (colonIdx === -1) { total += 1; }
    else {
      const deptPart = group.slice(colonIdx + 2).trim();
      if (deptPart) total += deptPart.split(', ').length;
    }
  }
  return total;
}

function uniquePics(pics: PicUser[][]) {
  const ids = new Set<string>();
  pics.flat().forEach((p) => ids.add(p.user_id));
  return ids.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared small components (match Module 1 style)
// ─────────────────────────────────────────────────────────────────────────────

const Spinner: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <Loader2 className={`animate-spin text-primary-500 ${className}`} />
);

// Show full PIC names as name-pills
const PicNameList: React.FC<{ pics: PicUser[] }> = ({ pics }) => {
  if (!pics.length) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {pics.map((p) => (
        <span key={p.user_id}
          className="inline-flex items-center gap-1.5 text-xs text-slate-700 leading-tight">
          <span className="w-5 h-5 rounded-full bg-primary-500 text-white text-[8px] font-bold flex items-center justify-center shrink-0">
            {initials(p.nama_lengkap)}
          </span>
          {p.nama_lengkap}
        </span>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PicCheckboxDropdown — multi-select PIC dengan style Module 1
// ─────────────────────────────────────────────────────────────────────────────

const PicCheckboxDropdown: React.FC<{ teamPics: PicUser[]; value: string[]; onChange: (v: string[]) => void }> = ({ teamPics, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const label = value.length === 0 ? 'Pilih PIC' : `${value.length} PIC dipilih`;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="select-input flex items-center gap-2 text-left w-full">
        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 right-0 min-w-[14rem] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {teamPics.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-400 text-center">Tidak ada anggota tim</div>
          ) : (
            <div className="max-h-56 overflow-y-auto py-1">
              {teamPics.map((p) => (
                <label key={p.user_id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={value.includes(p.user_id)} onChange={() => toggle(p.user_id)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-400" />
                  <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                    {initials(p.nama_lengkap)}
                  </div>
                  <span className="text-xs text-slate-700 truncate">{p.nama_lengkap}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// YearFilter — match Module 1 style
// ─────────────────────────────────────────────────────────────────────────────

const YearFilter: React.FC<{ value: number; onChange: (y: number) => void }> = ({ value, onChange }) => (
  <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400 transition-all">
    <div className="flex items-center gap-1.5 pl-3 pr-2 py-2 bg-slate-50 border-r border-slate-200">
      <Calendar className="w-4 h-4 text-slate-500" />
      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider hidden sm:block">Tahun</span>
    </div>
    <div className="relative">
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="appearance-none bg-transparent text-slate-800 text-sm font-bold pl-3 pr-8 py-2 focus:outline-none cursor-pointer hover:bg-slate-50 transition-colors">
        {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <ChevronRight className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Generic Modal Wrapper (match Module 1 style)
// ─────────────────────────────────────────────────────────────────────────────

const ModalShell: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  iconColor?: string;
  Icon?: React.ElementType;
  maxWidth?: string;
}> = ({ title, subtitle, onClose, children, footer, iconColor = 'bg-primary-100 text-primary-600', Icon = Plus, maxWidth = 'max-w-lg' }) => (
  <>
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${maxWidth} pointer-events-auto overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconColor}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">{title}</h2>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          {footer}
        </div>
      </div>
    </div>
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation Modal
// ─────────────────────────────────────────────────────────────────────────────

const ConfirmModal: React.FC<{
  title: string;
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  confirmLabel?: string;
}> = ({ title, message, onConfirm, onCancel, loading, confirmLabel = 'Ya, Hapus' }) => (
  <>
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm" onClick={() => !loading && onCancel()} />
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full pointer-events-auto space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-bold text-slate-800">{title}</p>
            <p className="text-sm text-slate-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading} className="btn-secondary flex-1 justify-center">Batal</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// Create Program Modal — dipertahankan untuk integrasi programatik dari Modul 1
// ─────────────────────────────────────────────────────────────────────────────

const CreateProgramModal: React.FC<{
  tahun: number; existingPlanIds: string[];
  onClose: () => void; onCreated: (id: string) => void;
}> = ({ tahun, existingPlanIds, onClose, onCreated }) => {
  const qc = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [derivedAuditee, setDerivedAuditee] = useState<string | null>(null);

  const { data: plansRes, isLoading } = useQuery({
    queryKey: ['annual-plans', tahun],
    queryFn: () => annualPlansApi.getAll({ tahun_perencanaan: tahun, limit: 200 }),
  });

  const availablePlans: AnnualAuditPlan[] = useMemo(() => {
    const all: AnnualAuditPlan[] = (plansRes?.data?.data ?? []) as AnnualAuditPlan[];
    return all.filter((p) => !existingPlanIds.includes(p.id));
  }, [plansRes, existingPlanIds]);

  const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedPlanId(id);
    const plan = availablePlans.find((p) => p.id === id);
    setDerivedAuditee((plan as unknown as { auditee?: string })?.auditee ?? null);
  };

  const mutation = useMutation({
    mutationFn: () => penugasanApi.createProgram({ annual_plan_id: selectedPlanId, auditee: derivedAuditee || undefined }),
    onSuccess: (res) => {
      const id = res.data?.data?.id;
      qc.invalidateQueries({ queryKey: ['penugasan-programs'] });
      toast.success('Program berhasil dibuat.');
      if (id) onCreated(id); else onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Gagal membuat program.');
    },
  });

  return (
    <ModalShell
      title="Buat Program Baru"
      subtitle="Pilih program PKPT dari Modul 1"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={() => mutation.mutate()} disabled={!selectedPlanId || mutation.isPending} className="btn-primary">
            {mutation.isPending && <Spinner className="w-4 h-4" />}
            Buat Program
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="section-label block mb-1.5">
            Program PKPT <span className="text-red-500">*</span>
          </label>
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm"><Spinner className="w-4 h-4" /> Memuat...</div>
          ) : (
            <select value={selectedPlanId} onChange={handlePlanChange} className="select-input">
              <option value="">— Pilih program PKPT —</option>
              {availablePlans.map((p) => <option key={p.id} value={p.id}>{p.judul_program}</option>)}
            </select>
          )}
          {!isLoading && availablePlans.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">Semua program PKPT tahun {tahun} sudah memiliki program individual.</p>
          )}
        </div>

        {selectedPlanId && (
          <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-slate-600">Auditee (dari Modul 1)</p>
              <p className="text-sm text-slate-800 mt-0.5">{derivedAuditee || <span className="text-slate-400 italic">Tidak ada auditee pada program ini</span>}</p>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Generic Node Edit Modal (covers fase-item / tujuan / risiko / prosedur / rincian)
// ─────────────────────────────────────────────────────────────────────────────

type NodeKind = 'fase' | 'tujuan' | 'risiko' | 'prosedur' | 'rincian';

interface NodeFormData {
  title: string;
  status?: ItemStatus;
  est_hari?: number;
  man_days?: number;
  tanggal_jatuh_tempo?: string | null;  // null = hapus tanggal (clear)
  pic_ids?: string[];
}

interface NodeInitial {
  title?: string;
  status?: ItemStatus;
  est_hari?: number | null;
  man_days?: number | null;
  tanggal_jatuh_tempo?: string | null;
  pics?: PicUser[];
}

const KIND_LABEL: Record<NodeKind, string> = {
  fase: 'Kegiatan', tujuan: 'Tujuan Audit', risiko: 'Risiko', prosedur: 'Prosedur', rincian: 'Langkah',
};

// Field visibility per node kind
const KIND_FIELDS: Record<NodeKind, { status: boolean; estMd: boolean; deadline: boolean; pic: boolean }> = {
  fase:     { status: false, estMd: true,  deadline: true,  pic: true  },
  tujuan:   { status: false, estMd: false, deadline: false, pic: false },
  risiko:   { status: false, estMd: false, deadline: true,  pic: false },
  prosedur: { status: false, estMd: false, deadline: true,  pic: false },
  rincian:  { status: false, estMd: true,  deadline: true,  pic: true  },
};

const NodeEditModal: React.FC<{
  mode: 'add' | 'edit';
  kind: NodeKind;
  initial?: NodeInitial;
  teamPics: PicUser[];
  saving: boolean;
  onSave: (data: NodeFormData) => void;
  onClose: () => void;
  /** Optional: tombol hapus muncul di footer kiri (mode edit). */
  onDelete?: () => void;
  /** Date range dari program Modul 1 — membatasi pilihan Jatuh Tempo */
  minDate?: string;
  maxDate?: string;
}> = ({ mode, kind, initial, teamPics, saving, onSave, onClose, onDelete, minDate, maxDate }) => {
  const [title, setTitle]   = useState(initial?.title ?? '');
  const [status, setStatus] = useState<ItemStatus>(initial?.status ?? 'tidak_dimulai');
  const [est, setEst]       = useState(initial?.est_hari != null ? String(initial.est_hari) : '');
  const [deadline, setDeadline] = useState(toInputDate(initial?.tanggal_jatuh_tempo));
  const [picIds, setPicIds] = useState<string[]>(initial?.pics?.map((p) => p.user_id) ?? []);

  const fields = KIND_FIELDS[kind];
  const isEdit = mode === 'edit';

  const handleSubmit = () => {
    if (!title.trim()) return;
    const payload: NodeFormData = { title: title.trim() };
    if (fields.status)   payload.status              = status;
    if (fields.estMd) {
      const estNum = est ? Number(est) : undefined;
      payload.est_hari = estNum;
      // Man-Days = Est Hari × Jumlah PIC (otomatis, konsisten dengan Modul 1)
      payload.man_days = estNum != null ? estNum * picIds.length : undefined;
    }
    if (fields.deadline) payload.tanggal_jatuh_tempo = deadline || null; // '' → null agar backend SET NULL
    if (fields.pic)      payload.pic_ids             = picIds;
    onSave(payload);
  };

  const Icon = isEdit ? Edit2 : Plus;
  const iconColor = 'bg-primary-100 text-primary-600';

  return (
    <ModalShell
      title={`${isEdit ? 'Edit' : 'Tambah'} ${KIND_LABEL[kind]}`}
      subtitle={isEdit ? 'Perbarui data di bawah ini' : 'Isi detail di bawah ini'}
      onClose={onClose}
      Icon={Icon}
      iconColor={iconColor}
      footer={
        <>
          {isEdit && onDelete && (
            <button
              onClick={onDelete}
              className="btn-danger mr-auto"
              title="Hapus data ini"
            >
              <Trash2 className="w-4 h-4" /> Hapus
            </button>
          )}
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSubmit} disabled={!title.trim() || saving} className="btn-primary">
            {saving ? <Spinner className="w-4 h-4" /> : isEdit ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isEdit ? 'Simpan Perubahan' : `Tambah ${KIND_LABEL[kind]}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Nama / Uraian */}
        <div>
          <label className="section-label block mb-1.5">
            {kind === 'rincian' ? 'Nama Langkah' : kind === 'tujuan' ? 'Tujuan Audit' : `Nama ${KIND_LABEL[kind]}`}
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Masukkan ${KIND_LABEL[kind].toLowerCase()}...`}
            className="input"
          />
        </div>

        {/* Status — pill buttons (hanya rincian) */}
        {fields.status && (
          <div>
            <label className="section-label block mb-1.5">Status</label>
            <div className="flex gap-1.5 flex-wrap">
              {ITEM_STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  className={[
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    status === o.value
                      ? o.cls + ' ring-2 ring-offset-1 ring-primary-300'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${o.dot}`} />{o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PIC */}
        {fields.pic && (
          <div>
            <label className="section-label block mb-1.5">PIC</label>
            <PicCheckboxDropdown teamPics={teamPics} value={picIds} onChange={setPicIds} />
          </div>
        )}

        {/* Deadline (Tanggal Jatuh Tempo) */}
        {fields.deadline && (
          <div>
            <label className="section-label block mb-1.5">
              Deadline (Tanggal Jatuh Tempo)
              {minDate && maxDate && (
                <span className="ml-2 normal-case font-normal text-slate-400">
                  — dalam rentang {fmtDate(minDate)} s/d {fmtDate(maxDate)}
                </span>
              )}
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              min={minDate ?? undefined}
              max={maxDate ?? undefined}
              className="input"
            />
          </div>
        )}

        {/* Est. Hari */}
        {fields.estMd && (
          <div>
            <label className="section-label block mb-1.5">Est. Hari Penugasan</label>
            <input
              type="number" min="0" step="0.5" value={est}
              onChange={(e) => setEst(e.target.value)}
              placeholder="0" className="input"
            />
            {fields.pic && est && picIds.length > 0 && (
              <p className="text-xs text-slate-400 mt-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                Man-Days otomatis:{' '}
                <span className="font-semibold text-primary-600">
                  {(Number(est) * picIds.length).toLocaleString('id-ID', { maximumFractionDigits: 1 })}
                </span>
                {' '}({picIds.length} PIC × {est} hari)
              </p>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// Hierarchy Row Builder — flatten tree into a list of table rows
// ─────────────────────────────────────────────────────────────────────────────

type RowKind = 'section' | 'item' | 'tujuan' | 'risiko' | 'prosedur' | 'rincian' | 'add';

interface BaseRow {
  rowKind: RowKind;
  depth: number;       // 0..5 — controls indent prefix
  key: string;
  title: string;
  badge?: { label: string; cls: string };  // label tag (R1, P1, T1, etc.)
}

interface SectionRow extends BaseRow { rowKind: 'section'; section: 'perencanaan' | 'pelaksanaan' | 'pelaporan' }
interface ItemRow extends BaseRow {
  rowKind: 'item' | 'rincian';
  status: ItemStatus;
  estHari: number | null;
  manDays: number | null;
  pics: PicUser[];
  deadline: string | null;
  data: FaseItem | Rincian;
  parentSection?: 'perencanaan' | 'pelaporan';
  parentProsedurId?: string;
  sequenceNum: number;  // per-section for item, per-prosedur for rincian
}
interface TujuanRow extends BaseRow {
  rowKind: 'tujuan';
  data: Tujuan;
  totalEst: number;
  totalMd: number;
  picCount: number;
}
interface RisikoRow extends BaseRow {
  rowKind: 'risiko';
  data: Risiko;
  parentTujuanId: string;
  totalEst: number;
  totalMd: number;
  deadline: string | null;
}
interface ProsedurRow extends BaseRow {
  rowKind: 'prosedur';
  data: Prosedur;
  parentRisikoId: string;
  totalEst: number;
  totalMd: number;
  deadline: string | null;
}
interface AddRow extends BaseRow {
  rowKind: 'add';
  action: { kind: NodeKind; parentId: string; section?: 'perencanaan' | 'pelaporan' };
}

type AnyRow = SectionRow | ItemRow | TujuanRow | RisikoRow | ProsedurRow | AddRow;

function buildRows(detail: ProgramDetail): AnyRow[] {
  const rows: AnyRow[] = [];
  const programId = detail.program.id!; // non-null: detail view only rendered for existing programs

  // ── Perencanaan
  rows.push({ rowKind: 'section', section: 'perencanaan', depth: 0, key: 'sec-perencanaan', title: 'Perencanaan' });
  let perCounter = 0;
  detail.perencanaan.forEach((it) => {
    perCounter++;
    rows.push({
      rowKind: 'item', depth: 1, key: `item-p-${it.id}`,
      title: it.title, status: it.status,
      estHari: it.est_hari ?? null, manDays: it.man_days ?? null,
      pics: it.pics, deadline: it.tanggal_jatuh_tempo ?? null,
      data: it, parentSection: 'perencanaan',
      sequenceNum: perCounter,
    });
  });
  rows.push({ rowKind: 'add', depth: 1, key: 'add-p', title: 'Tambah Kegiatan Perencanaan',
    action: { kind: 'fase', parentId: programId, section: 'perencanaan' } });

  // ── Pelaksanaan
  rows.push({ rowKind: 'section', section: 'pelaksanaan', depth: 0, key: 'sec-pelaksanaan', title: 'Pelaksanaan' });
  detail.pelaksanaan.forEach((t) => {
    const allTujuanRincian = t.risiko.flatMap((r) => r.prosedur.flatMap((p) => p.rincian));
    rows.push({
      rowKind: 'tujuan', depth: 1, key: `t-${t.id}`,
      title: t.title, badge: { label: t.label, cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
      data: t,
      totalEst: sumField(allTujuanRincian, 'est_hari'),
      totalMd:  sumField(allTujuanRincian, 'man_days'),
      picCount: uniquePics(allTujuanRincian.map((r) => r.pics)),
    });
    t.risiko.forEach((r) => {
      const allRisikoRincian = r.prosedur.flatMap((p) => p.rincian);
      rows.push({
        rowKind: 'risiko', depth: 2, key: `r-${r.id}`,
        title: r.title, badge: { label: r.label, cls: 'bg-red-100 text-red-700 border border-red-200' },
        data: r, parentTujuanId: t.id,
        totalEst: sumField(allRisikoRincian, 'est_hari'),
        totalMd:  sumField(allRisikoRincian, 'man_days'),
        deadline: r.tanggal_jatuh_tempo ?? null,
      });
      r.prosedur.forEach((p) => {
        rows.push({
          rowKind: 'prosedur', depth: 3, key: `p-${p.id}`,
          title: p.title, badge: { label: p.label, cls: 'bg-yellow-100 text-yellow-700 border border-yellow-300' },
          data: p, parentRisikoId: r.id,
          totalEst: sumField(p.rincian, 'est_hari'),
          totalMd:  sumField(p.rincian, 'man_days'),
          deadline: p.tanggal_jatuh_tempo ?? null,
        });
        let rinCounter = 0;
        p.rincian.forEach((rin) => {
          rinCounter++;
          rows.push({
            rowKind: 'rincian', depth: 4, key: `rin-${rin.id}`,
            title: rin.title, status: rin.status,
            estHari: rin.est_hari ?? null, manDays: rin.man_days ?? null,
            pics: rin.pics, deadline: rin.tanggal_jatuh_tempo ?? null,
            data: rin, parentProsedurId: p.id,
            sequenceNum: rinCounter,
          });
        });
        rows.push({ rowKind: 'add', depth: 4, key: `add-rin-${p.id}`,
          title: 'Tambah Langkah', action: { kind: 'rincian', parentId: p.id } });
      });
      rows.push({ rowKind: 'add', depth: 3, key: `add-p-${r.id}`,
        title: 'Tambah Prosedur', action: { kind: 'prosedur', parentId: r.id } });
    });
    rows.push({ rowKind: 'add', depth: 2, key: `add-r-${t.id}`,
      title: 'Tambah Risiko', action: { kind: 'risiko', parentId: t.id } });
  });
  rows.push({ rowKind: 'add', depth: 1, key: 'add-t',
    title: 'Tambah Tujuan Audit', action: { kind: 'tujuan', parentId: programId } });

  // ── Pelaporan
  rows.push({ rowKind: 'section', section: 'pelaporan', depth: 0, key: 'sec-pelaporan', title: 'Pelaporan' });
  let pelCounter = 0;
  detail.pelaporan.forEach((it) => {
    pelCounter++;
    rows.push({
      rowKind: 'item', depth: 1, key: `item-pl-${it.id}`,
      title: it.title, status: it.status,
      estHari: it.est_hari ?? null, manDays: it.man_days ?? null,
      pics: it.pics, deadline: it.tanggal_jatuh_tempo ?? null,
      data: it, parentSection: 'pelaporan',
      sequenceNum: pelCounter,
    });
  });
  rows.push({ rowKind: 'add', depth: 1, key: 'add-pl', title: 'Tambah Kegiatan Pelaporan',
    action: { kind: 'fase', parentId: programId, section: 'pelaporan' } });

  return rows;
}

// Indent prefix matching Excel reference: '->, '-->, '--->, etc.
function indentPrefix(depth: number): string {
  if (depth === 0) return '';
  return "'" + '-'.repeat(depth) + '> ';
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Audit Table — single table for whole program structure
// ─────────────────────────────────────────────────────────────────────────────

interface EditTarget {
  kind: NodeKind;
  id: string;
  initial: NodeInitial;
  // For update API call
  apiId: string;
}

interface DeleteTarget {
  kind: NodeKind;
  id: string;
  title: string;
}

interface AddTarget {
  kind: NodeKind;
  parentId: string;
  section?: 'perencanaan' | 'pelaporan';
}

const UnifiedAuditTable: React.FC<{
  detail: ProgramDetail;
  teamPics: PicUser[];
  onRefresh: () => void;
  /** Rentang tanggal dari program Modul 1, untuk membatasi pilihan Jatuh Tempo */
  minDate?: string;
  maxDate?: string;
}> = ({ detail, teamPics, onRefresh, minDate, maxDate }) => {
  const qc = useQueryClient();
  const [editTarget, setEditTarget]     = useState<EditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [addTarget, setAddTarget]       = useState<AddTarget | null>(null);
  const [search, setSearch]             = useState('');

  const programId = detail.program.id!; // non-null: detail view only rendered for existing programs
  const allRows = useMemo(() => buildRows(detail), [detail]);

  // Apply filter — keep section/add rows always; filter only item rows when search active
  const rows = useMemo(() => {
    if (!search) return allRows;
    return allRows.filter((r) => {
      if (r.rowKind === 'section' || r.rowKind === 'add') return true;
      if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allRows, search]);

  // ── Mutations
  const invalidate = () => qc.invalidateQueries({ queryKey: ['penugasan-detail', programId] });

  const saveSuccess = (msg: string) => () => {
    invalidate(); setEditTarget(null); setAddTarget(null); onRefresh(); toast.success(msg);
  };
  const saveError = (msg: string) => () => toast.error(msg);

  // Add mutations
  const addMut = useMutation({
    mutationFn: async (vars: { target: AddTarget; data: NodeFormData }) => {
      const { target, data } = vars;
      const { kind, parentId, section } = target;
      switch (kind) {
        case 'fase':     return penugasanApi.createFaseItem(parentId, { fase: section!, ...data });
        case 'tujuan':   return penugasanApi.createTujuan(parentId, { title: data.title });
        case 'risiko':   return penugasanApi.createRisiko(parentId, { title: data.title, tanggal_jatuh_tempo: data.tanggal_jatuh_tempo });
        case 'prosedur': return penugasanApi.createProsedur(parentId, { title: data.title, tanggal_jatuh_tempo: data.tanggal_jatuh_tempo });
        case 'rincian':  return penugasanApi.createRincian(parentId, data);
      }
    },
    onSuccess: saveSuccess('Berhasil ditambahkan.'),
    onError: saveError('Gagal menambahkan data.'),
  });

  // Edit mutation
  const updateMut = useMutation({
    mutationFn: async (vars: { target: EditTarget; data: NodeFormData }) => {
      const { target, data } = vars;
      switch (target.kind) {
        case 'fase':     return penugasanApi.updateFaseItem(target.apiId, data);
        case 'tujuan':   return penugasanApi.updateTujuan(target.apiId, { title: data.title });
        case 'risiko':   return penugasanApi.updateRisiko(target.apiId, { title: data.title, tanggal_jatuh_tempo: data.tanggal_jatuh_tempo });
        case 'prosedur': return penugasanApi.updateProsedur(target.apiId, { title: data.title, tanggal_jatuh_tempo: data.tanggal_jatuh_tempo });
        case 'rincian':  return penugasanApi.updateRincian(target.apiId, data);
      }
    },
    onSuccess: saveSuccess('Berhasil diperbarui.'),
    onError: saveError('Gagal memperbarui data.'),
  });

  // Delete mutation
  const deleteMut = useMutation({
    mutationFn: async (target: DeleteTarget) => {
      switch (target.kind) {
        case 'fase':     return penugasanApi.deleteFaseItem(target.id);
        case 'tujuan':   return penugasanApi.deleteTujuan(target.id);
        case 'risiko':   return penugasanApi.deleteRisiko(target.id);
        case 'prosedur': return penugasanApi.deleteProsedur(target.id);
        case 'rincian':  return penugasanApi.deleteRincian(target.id);
      }
    },
    onSuccess: () => { invalidate(); setDeleteTarget(null); onRefresh(); toast.success('Berhasil dihapus.'); },
    onError: () => { setDeleteTarget(null); toast.error('Gagal menghapus.'); },
  });

  // Helpers to open edit modal
  const openEdit = (kind: NodeKind, row: AnyRow) => {
    if (row.rowKind === 'item' || row.rowKind === 'rincian') {
      const r = row as ItemRow;
      setEditTarget({
        kind, id: r.key, apiId: r.data.id,
        initial: {
          title: r.title, status: r.status,
          est_hari: r.estHari, man_days: r.manDays,
          tanggal_jatuh_tempo: r.deadline, pics: r.pics,
        },
      });
    } else if (row.rowKind === 'tujuan') {
      const r = row as TujuanRow;
      setEditTarget({ kind: 'tujuan', id: r.key, apiId: r.data.id, initial: { title: r.title } });
    } else if (row.rowKind === 'risiko') {
      const r = row as RisikoRow;
      setEditTarget({ kind: 'risiko', id: r.key, apiId: r.data.id, initial: { title: r.title, tanggal_jatuh_tempo: r.deadline } });
    } else if (row.rowKind === 'prosedur') {
      const r = row as ProsedurRow;
      setEditTarget({ kind: 'prosedur', id: r.key, apiId: r.data.id, initial: { title: r.title, tanggal_jatuh_tempo: r.deadline } });
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-slate-700 text-sm">Rincian Program Audit</h3>
          <p className="text-xs text-slate-400 mt-0.5">Struktur hierarki: Perencanaan · Pelaksanaan · Pelaporan</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari kegiatan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 py-1.5 text-xs w-48"
            />
          </div>
        </div>
      </div>

      {/* ── Legend strip ── */}
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

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="table-base min-w-[900px]">
          <thead className="table-head">
            <tr>
              <th className="px-5 py-3.5 w-24 text-center">Kode</th>
              <th className="px-5 py-3.5">Uraian Kegiatan</th>
              <th className="px-5 py-3.5 w-28 text-right">Hari Penugasan</th>
              <th className="px-5 py-3.5 w-52">PIC</th>
              <th className="px-5 py-3.5 w-36">Deadline</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center">
                  <p className="text-slate-400 text-sm">Tidak ada data yang cocok dengan filter.</p>
                </td>
              </tr>
            ) : (
              rows.map((row) => {

                // ── Section row ──────────────────────────────────────────────
                if (row.rowKind === 'section') {
                  const s = row as SectionRow;
                  const Icon = s.section === 'perencanaan' ? BookOpen
                    : s.section === 'pelaksanaan' ? Target : FileText;
                  return (
                    <tr key={row.key} className="border-b-2 border-slate-200 bg-white">
                      <td colSpan={5} className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 text-slate-500" />
                          <span className="font-bold text-sm text-slate-700 uppercase tracking-wider">
                            {s.title}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                }

                // ── Add row ──────────────────────────────────────────────────
                if (row.rowKind === 'add') {
                  const a = row as AddRow;
                  return (
                    <tr key={row.key} className="border-b border-slate-50 hover:bg-primary-50/30 transition-colors">
                      <td className="px-5 py-2"></td>
                      <td colSpan={5} className="px-5 py-2">
                        <button
                          onClick={() => setAddTarget(a.action)}
                          className="inline-flex items-center gap-2 text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors"
                          style={{ paddingLeft: `${(a.depth - 1) * 1.25}rem` }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {a.title}
                        </button>
                      </td>
                    </tr>
                  );
                }

                // ── Data rows: item / rincian / tujuan / risiko / prosedur ───
                const prefix = indentPrefix(row.depth);
                const isLeaf = row.rowKind === 'item' || row.rowKind === 'rincian';
                const isStructural = row.rowKind === 'tujuan' || row.rowKind === 'risiko' || row.rowKind === 'prosedur';

                let hariCell:    React.ReactNode = <span className="text-slate-300">—</span>;
                let picCell:     React.ReactNode = <span className="text-slate-300">—</span>;
                let dlCell:      React.ReactNode = <span className="text-slate-300">—</span>;

                // Build "Kode" cell (col 1)
                let kodeCell: React.ReactNode;
                if (row.rowKind === 'tujuan') {
                  const r = row as TujuanRow;
                  kodeCell = (
                    <div className="flex items-center justify-center gap-1.5">
                      <Flag className="w-3.5 h-3.5 text-blue-500" />
                      <span className={`badge ${r.badge!.cls}`}>{r.badge!.label}</span>
                    </div>
                  );
                  hariCell = r.totalEst
                    ? <span className="text-slate-400 italic tabular-nums">{fmt(r.totalEst)}</span>
                    : hariCell;
                } else if (row.rowKind === 'risiko') {
                  const r = row as RisikoRow;
                  kodeCell = (
                    <div className="flex items-center justify-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      <span className={`badge ${r.badge!.cls}`}>{r.badge!.label}</span>
                    </div>
                  );
                  hariCell = r.totalEst
                    ? <span className="text-slate-400 italic tabular-nums">{fmt(r.totalEst)}</span>
                    : hariCell;
                  dlCell = r.deadline
                    ? <span className="text-slate-600">{fmtDate(r.deadline)}</span>
                    : dlCell;
                } else if (row.rowKind === 'prosedur') {
                  const r = row as ProsedurRow;
                  kodeCell = (
                    <div className="flex items-center justify-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-yellow-500" />
                      <span className={`badge ${r.badge!.cls}`}>{r.badge!.label}</span>
                    </div>
                  );
                  hariCell = r.totalEst
                    ? <span className="text-slate-400 italic tabular-nums">{fmt(r.totalEst)}</span>
                    : hariCell;
                  dlCell = r.deadline
                    ? <span className="text-slate-600">{fmtDate(r.deadline)}</span>
                    : dlCell;
                } else {
                  // item / rincian — show per-prosedur sequence number
                  kodeCell = (
                    <span className="w-6 h-6 rounded border border-slate-200 bg-slate-50 text-slate-500 text-xs font-semibold flex items-center justify-center mx-auto">
                      {(row as ItemRow).sequenceNum}
                    </span>
                  );
                }

                if (isLeaf) {
                  const r = row as ItemRow;
                  hariCell = r.estHari != null
                    ? <span className="font-medium tabular-nums">{fmt(r.estHari)}</span>
                    : hariCell;
                  picCell = <PicNameList pics={r.pics} />;
                  dlCell  = r.deadline
                    ? <span className="text-slate-600">{fmtDate(r.deadline)}</span>
                    : dlCell;
                }

                const titleCls = isStructural
                  ? 'font-bold text-slate-800'
                  : 'font-medium text-slate-700';

                return (
                  <tr
                    key={row.key}
                    onClick={() => openEdit(
                      row.rowKind === 'item'    ? 'fase'    :
                      row.rowKind === 'rincian' ? 'rincian' :
                      (row.rowKind as NodeKind),
                      row,
                    )}
                    className="border-b border-slate-100 hover:bg-primary-50/40 transition-colors cursor-pointer"
                    title="Klik untuk edit"
                  >
                    <td className="px-5 py-3.5 text-center">{kodeCell}</td>
                    <td className="px-5 py-3.5">
                      <span className={`${titleCls} block`} style={{ paddingLeft: `${(row.depth - 1) * 1}rem` }}>
                        <span className="text-slate-300 font-mono mr-1">{prefix}</span>
                        {row.title}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">{hariCell}</td>
                    <td className="px-5 py-3.5">{picCell}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">{dlCell}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modals ── */}
      {addTarget && (
        <NodeEditModal
          mode="add"
          kind={addTarget.kind}
          teamPics={teamPics}
          saving={addMut.isPending}
          onSave={(data) => addMut.mutate({ target: addTarget, data })}
          onClose={() => setAddTarget(null)}
          minDate={minDate}
          maxDate={maxDate}
        />
      )}

      {editTarget && (
        <NodeEditModal
          mode="edit"
          kind={editTarget.kind}
          initial={editTarget.initial}
          teamPics={teamPics}
          saving={updateMut.isPending}
          onSave={(data) => updateMut.mutate({ target: editTarget, data })}
          onClose={() => setEditTarget(null)}
          onDelete={() => {
            // Tutup modal edit, buka konfirmasi delete
            setDeleteTarget({
              kind:  editTarget.kind,
              id:    editTarget.apiId,
              title: editTarget.initial.title ?? '',
            });
            setEditTarget(null);
          }}
          minDate={minDate}
          maxDate={maxDate}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Hapus ${KIND_LABEL[deleteTarget.kind]}?`}
          message={
            <>
              <span className="font-semibold text-slate-700">"{deleteTarget.title}"</span> akan dihapus permanen
              {deleteTarget.kind !== 'fase' && deleteTarget.kind !== 'rincian' && ' beserta seluruh data turunannya'}.
            </>
          }
          loading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared constants
// ─────────────────────────────────────────────────────────────────────────────

const JENIS_BADGE: Record<string, string> = {
  'PKPT':     'bg-primary-50 text-primary-700 border border-primary-200',
  'Non PKPT': 'bg-purple-50 text-purple-700 border border-purple-200',
};

/** StatCard selaras Modul 3 — icon kiri, value besar, label berwarna, sub abu-abu */
function StatCardM2({ label, value, sub, Icon, tone }: {
  label: string;
  value: string | number;
  sub?: string;
  Icon: React.ElementType;
  tone: 'slate' | 'amber' | 'green' | 'primary' | 'blue';
}) {
  const toneClass = {
    slate:   { icon: 'bg-slate-100 text-slate-600',    label: 'text-slate-600'   },
    amber:   { icon: 'bg-amber-50 text-amber-700',     label: 'text-amber-700'   },
    green:   { icon: 'bg-green-50 text-green-700',     label: 'text-green-700'   },
    blue:    { icon: 'bg-blue-50 text-blue-700',       label: 'text-blue-700'    },
    primary: { icon: 'bg-primary-50 text-primary-700', label: 'text-primary-700' },
  }[tone];

  return (
    <div className="stat-card">
      <div className={`p-2 rounded-lg flex-shrink-0 ${toneClass.icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none text-slate-900">
          {typeof value === 'number' ? value.toLocaleString('id-ID') : value}
        </p>
        <p className={`text-xs font-bold mt-1 ${toneClass.label}`}>{label}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Program Detail View
// ─────────────────────────────────────────────────────────────────────────────

const ProgramDetailView: React.FC<{ programId: string; onBack: () => void }> = ({ programId, onBack }) => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['penugasan-detail', programId],
    queryFn: () => penugasanApi.getProgram(programId),
    select: (r) => r.data?.data,
  });
  const detail = data as ProgramDetail | undefined;

  const { data: planDetailData } = useQuery({
    queryKey: ['annual-plan-detail', detail?.program.annual_plan_id],
    queryFn: () => annualPlansApi.getById(detail!.program.annual_plan_id),
    enabled: !!detail?.program.annual_plan_id,
    select: (r) => r.data?.data,
  });

  const teamPics: PicUser[] = useMemo(() => {
    if (!planDetailData?.team) return [];
    return planDetailData.team.map((m) => ({ user_id: m.user_id, nama_lengkap: m.nama_lengkap }));
  }, [planDetailData]);

  if (isLoading) return <div className="flex items-center justify-center py-24"><Spinner className="w-8 h-8" /></div>;
  if (!detail) return (
    <div className="text-center py-16 text-slate-500">
      <p>Program tidak ditemukan.</p>
      <button onClick={onBack} className="mt-4 text-primary-600 hover:underline text-sm">Kembali</button>
    </div>
  );

  const { program, perencanaan, pelaksanaan, pelaporan } = detail;

  // ── Aggregate stats
  const allRincian: Rincian[] = pelaksanaan.flatMap((t) => t.risiko.flatMap((r) => r.prosedur.flatMap((p) => p.rincian)));
  const totalEst = sumField(perencanaan, 'est_hari') + sumField(pelaporan, 'est_hari') + sumField(allRincian, 'est_hari');
  const totalMd  = sumField(perencanaan, 'man_days') + sumField(pelaporan, 'man_days') + sumField(allRincian, 'man_days');
  const allPicArrays = [...perencanaan.map((f) => f.pics), ...pelaporan.map((f) => f.pics), ...allRincian.map((r) => r.pics)];
  const picCount = uniquePics(allPicArrays);

  return (
    <div className="space-y-4">
      {/* ── Header card — selaras Modul 3 ── */}
      <div className="card p-4 sm:p-6">
        <div className="flex items-start gap-3 mb-3">
          <button
            onClick={onBack}
            className="btn-icon hover:bg-slate-100 text-slate-500 -ml-1"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 text-base sm:text-lg leading-snug">
              {program.annual_plan_judul}
            </h2>
            {/* Meta badges: Jenis, Kategori, Sifat */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {program.jenis_program && (
                <span className={`badge ${JENIS_BADGE[program.jenis_program as keyof typeof JENIS_BADGE] ?? 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                  {program.jenis_program}
                </span>
              )}
              {program.kategori_program && (
                <span className="badge bg-blue-100 text-blue-700 border border-blue-200">
                  {program.kategori_program}
                </span>
              )}
              {program.status_program && (
                <span className="badge bg-purple-100 text-purple-700 border border-purple-200">
                  {program.status_program}
                </span>
              )}
            </div>
            {/* Date range dari Modul 1 */}
            <div className="flex flex-col gap-1 mt-2">
              {(planDetailData?.tanggal_mulai || planDetailData?.tanggal_selesai) && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {fmtDate(planDetailData?.tanggal_mulai)} — {fmtDate(planDetailData?.tanggal_selesai)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stat cards — data sama, UI style selaras Modul 3 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCardM2
          Icon={Clock}
          value={fmt(totalEst)}
          label="Total Est Hari"
          sub="hari penugasan"
          tone="slate"
        />
        <StatCardM2
          Icon={TrendingUp}
          value={fmt(totalMd)}
          label="Total Man-Days"
          sub="man-days"
          tone="primary"
        />
        <StatCardM2
          Icon={Users}
          value={picCount}
          label="Anggota Tim"
          sub="orang"
          tone="blue"
        />
      </div>

      {/* ── Unified Table ── */}
      <UnifiedAuditTable
        detail={detail}
        teamPics={teamPics}
        onRefresh={refetch}
        minDate={planDetailData?.tanggal_mulai}
        maxDate={planDetailData?.tanggal_selesai}
      />

    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

const PengawasanIndividualPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Simpan selected program di URL (?program=xxx) agar tetap setelah refresh
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('program');
  const setSelectedId = (id: string | null) => {
    if (id) setSearchParams({ program: id });
    else setSearchParams({});
  };
  const [tahun, setTahun]           = useState(new Date().getFullYear());
  const [search, setSearch]               = useState('');
  const [filterJenis, setFilterJenis]     = useState('');
  const [filterKategori, setFilterKategori] = useState('');
  const [filterSifat, setFilterSifat]     = useState('');
  const [openingId, setOpeningId]         = useState<string | null>(null);
  const [page, setPage]                   = useState(1);
  const PAGE_SIZE = 10;

  const { data: kelompokRes } = useQuery({
    queryKey: ['kelompok-penugasan'],
    queryFn: () => settingsApi.getKelompokPenugasan().then((r) => r.data.data ?? []),
    staleTime: 5 * 60_000,
  });
  const kategoriOptions = useMemo(() => (kelompokRes ?? []).filter((k) => k.tipe === 'Kategori' && k.is_active).map((k) => k.nilai), [kelompokRes]);
  const sifatOptions    = useMemo(() => (kelompokRes ?? []).filter((k) => k.tipe === 'Sifat Program' && k.is_active).map((k) => k.nilai), [kelompokRes]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['penugasan-programs', tahun],
    queryFn: () => penugasanApi.listPrograms(tahun),
    select: (r) => r.data?.data ?? [],
  });

  const programs: AuditProgram[] = (data ?? []) as AuditProgram[];

  const hasFilters = !!(search || filterJenis || filterKategori || filterSifat);
  const resetAllFilters = () => { setSearch(''); setFilterJenis(''); setFilterKategori(''); setFilterSifat(''); setPage(1); };

  const filtered = useMemo(() => {
    return programs.filter((p) => {
      if (search) {
        const s = search.toLowerCase();
        if (!p.annual_plan_judul.toLowerCase().includes(s) && !(p.auditee ?? '').toLowerCase().includes(s)) return false;
      }
      if (filterJenis    && p.jenis_program    !== filterJenis)    return false;
      if (filterKategori && p.kategori_program !== filterKategori) return false;
      if (filterSifat    && p.status_program   !== filterSifat)    return false;
      return true;
    });
  }, [programs, search, filterJenis, filterKategori, filterSifat]);

  // Pagination
  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage    = Math.min(page, totalPages);
  const pagedData   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 whenever filters / year change
  const prevFilterKey = search + filterJenis + filterKategori + filterSifat + tahun;
  const filterKeyRef  = React.useRef(prevFilterKey);
  if (filterKeyRef.current !== prevFilterKey) { filterKeyRef.current = prevFilterKey; if (page !== 1) setPage(1); }

  // Auto-buat program Modul 2 jika belum ada, lalu buka detail
  const createMut = useMutation({
    mutationFn: (annualPlanId: string) =>
      penugasanApi.createProgram({ annual_plan_id: annualPlanId }),
    onSuccess: (res) => {
      const newId = (res.data?.data as { id?: string } | undefined)?.id;
      qc.invalidateQueries({ queryKey: ['penugasan-programs', tahun] });
      if (newId) setSelectedId(newId);
      setOpeningId(null);
    },
    onError: () => {
      setOpeningId(null);
      toast.error('Gagal membuka program. Coba lagi.');
    },
  });

  const handleRowClick = (p: AuditProgram) => {
    if (p.id) {
      setSelectedId(p.id);
    } else {
      // Program Modul 2 belum dibuat → buat otomatis lalu buka
      setOpeningId(p.annual_plan_id);
      createMut.mutate(p.annual_plan_id);
    }
  };

  if (selectedId) {
    return (
      <div className="max-w-7xl mx-auto">
        <ProgramDetailView programId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ── Breadcrumb + Year Filter (satu baris) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-700 transition-colors group"
        >
          <Home className="w-3.5 h-3.5 group-hover:text-primary-600 transition-colors" />
          <span>Beranda</span>
          <span className="text-slate-300 mx-0.5">/</span>
          <span className="text-slate-700 font-semibold">Perencanaan Pengawasan Individual</span>
        </button>
        <YearFilter value={tahun} onChange={setTahun} />
      </div>

      {/* ── Filter card (Module 1 style) ── */}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
            <select value={filterKategori} onChange={(e) => { setFilterKategori(e.target.value); setPage(1); }} className="select-input">
              <option value="">Semua Kategori</option>
              {kategoriOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1">Sifat Program</label>
            <select value={filterSifat} onChange={(e) => { setFilterSifat(e.target.value); setPage(1); }} className="select-input">
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

      {/* ── Table card ── */}
      <div className="card overflow-hidden">

        {/* Loading / Error */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner className="w-8 h-8" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Gagal memuat data. Coba refresh halaman.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[1060px]">
              <thead className="table-head">
                <tr>
                  <th className="w-10 text-center">#</th>
                  <th>Program Kerja</th>
                  <th className="w-28">Jenis</th>
                  <th className="w-28">Kategori</th>
                  <th className="w-28">Sifat</th>
                  <th className="w-24 text-center">Personil</th>
                  <th className="w-36 text-right">Hari Penugasan</th>
                  <th className="w-32 text-right">Man-Days</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center">
                      <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-sm text-slate-400 font-medium">
                        {hasFilters
                          ? 'Tidak ada program yang cocok dengan filter aktif.'
                          : `Belum ada program kerja di Modul 1 untuk tahun ${tahun}.`}
                      </p>
                      {!hasFilters && (
                        <p className="text-xs text-slate-400 mt-1">
                          Tambahkan program di Modul 1 — Perencanaan Pengawasan Tahunan.
                        </p>
                      )}
                      {hasFilters && (
                        <button onClick={resetAllFilters} className="mt-3 text-xs text-primary-600 hover:underline">
                          Reset semua filter
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  pagedData.map((p, idx) => {
                    const manDays   = Number(p.total_man_days) || 0;
                    const estHari   = Number(p.total_est_hari) || 0;
                    const isOpening = openingId === p.annual_plan_id;
                    const hasProgram = !!p.id;
                    const globalIdx = (safePage - 1) * PAGE_SIZE + idx + 1;

                    return (
                      <tr
                        key={p.annual_plan_id}
                        onClick={() => !isOpening && handleRowClick(p)}
                        className={`table-row ${isOpening ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                      >
                        <td className="text-center text-slate-400 text-sm">{globalIdx}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-semibold text-slate-800 text-sm leading-snug">
                                {p.annual_plan_judul}
                              </p>
                              {!hasProgram && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Klik untuk mulai mengisi rincian
                                </p>
                              )}
                            </div>
                            {isOpening && <Spinner className="w-4 h-4 shrink-0" />}
                          </div>
                        </td>
                        <td>
                          {p.jenis_program ? (
                            <span className={`badge ${JENIS_BADGE[p.jenis_program] ?? 'bg-slate-100 text-slate-600'}`}>
                              {p.jenis_program}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        {/* Kategori */}
                        <td>
                          {p.kategori_program
                            ? <span className="badge bg-blue-50 text-blue-700 border border-blue-200">{p.kategori_program}</span>
                            : <span className="text-slate-300 text-sm">—</span>}
                        </td>
                        {/* Sifat Program */}
                        <td>
                          {p.status_program
                            ? <span className="badge bg-violet-50 text-violet-700 border border-violet-200">{p.status_program}</span>
                            : <span className="text-slate-300 text-sm">—</span>}
                        </td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-semibold text-slate-700 text-sm">
                              {p.unique_pics ?? 0}
                            </span>
                          </div>
                        </td>
                        {/* Hari Penugasan — col split 1 */}
                        <td className="text-right">
                          {hasProgram && estHari > 0 ? (
                            <span className="font-semibold text-slate-700 text-sm tabular-nums">
                              {fmt(estHari)}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        {/* Man-Days — col split 2 */}
                        <td className="text-right">
                          {hasProgram && manDays > 0 ? (
                            <span className="font-semibold text-primary-600 text-sm tabular-nums">
                              {fmt(manDays)}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination footer ── */}
        {!isLoading && !isError && filtered.length > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              Halaman {safePage} dari {totalPages}
            </span>
            <div className="flex items-center gap-1">
              {/* Prev */}
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5 rotate-90" />
              </button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => {
                  // Show first, last, current ±1, and ellipsis placeholders
                  return n === 1 || n === totalPages || Math.abs(n - safePage) <= 1;
                })
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
                        safePage === item
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PengawasanIndividualPage;
