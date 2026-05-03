/**
 * Module 2 — Perencanaan Pengawasan Individual
 * Redesigned: cleaner tree, card-based lists, PicCheckboxDropdown, legend card
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Calendar, ChevronRight, ChevronDown, ChevronUp, Plus, Edit2, Trash2,
  AlertTriangle, ClipboardList, Target, Users, Clock, TrendingUp, ArrowLeft,
  X, Check, Loader2, Info, FileText, BookOpen,
} from 'lucide-react';

import { penugasanApi, annualPlansApi } from '../../services/api';
import {
  AuditProgram, ProgramDetail, FaseItem, Tujuan, Risiko, Prosedur, Rincian,
  ItemStatus, ProgramStatus, PicUser, AnnualAuditPlan,
} from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i);

const STATUS_BADGE: Record<ProgramStatus, string> = {
  draft:   'bg-slate-100 text-slate-600',
  aktif:   'bg-blue-100 text-blue-700',
  selesai: 'bg-green-100 text-green-700',
};
const STATUS_LABEL: Record<ProgramStatus, string> = {
  draft: 'Draft', aktif: 'Aktif', selesai: 'Selesai',
};

const ITEM_STATUS_OPTIONS: { value: ItemStatus; label: string; cls: string }[] = [
  { value: 'tidak_dimulai', label: 'Belum Mulai',  cls: 'bg-slate-100 text-slate-600' },
  { value: 'dalam_proses',  label: 'Dalam Proses', cls: 'bg-amber-100 text-amber-700' },
  { value: 'selesai',       label: 'Selesai',       cls: 'bg-green-100 text-green-700' },
];

function statusCls(s: ItemStatus) { return ITEM_STATUS_OPTIONS.find((o) => o.value === s)?.cls ?? ''; }
function statusLabel(s: ItemStatus) { return ITEM_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s; }

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 });
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateShort(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}
function sumField<T>(arr: T[], field: keyof T) {
  return arr.reduce((acc, item) => acc + (Number(item[field]) || 0), 0);
}
function uniquePics(pics: PicUser[][]) {
  const ids = new Set<string>();
  pics.flat().forEach((p) => ids.add(p.user_id));
  return ids.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared small components
// ─────────────────────────────────────────────────────────────────────────────

const Spinner: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <Loader2 className={`animate-spin text-primary-500 ${className}`} />
);

const Badge: React.FC<{ className: string; label: string }> = ({ className, label }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}>{label}</span>
);

const PicAvatars: React.FC<{ pics: PicUser[]; max?: number }> = ({ pics, max = 4 }) => {
  if (!pics.length) return <span className="text-slate-400 text-xs">—</span>;
  const shown = pics.slice(0, max);
  const rest  = pics.length - max;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((p) => (
        <div key={p.user_id} title={p.nama_lengkap}
          className="w-6 h-6 rounded-full bg-primary-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
          {initials(p.nama_lengkap)}
        </div>
      ))}
      {rest > 0 && (
        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
          +{rest}
        </div>
      )}
    </div>
  );
};

const ConfirmDelete: React.FC<{ label: string; onConfirm: () => void; onCancel: () => void; loading?: boolean }> = ({ label, onConfirm, onCancel, loading }) => (
  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-sm">
    <span className="text-red-700 text-xs">Hapus {label}?</span>
    <button onClick={onConfirm} disabled={loading}
      className="px-2 py-0.5 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50">
      {loading ? '...' : 'Ya'}
    </button>
    <button onClick={onCancel} className="px-2 py-0.5 rounded bg-white border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
      Batal
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// PicCheckboxDropdown — replaces confusing multi-select
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
        className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white hover:bg-slate-50 transition-colors min-w-[110px]">
        <Users className="w-3 h-3 text-slate-400 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 w-52 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {teamPics.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-400 text-center">Tidak ada anggota tim</div>
          ) : (
            <div className="max-h-48 overflow-y-auto py-1">
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
// Year filter
// ─────────────────────────────────────────────────────────────────────────────

const YearFilter: React.FC<{ value: number; onChange: (y: number) => void }> = ({ value, onChange }) => (
  <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400 transition-all">
    <div className="flex items-center gap-1.5 pl-3 pr-2 py-2 bg-slate-50 border-r border-slate-200">
      <Calendar className="w-4 h-4 text-slate-500" />
      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider hidden sm:block">Tahun</span>
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
// Create Program Modal
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Buat Program Baru</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pilih program PKPT dari Modul 1</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Program PKPT <span className="text-red-500">*</span>
            </label>
            {isLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm"><Spinner className="w-4 h-4" /> Memuat...</div>
            ) : (
              <select value={selectedPlanId} onChange={handlePlanChange}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white">
                <option value="">— Pilih program PKPT —</option>
                {availablePlans.map((p) => <option key={p.id} value={p.id}>{p.judul_program}</option>)}
              </select>
            )}
            {!isLoading && availablePlans.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Semua program PKPT tahun {tahun} sudah memiliki program individual.</p>
            )}
          </div>

          {selectedPlanId && (
            <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-slate-600">Auditee (dari Modul 1)</p>
                <p className="text-sm text-slate-800 mt-0.5">{derivedAuditee || <span className="text-slate-400 italic">Tidak ada auditee pada program ini</span>}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Batal</button>
          <button onClick={() => mutation.mutate()} disabled={!selectedPlanId || mutation.isPending}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-2">
            {mutation.isPending && <Spinner className="w-4 h-4" />}
            Buat Program
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Program Card (list view)
// ─────────────────────────────────────────────────────────────────────────────

const ProgramCard: React.FC<{ program: AuditProgram; onClick: () => void }> = ({ program, onClick }) => {
  const progress = useMemo(() => {
    const est = Number(program.total_est_hari) || 0;
    const man = Number(program.total_man_days) || 0;
    if (est === 0) return 0;
    return Math.min(100, Math.round((man / est) * 100));
  }, [program]);

  return (
    <button onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-primary-300 transition-all p-5 group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-slate-800 text-sm leading-snug group-hover:text-primary-700 transition-colors line-clamp-2">
          {program.annual_plan_judul}
        </h3>
        <Badge className={STATUS_BADGE[program.status]} label={STATUS_LABEL[program.status]} />
      </div>
      {program.auditee && <p className="text-xs text-slate-500 mb-3 truncate">📍 {program.auditee}</p>}
      <div className="mb-3">
        <div className="flex justify-between text-[11px] text-slate-500 mb-1">
          <span>Progress Man-Days</span><span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {fmt(program.total_est_hari)} hari</span>
        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {fmt(program.total_man_days)} MD</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {program.unique_pics ?? 0} PIC</span>
      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Summary bar
// ─────────────────────────────────────────────────────────────────────────────

const SummaryBar: React.FC<{ detail: ProgramDetail }> = ({ detail }) => {
  const { perencanaan, pelaksanaan, pelaporan } = detail;
  const allRincian: Rincian[] = pelaksanaan.flatMap((t) => t.risiko.flatMap((r) => r.prosedur.flatMap((p) => p.rincian)));
  const totalEst = sumField(perencanaan, 'est_hari') + sumField(pelaporan, 'est_hari') + sumField(allRincian, 'est_hari');
  const totalMd  = sumField(perencanaan, 'man_days') + sumField(pelaporan, 'man_days') + sumField(allRincian, 'man_days');
  const allPics  = [...perencanaan.map((f) => f.pics), ...pelaporan.map((f) => f.pics), ...allRincian.map((r) => r.pics)];
  const picCount = uniquePics(allPics);
  const progress = totalEst > 0 ? Math.min(100, Math.round((totalMd / totalEst) * 100)) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 border-b border-slate-200 bg-slate-50/70">
      {[
        { icon: Clock, color: 'text-slate-500', val: `${fmt(totalEst)} hari`, label: 'Est Hari' },
        { icon: TrendingUp, color: 'text-primary-500', val: `${fmt(totalMd)} MD`, label: 'Man-Days' },
        { icon: Users, color: 'text-indigo-500', val: `${picCount} orang`, label: 'Anggota Unik' },
        { icon: null, color: '', val: `${progress}%`, label: 'Progress' },
      ].map((s, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3">
          {s.icon ? <s.icon className={`w-4 h-4 ${s.color} shrink-0`} /> : (
            <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden shrink-0">
              <div className="h-full bg-primary-500 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-slate-800">{s.val}</p>
            <p className="text-[10px] text-slate-500">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AddEditFaseModal — modal untuk tambah / edit kegiatan fase
// ─────────────────────────────────────────────────────────────────────────────

interface AddEditFaseModalProps {
  mode: 'add' | 'edit';
  faseLabel: string;
  initial?: FaseItem;
  teamPics: PicUser[];
  saving: boolean;
  onSave: (data: { title: string; status: ItemStatus; est_hari?: number; man_days?: number; tanggal_jatuh_tempo?: string; pic_ids: string[] }) => void;
  onClose: () => void;
}

const AddEditFaseModal: React.FC<AddEditFaseModalProps> = ({ mode, faseLabel, initial, teamPics, saving, onSave, onClose }) => {
  const [title,    setTitle]   = useState(initial?.title ?? '');
  const [status,   setStatus]  = useState<ItemStatus>(initial?.status ?? 'tidak_dimulai');
  const [est,      setEst]     = useState(initial?.est_hari   != null ? String(initial.est_hari)  : '');
  const [md,       setMd]      = useState(initial?.man_days   != null ? String(initial.man_days)  : '');
  const [deadline, setDeadline]= useState(initial?.tanggal_jatuh_tempo ?? '');
  const [picIds,   setPicIds]  = useState<string[]>(initial?.pics.map((p) => p.user_id) ?? []);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      status,
      est_hari:            est      ? Number(est)  : undefined,
      man_days:            md       ? Number(md)   : undefined,
      tanggal_jatuh_tempo: deadline || undefined,
      pic_ids:             picIds,
    });
  };

  const isEdit = mode === 'edit';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isEdit ? 'bg-indigo-100' : 'bg-primary-100'}`}>
              {isEdit
                ? <Edit2 className="w-4 h-4 text-indigo-600" />
                : <Plus  className="w-4 h-4 text-primary-600" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">{isEdit ? 'Edit Kegiatan' : `Tambah Kegiatan ${faseLabel}`}</h2>
              <p className="text-xs text-slate-400">Isi detail kegiatan di bawah ini</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-5 space-y-4">
          {/* Nama kegiatan — full width */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Nama Kegiatan <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Review program kerja audit, Konfirmasi jadwal..."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all"
            />
          </div>

          {/* Status & PIC — 2 kolom */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white transition-all">
                {ITEM_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">PIC (Penanggung Jawab)</label>
              <PicCheckboxDropdown teamPics={teamPics} value={picIds} onChange={setPicIds} />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* Est Hari / Man-Days / Deadline — 3 kolom */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400" /> Est Hari</span>
              </label>
              <div className="relative">
                <input type="number" min="0" step="0.5" value={est} onChange={(e) => setEst(e.target.value)}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 pr-9 transition-all" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-medium">hari</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-slate-400" /> Man-Days</span>
              </label>
              <div className="relative">
                <input type="number" min="0" step="0.5" value={md} onChange={(e) => setMd(e.target.value)}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 pr-6 transition-all" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-medium">MD</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-400" /> Deadline</span>
              </label>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition-all" />
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
            Batal
          </button>
          <button onClick={handleSubmit} disabled={!title.trim() || saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
            {saving ? <Spinner className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {isEdit ? 'Simpan Perubahan' : 'Tambah Kegiatan'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FaseItemsSection — Perencanaan & Pelaporan (redesigned)
// ─────────────────────────────────────────────────────────────────────────────

interface FaseItemsSectionProps {
  programId: string;
  fase: 'perencanaan' | 'pelaporan';
  items: FaseItem[];
  teamPics: PicUser[];
  onRefresh: () => void;
}

const STATUS_DOT: Record<ItemStatus, string> = {
  tidak_dimulai: 'bg-slate-400',
  dalam_proses:  'bg-amber-400',
  selesai:       'bg-green-500',
};

const FaseItemsSection: React.FC<FaseItemsSectionProps> = ({ programId, fase, items, teamPics, onRefresh }) => {
  const qc = useQueryClient();
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [editTarget,    setEditTarget]    = useState<FaseItem | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<FaseItem | null>(null);
  const [savingCreate,  setSavingCreate]  = useState(false);
  const [savingEditId,  setSavingEditId]  = useState<string | null>(null);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);

  const faseLabel = fase === 'perencanaan' ? 'Perencanaan' : 'Pelaporan';
  const FaseIcon  = fase === 'perencanaan' ? BookOpen : FileText;
  const accentCls = fase === 'perencanaan' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-violet-50 text-violet-700 border-violet-200';
  const iconBg    = fase === 'perencanaan' ? 'bg-emerald-100 text-emerald-600' : 'bg-violet-100 text-violet-600';

  const createMut = useMutation({
    mutationFn: (data: Parameters<typeof penugasanApi.createFaseItem>[1]) =>
      penugasanApi.createFaseItem(programId, { fase, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['penugasan-detail'] });
      setShowAddModal(false); setSavingCreate(false); onRefresh();
      toast.success('Kegiatan berhasil ditambahkan.');
    },
    onError: () => { setSavingCreate(false); toast.error('Gagal menambah kegiatan.'); },
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; data: Parameters<typeof penugasanApi.updateFaseItem>[1] }) =>
      penugasanApi.updateFaseItem(vars.id, vars.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['penugasan-detail'] });
      setEditTarget(null); setSavingEditId(null); onRefresh();
    },
    onError: () => { setSavingEditId(null); toast.error('Gagal memperbarui kegiatan.'); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => penugasanApi.deleteFaseItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['penugasan-detail'] });
      setDeleteTarget(null); setDeletingId(null); onRefresh();
      toast.success('Kegiatan dihapus.');
    },
    onError: () => { setDeletingId(null); toast.error('Gagal menghapus kegiatan.'); },
  });

  // Totals
  const totalEst = sumField(items, 'est_hari');
  const totalMd  = sumField(items, 'man_days');

  return (
    <div>
      {/* ── Section Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
            <FaseIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Kegiatan {faseLabel}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {items.length} kegiatan
              {items.length > 0 && (
                <span className="ml-2 text-slate-400">
                  · <span className="font-medium text-slate-600">{fmt(totalEst)} est hari</span>
                  · <span className="font-medium text-slate-600">{fmt(totalMd)} MD</span>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* ← Tombol tambah di ATAS */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 active:scale-95 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Tambah Kegiatan
        </button>
      </div>

      {/* ── Kolom Header ── */}
      {items.length > 0 && (
        <div className="grid grid-cols-[2rem_1fr_7rem_5rem_4rem_4rem_6rem_4rem] gap-x-3 px-5 py-2 bg-slate-50 border-b border-slate-200">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">#</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kegiatan</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PIC</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Est</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">MD</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deadline</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Aksi</span>
        </div>
      )}

      {/* ── Item Rows ── */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <FaseIcon className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm font-semibold text-slate-500">Belum ada kegiatan {faseLabel.toLowerCase()}</p>
          <p className="text-xs text-slate-400 mt-1">Klik <span className="font-semibold text-primary-600">Tambah Kegiatan</span> di atas untuk mulai.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item, idx) => (
            <div key={item.id}
              className="grid grid-cols-[2rem_1fr_7rem_5rem_4rem_4rem_6rem_4rem] gap-x-3 items-center px-5 py-3.5 hover:bg-slate-50/70 transition-colors group">

              {/* No */}
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center text-center mx-auto">
                {idx + 1}
              </span>

              {/* Title */}
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate leading-snug">{item.title}</p>
              </div>

              {/* Status */}
              <div>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold ${statusCls(item.status)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[item.status]}`} />
                  {statusLabel(item.status)}
                </span>
              </div>

              {/* PIC */}
              <div><PicAvatars pics={item.pics} max={3} /></div>

              {/* Est */}
              <p className="text-xs font-medium text-slate-600 text-right tabular-nums">
                {item.est_hari != null ? <>{fmt(item.est_hari)}<span className="text-slate-400 font-normal"> h</span></> : <span className="text-slate-300">—</span>}
              </p>

              {/* MD */}
              <p className="text-xs font-medium text-slate-600 text-right tabular-nums">
                {item.man_days != null ? fmt(item.man_days) : <span className="text-slate-300">—</span>}
              </p>

              {/* Deadline */}
              <p className="text-[11px] text-slate-500 truncate">
                {item.tanggal_jatuh_tempo
                  ? <><span className="text-slate-400">📅</span> {fmtDate(item.tanggal_jatuh_tempo)}</>
                  : <span className="text-slate-300">—</span>}
              </p>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditTarget(item)} title="Edit"
                  className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeleteTarget(item)} title="Hapus"
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Totals footer */}
          <div className="grid grid-cols-[2rem_1fr_7rem_5rem_4rem_4rem_6rem_4rem] gap-x-3 items-center px-5 py-2.5 bg-slate-50/80 border-t border-slate-200">
            <span />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total</span>
            <span />
            <span />
            <span className="text-xs font-bold text-slate-700 text-right tabular-nums">{fmt(totalEst)}<span className="text-slate-400 font-normal"> h</span></span>
            <span className="text-xs font-bold text-slate-700 text-right tabular-nums">{fmt(totalMd)}</span>
            <span />
            <span />
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showAddModal && (
        <AddEditFaseModal
          mode="add"
          faseLabel={faseLabel}
          teamPics={teamPics}
          saving={savingCreate}
          onSave={(data) => { setSavingCreate(true); createMut.mutate(data); }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editTarget && (
        <AddEditFaseModal
          mode="edit"
          faseLabel={faseLabel}
          initial={editTarget}
          teamPics={teamPics}
          saving={savingEditId === editTarget.id && updateMut.isPending}
          onSave={(data) => { setSavingEditId(editTarget.id); updateMut.mutate({ id: editTarget.id, data }); }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm" onClick={() => !deleteMut.isPending && setDeleteTarget(null)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full pointer-events-auto space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">Hapus kegiatan?</p>
                  <p className="text-sm text-slate-500 mt-1">
                    "<span className="font-medium text-slate-700">{deleteTarget.title}</span>" akan dihapus permanen.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}
                  className="btn-secondary flex-1 justify-center">Batal</button>
                <button
                  onClick={() => { setDeletingId(deleteTarget.id); deleteMut.mutate(deleteTarget.id); }}
                  disabled={deleteMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {deleteMut.isPending ? <Spinner className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RincianRow — single langkah inside Prosedur
// ─────────────────────────────────────────────────────────────────────────────

interface RincianRowProps {
  rincian: Rincian;
  index: number;
  teamPics: PicUser[];
  onSave: (id: string, data: Parameters<typeof penugasanApi.updateRincian>[1]) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}

const RincianRow: React.FC<RincianRowProps> = ({ rincian, index, teamPics, onSave, onDelete, saving }) => {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [eTitle, setETitle]   = useState(rincian.title);
  const [eStatus, setEStatus] = useState<ItemStatus>(rincian.status);
  const [eEst, setEEst]       = useState(rincian.est_hari != null ? String(rincian.est_hari) : '');
  const [eMd, setEMd]         = useState(rincian.man_days != null ? String(rincian.man_days) : '');
  const [eDl, setEDl]         = useState(rincian.tanggal_jatuh_tempo ?? '');
  const [ePics, setEPics]     = useState<string[]>(rincian.pics.map((p) => p.user_id));

  const startEdit = () => {
    setETitle(rincian.title); setEStatus(rincian.status);
    setEEst(rincian.est_hari != null ? String(rincian.est_hari) : '');
    setEMd(rincian.man_days != null ? String(rincian.man_days) : '');
    setEDl(rincian.tanggal_jatuh_tempo ?? '');
    setEPics(rincian.pics.map((p) => p.user_id));
    setEditing(true);
  };

  return (
    <div className="border-b border-slate-100/80 last:border-0">
      <div className={`flex items-center gap-2.5 py-2.5 px-3 hover:bg-white/60 rounded-lg transition-colors ${editing ? 'bg-white' : ''}`}>
        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold flex items-center justify-center shrink-0">{index + 1}</span>
        <p className="flex-1 text-xs font-medium text-slate-700 min-w-0 truncate">{rincian.title}</p>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${statusCls(rincian.status)}`}>{statusLabel(rincian.status)}</span>
        <div className="shrink-0 hidden sm:block"><PicAvatars pics={rincian.pics} max={3} /></div>
        <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
          <span><Clock className="w-2.5 h-2.5 inline mr-0.5" />{fmt(rincian.est_hari)}</span>
          <span><TrendingUp className="w-2.5 h-2.5 inline mr-0.5" />{fmt(rincian.man_days)}</span>
        </div>
        <span className="text-[10px] text-slate-400 hidden lg:block shrink-0">{fmtDateShort(rincian.tanggal_jatuh_tempo)}</span>
        <div className="flex items-center gap-1 shrink-0">
          {confirmDel ? (
            <ConfirmDelete label="langkah" onConfirm={() => { onDelete(rincian.id); setConfirmDel(false); }} onCancel={() => setConfirmDel(false)} />
          ) : (
            <>
              <button onClick={startEdit} className="p-1 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"><Edit2 className="w-3 h-3" /></button>
              <button onClick={() => setConfirmDel(true)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3 h-3" /></button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="mx-1 mb-2 p-3 bg-sky-50/60 border border-sky-200 rounded-xl">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
            <div className="col-span-2 sm:col-span-3">
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Nama Langkah</label>
              <input value={eTitle} onChange={(e) => setETitle(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Status</label>
              <select value={eStatus} onChange={(e) => setEStatus(e.target.value as ItemStatus)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none bg-white">
                {ITEM_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">PIC</label>
              <PicCheckboxDropdown teamPics={teamPics} value={ePics} onChange={setEPics} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Est Hari</label>
              <input type="number" value={eEst} onChange={(e) => setEEst(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Man-Days</label>
              <input type="number" value={eMd} onChange={(e) => setEMd(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Deadline</label>
              <input type="date" value={eDl} onChange={(e) => setEDl(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => { onSave(rincian.id, { title: eTitle, status: eStatus, est_hari: eEst ? Number(eEst) : undefined, man_days: eMd ? Number(eMd) : undefined, tanggal_jatuh_tempo: eDl || undefined, pic_ids: ePics }); setEditing(false); }}
              disabled={!eTitle || saving}
              className="flex items-center gap-1 px-3 py-1 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {saving ? <Spinner className="w-3 h-3" /> : <Check className="w-3 h-3" />} Simpan
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Batal</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ProsedurCard
// ─────────────────────────────────────────────────────────────────────────────

const ProsedurCard: React.FC<{ prosedur: Prosedur; teamPics: PicUser[]; onRefresh: () => void }> = ({ prosedur, teamPics, onRefresh }) => {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding]   = useState(false);
  const [eTitle, setETitle]   = useState(prosedur.title);
  const [eDl, setEDl]         = useState(prosedur.tanggal_jatuh_tempo ?? '');
  const [nTitle, setNTitle]   = useState('');

  const updateMut = useMutation({
    mutationFn: () => penugasanApi.updateProsedur(prosedur.id, { title: eTitle, tanggal_jatuh_tempo: eDl || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); setEditing(false); onRefresh(); },
    onError: () => toast.error('Gagal memperbarui prosedur.'),
  });
  const deleteMut = useMutation({
    mutationFn: () => penugasanApi.deleteProsedur(prosedur.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); onRefresh(); toast.success('Prosedur dihapus.'); },
    onError: () => toast.error('Gagal menghapus prosedur.'),
  });
  const [savingRincianId, setSavingRincianId] = useState<string | null>(null);
  const updateRincianMut = useMutation({
    mutationFn: (vars: { id: string; data: Parameters<typeof penugasanApi.updateRincian>[1] }) => penugasanApi.updateRincian(vars.id, vars.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); setSavingRincianId(null); onRefresh(); },
    onError: () => toast.error('Gagal memperbarui langkah.'),
  });
  const deleteRincianMut = useMutation({
    mutationFn: (id: string) => penugasanApi.deleteRincian(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); onRefresh(); toast.success('Langkah dihapus.'); },
    onError: () => toast.error('Gagal menghapus langkah.'),
  });
  const createRincianMut = useMutation({
    mutationFn: () => penugasanApi.createRincian(prosedur.id, { title: nTitle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); setAdding(false); setNTitle(''); onRefresh(); toast.success('Langkah ditambahkan.'); },
    onError: () => toast.error('Gagal menambah langkah.'),
  });

  const est = sumField(prosedur.rincian, 'est_hari');
  const md  = sumField(prosedur.rincian, 'man_days');
  const pic = uniquePics(prosedur.rincian.map((r) => r.pics));

  return (
    <div className="ml-4 mb-2 border-l-2 border-sky-300 rounded-r-xl bg-white border border-l-0 border-sky-200 overflow-hidden">
      {/* Prosedur header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-sky-50/60">
        <span className="inline-flex items-center gap-1 shrink-0">
          <ClipboardList className="w-3.5 h-3.5 text-sky-500" />
          <span className="text-[11px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">{prosedur.label}</span>
        </span>
        {editing ? (
          <>
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} className="flex-1 border border-sky-300 rounded px-2 py-0.5 text-sm focus:outline-none bg-white" />
            <input type="date" value={eDl} onChange={(e) => setEDl(e.target.value)} className="border border-slate-200 rounded px-2 py-0.5 text-xs w-32 bg-white" />
            <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending} className="p-1 bg-green-500 text-white rounded"><Check className="w-3 h-3" /></button>
            <button onClick={() => setEditing(false)} className="p-1 bg-slate-200 text-slate-600 rounded"><X className="w-3 h-3" /></button>
          </>
        ) : deleting ? (
          <ConfirmDelete label="prosedur" onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleting(false)} loading={deleteMut.isPending} />
        ) : (
          <>
            <span className="flex-1 text-xs font-semibold text-sky-900">{prosedur.title}</span>
            <div className="flex items-center gap-2 text-[10px] text-sky-500 shrink-0">
              {prosedur.rincian.length > 0 && <span>{prosedur.rincian.length} langkah · {fmt(est)} est · {fmt(md)} MD · {pic} PIC</span>}
              {prosedur.tanggal_jatuh_tempo && <span>{fmtDateShort(prosedur.tanggal_jatuh_tempo)}</span>}
            </div>
            <button onClick={() => { setEditing(true); setETitle(prosedur.title); setEDl(prosedur.tanggal_jatuh_tempo ?? ''); }} className="p-1 text-sky-400 hover:text-sky-700 rounded"><Edit2 className="w-3 h-3" /></button>
            <button onClick={() => setDeleting(true)} className="p-1 text-sky-400 hover:text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>
          </>
        )}
      </div>

      {/* Langkah list */}
      <div className="px-2 py-1.5">
        {prosedur.rincian.map((r, idx) => (
          <RincianRow key={r.id} rincian={r} index={idx} teamPics={teamPics}
            onSave={(id, data) => { setSavingRincianId(id); updateRincianMut.mutate({ id, data }); }}
            onDelete={(id) => deleteRincianMut.mutate(id)}
            saving={savingRincianId === r.id && updateRincianMut.isPending}
          />
        ))}

        {adding ? (
          <div className="flex items-center gap-2 mt-1.5 px-1">
            <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-600 text-[10px] font-bold flex items-center justify-center shrink-0">
              {prosedur.rincian.length + 1}
            </span>
            <input autoFocus value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder="Nama langkah..."
              className="flex-1 border border-primary-300 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white" />
            <button onClick={() => createRincianMut.mutate()} disabled={!nTitle || createRincianMut.isPending}
              className="p-1 bg-green-500 text-white rounded disabled:opacity-50"><Check className="w-3 h-3" /></button>
            <button onClick={() => { setAdding(false); setNTitle(''); }} className="p-1 bg-slate-200 text-slate-600 rounded"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-700 font-medium mt-1 px-1 py-0.5">
            <Plus className="w-3 h-3" /> Tambah Langkah
          </button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RisikoCard
// ─────────────────────────────────────────────────────────────────────────────

const RisikoCard: React.FC<{ risiko: Risiko; teamPics: PicUser[]; onRefresh: () => void }> = ({ risiko, teamPics, onRefresh }) => {
  const qc = useQueryClient();
  const [editing, setEditing]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingProc, setAddingProc] = useState(false);
  const [eTitle, setETitle]     = useState(risiko.title);
  const [eDl, setEDl]           = useState(risiko.tanggal_jatuh_tempo ?? '');
  const [nProcTitle, setNProcTitle] = useState('');
  const [nProcDl, setNProcDl]   = useState('');

  const updateMut = useMutation({
    mutationFn: () => penugasanApi.updateRisiko(risiko.id, { title: eTitle, tanggal_jatuh_tempo: eDl || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); setEditing(false); onRefresh(); },
    onError: () => toast.error('Gagal memperbarui risiko.'),
  });
  const deleteMut = useMutation({
    mutationFn: () => penugasanApi.deleteRisiko(risiko.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); onRefresh(); toast.success('Risiko dihapus.'); },
    onError: () => toast.error('Gagal menghapus risiko.'),
  });
  const addProcMut = useMutation({
    mutationFn: () => penugasanApi.createProsedur(risiko.id, { title: nProcTitle, tanggal_jatuh_tempo: nProcDl || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); setAddingProc(false); setNProcTitle(''); setNProcDl(''); onRefresh(); toast.success('Prosedur ditambahkan.'); },
    onError: () => toast.error('Gagal menambah prosedur.'),
  });

  const allRincian = risiko.prosedur.flatMap((p) => p.rincian);
  const est = sumField(allRincian, 'est_hari');
  const md  = sumField(allRincian, 'man_days');
  const pic = uniquePics(allRincian.map((r) => r.pics));

  return (
    <div className="ml-4 mb-3 border-l-2 border-amber-400 rounded-r-xl bg-amber-50/30 border border-l-0 border-amber-200 overflow-hidden">
      {/* Risiko header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50/60">
        <span className="inline-flex items-center gap-1 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{risiko.label}</span>
        </span>
        {editing ? (
          <>
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} className="flex-1 border border-amber-300 rounded px-2 py-0.5 text-sm focus:outline-none bg-white" />
            <input type="date" value={eDl} onChange={(e) => setEDl(e.target.value)} className="border border-slate-200 rounded px-2 py-0.5 text-xs w-32 bg-white" />
            <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending} className="p-1 bg-green-500 text-white rounded"><Check className="w-3 h-3" /></button>
            <button onClick={() => setEditing(false)} className="p-1 bg-slate-200 text-slate-600 rounded"><X className="w-3 h-3" /></button>
          </>
        ) : deleting ? (
          <ConfirmDelete label="risiko" onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleting(false)} loading={deleteMut.isPending} />
        ) : (
          <>
            <span className="flex-1 text-sm font-semibold text-amber-900">{risiko.title}</span>
            {risiko.risk_ref && <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full shrink-0">Ref</span>}
            <div className="hidden sm:flex items-center gap-2 text-[10px] text-amber-600 shrink-0">
              {allRincian.length > 0 && <span>{risiko.prosedur.length} prosedur · {fmt(est)} est · {fmt(md)} MD · {pic} PIC</span>}
            </div>
            <button onClick={() => { setEditing(true); setETitle(risiko.title); setEDl(risiko.tanggal_jatuh_tempo ?? ''); }} className="p-1 text-amber-400 hover:text-amber-700 rounded"><Edit2 className="w-3 h-3" /></button>
            <button onClick={() => setDeleting(true)} className="p-1 text-amber-400 hover:text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>
          </>
        )}
      </div>

      {/* Prosedur list */}
      <div className="p-2.5 space-y-0.5">
        {risiko.prosedur.map((p) => (
          <ProsedurCard key={p.id} prosedur={p} teamPics={teamPics} onRefresh={onRefresh} />
        ))}

        {addingProc ? (
          <div className="ml-4 flex items-center gap-2 p-2 bg-sky-50 rounded-xl border border-sky-200">
            <ClipboardList className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <input autoFocus value={nProcTitle} onChange={(e) => setNProcTitle(e.target.value)} placeholder="Nama prosedur..."
              className="flex-1 border border-sky-300 rounded px-2 py-1 text-xs focus:outline-none bg-white" />
            <input type="date" value={nProcDl} onChange={(e) => setNProcDl(e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-xs w-28 bg-white" />
            <button onClick={() => addProcMut.mutate()} disabled={!nProcTitle || addProcMut.isPending}
              className="px-2 py-1 bg-sky-600 text-white text-xs rounded hover:bg-sky-700 disabled:opacity-50">Simpan</button>
            <button onClick={() => { setAddingProc(false); setNProcTitle(''); }} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <button onClick={() => setAddingProc(true)} className="ml-4 flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium py-0.5">
            <Plus className="w-3 h-3" /> Tambah Prosedur
          </button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TujuanCard
// ─────────────────────────────────────────────────────────────────────────────

const TujuanCard: React.FC<{ tujuan: Tujuan; programId: string; teamPics: PicUser[]; onRefresh: () => void }> = ({ tujuan, programId, teamPics, onRefresh }) => {
  const qc = useQueryClient();
  const [open, setOpen]           = useState(true);
  const [editing, setEditing]     = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [addingRisk, setAddingRisk] = useState(false);
  const [eTitle, setETitle]       = useState(tujuan.title);
  const [nRiskTitle, setNRiskTitle] = useState('');
  const [nRiskDl, setNRiskDl]     = useState('');

  const updateMut = useMutation({
    mutationFn: () => penugasanApi.updateTujuan(tujuan.id, { title: eTitle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); setEditing(false); onRefresh(); },
    onError: () => toast.error('Gagal memperbarui tujuan.'),
  });
  const deleteMut = useMutation({
    mutationFn: () => penugasanApi.deleteTujuan(tujuan.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); onRefresh(); toast.success('Tujuan dihapus.'); },
    onError: () => toast.error('Gagal menghapus tujuan.'),
  });
  const addRiskMut = useMutation({
    mutationFn: () => penugasanApi.createRisiko(tujuan.id, { title: nRiskTitle, tanggal_jatuh_tempo: nRiskDl || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); setAddingRisk(false); setNRiskTitle(''); setNRiskDl(''); onRefresh(); toast.success('Risiko ditambahkan.'); },
    onError: () => toast.error('Gagal menambah risiko.'),
  });

  const allRincian = tujuan.risiko.flatMap((r) => r.prosedur.flatMap((p) => p.rincian));
  const est = sumField(allRincian, 'est_hari');
  const md  = sumField(allRincian, 'man_days');
  const pic = uniquePics(allRincian.map((r) => r.pics));

  return (
    <div className="mb-4 rounded-2xl border-l-4 border-indigo-500 border border-l-[4px] border-indigo-200 bg-white shadow-sm overflow-hidden">
      {/* Tujuan header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50/70 border-b border-indigo-100">
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <Target className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold text-white bg-indigo-500 px-2 py-0.5 rounded-md">{tujuan.label}</span>
        </span>

        {editing ? (
          <>
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)}
              className="flex-1 border border-indigo-300 rounded-lg px-2.5 py-1 text-sm focus:outline-none bg-white" />
            <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending} className="p-1.5 bg-green-500 text-white rounded-lg"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => setEditing(false)} className="p-1.5 bg-slate-200 text-slate-600 rounded-lg"><X className="w-3.5 h-3.5" /></button>
          </>
        ) : deleting ? (
          <ConfirmDelete label="tujuan" onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleting(false)} loading={deleteMut.isPending} />
        ) : (
          <>
            <span className="flex-1 text-sm font-bold text-indigo-900">{tujuan.title}</span>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-indigo-500 shrink-0">
              {tujuan.risiko.length > 0 && (
                <span>{tujuan.risiko.length} risiko · {fmt(est)} est hari · {fmt(md)} MD · {pic} PIC</span>
              )}
            </div>
            <button onClick={() => { setEditing(true); setETitle(tujuan.title); }} className="p-1 text-indigo-400 hover:text-indigo-700 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
            <button onClick={() => setDeleting(true)} className="p-1 text-indigo-400 hover:text-red-600 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
            <button onClick={() => setOpen((p) => !p)} className="p-1 text-indigo-400 hover:text-indigo-600 rounded-lg transition-colors">
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="p-3">
          {tujuan.risiko.map((r) => (
            <RisikoCard key={r.id} risiko={r} teamPics={teamPics} onRefresh={onRefresh} />
          ))}

          {addingRisk ? (
            <div className="ml-4 flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200 mt-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <input autoFocus value={nRiskTitle} onChange={(e) => setNRiskTitle(e.target.value)} placeholder="Nama risiko..."
                className="flex-1 border border-amber-300 rounded-lg px-2.5 py-1 text-sm focus:outline-none bg-white" />
              <input type="date" value={nRiskDl} onChange={(e) => setNRiskDl(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs w-32 bg-white" />
              <button onClick={() => addRiskMut.mutate()} disabled={!nRiskTitle || addRiskMut.isPending}
                className="px-3 py-1 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 disabled:opacity-50">Simpan</button>
              <button onClick={() => { setAddingRisk(false); setNRiskTitle(''); }} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => setAddingRisk(true)} className="ml-4 flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-medium mt-2 py-0.5">
              <Plus className="w-3.5 h-3.5" /> Tambah Risiko
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PelaksanaanSection — with legend card
// ─────────────────────────────────────────────────────────────────────────────

const PelaksanaanSection: React.FC<{ programId: string; pelaksanaan: Tujuan[]; teamPics: PicUser[]; onRefresh: () => void }> = ({ programId, pelaksanaan, teamPics, onRefresh }) => {
  const qc = useQueryClient();
  const [addingTujuan, setAddingTujuan] = useState(false);
  const [nTujuanTitle, setNTujuanTitle] = useState('');

  const addTujuanMut = useMutation({
    mutationFn: () => penugasanApi.createTujuan(programId, { title: nTujuanTitle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penugasan-detail'] }); setAddingTujuan(false); setNTujuanTitle(''); onRefresh(); toast.success('Tujuan ditambahkan.'); },
    onError: () => toast.error('Gagal menambah tujuan.'),
  });

  return (
    <div>
      {/* Legend card */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-blue-700 mb-1">Panduan Simbol</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="flex items-center gap-1.5 text-[11px] text-blue-700">
              <Target className="w-3.5 h-3.5 text-indigo-500" />
              <span className="font-bold text-white bg-indigo-500 px-1.5 rounded text-[10px]">T</span> Tujuan Audit
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-blue-700">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-bold text-amber-700 bg-amber-100 px-1.5 rounded text-[10px]">R</span> Risiko
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-blue-700">
              <ClipboardList className="w-3.5 h-3.5 text-sky-500" />
              <span className="font-bold text-sky-700 bg-sky-100 px-1.5 rounded text-[10px]">P</span> Prosedur
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-blue-700">
              <span className="w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold flex items-center justify-center">1</span>
              Langkah — rincian kerja (status, est hari, man-days, PIC)
            </span>
          </div>
        </div>
      </div>

      {/* Tujuan list */}
      {pelaksanaan.length === 0 && !addingTujuan && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Target className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Belum ada tujuan audit</p>
          <p className="text-xs mt-1">Mulai dengan menambahkan tujuan pertama di bawah.</p>
        </div>
      )}

      {pelaksanaan.map((t) => (
        <TujuanCard key={t.id} tujuan={t} programId={programId} teamPics={teamPics} onRefresh={onRefresh} />
      ))}

      {addingTujuan ? (
        <div className="flex items-center gap-2 p-4 bg-indigo-50 rounded-2xl border border-indigo-200 mb-4">
          <Target className="w-4 h-4 text-indigo-400 shrink-0" />
          <input autoFocus value={nTujuanTitle} onChange={(e) => setNTujuanTitle(e.target.value)} placeholder="Judul tujuan audit..."
            className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white" />
          <button onClick={() => addTujuanMut.mutate()} disabled={!nTujuanTitle || addTujuanMut.isPending}
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {addTujuanMut.isPending ? '...' : 'Simpan'}
          </button>
          <button onClick={() => { setAddingTujuan(false); setNTujuanTitle(''); }} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <button onClick={() => setAddingTujuan(true)}
          className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-sm font-medium w-full justify-center">
          <Plus className="w-4 h-4" /> Tambah Tujuan Audit
        </button>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Program Detail View
// ─────────────────────────────────────────────────────────────────────────────

type DetailTab = 'perencanaan' | 'pelaksanaan' | 'pelaporan';

const TABS: { key: DetailTab; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'perencanaan', label: 'Perencanaan', icon: BookOpen,      color: 'text-emerald-600' },
  { key: 'pelaksanaan', label: 'Pelaksanaan', icon: Target,        color: 'text-indigo-600'  },
  { key: 'pelaporan',   label: 'Pelaporan',   icon: FileText,      color: 'text-violet-600'  },
];

const ProgramDetailView: React.FC<{ programId: string; onBack: () => void }> = ({ programId, onBack }) => {
  const qc = useQueryClient();
  const [activeTab, setActiveTab]   = useState<DetailTab>('perencanaan');
  const [editingStatus, setEditingStatus] = useState(false);
  const [headerStatus, setHeaderStatus]   = useState<ProgramStatus>('draft');
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const updateMut = useMutation({
    mutationFn: (payload: { status?: string }) => penugasanApi.updateProgram(programId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['penugasan-detail', programId] });
      qc.invalidateQueries({ queryKey: ['penugasan-programs'] });
      setEditingStatus(false);
      toast.success('Status diperbarui.');
    },
    onError: () => toast.error('Gagal memperbarui program.'),
  });

  const deleteMut = useMutation({
    mutationFn: () => penugasanApi.deleteProgram(programId),
    onSuccess: () => { toast.success('Program dihapus.'); onBack(); },
    onError: () => toast.error('Gagal menghapus program.'),
  });

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  if (isLoading) return <div className="flex items-center justify-center py-24"><Spinner className="w-8 h-8" /></div>;
  if (!detail) return (
    <div className="text-center py-16 text-slate-500">
      <p>Program tidak ditemukan.</p>
      <button onClick={onBack} className="mt-4 text-primary-600 hover:underline text-sm">Kembali</button>
    </div>
  );

  const { program, perencanaan, pelaksanaan, pelaporan } = detail;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <button onClick={onBack} className="mt-0.5 p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4 text-slate-500" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-slate-800 leading-snug mb-1">{program.annual_plan_judul}</h1>
              <div className="flex items-center gap-3 flex-wrap">
                {program.auditee && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <span className="text-slate-400">📍</span> {program.auditee}
                  </span>
                )}
                {/* Status — click to change */}
                {editingStatus ? (
                  <div className="flex items-center gap-2">
                    <select value={headerStatus} onChange={(e) => setHeaderStatus(e.target.value as ProgramStatus)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white">
                      {(Object.keys(STATUS_LABEL) as ProgramStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    <button onClick={() => updateMut.mutate({ status: headerStatus })} disabled={updateMut.isPending}
                      className="px-2.5 py-1 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1">
                      {updateMut.isPending ? <Spinner className="w-3 h-3" /> : <Check className="w-3 h-3" />} Simpan
                    </button>
                    <button onClick={() => setEditingStatus(false)} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Batal</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditingStatus(true); setHeaderStatus(program.status); }}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold hover:opacity-80 transition-opacity ${STATUS_BADGE[program.status]}`}>
                    {STATUS_LABEL[program.status]}
                    <Edit2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>

            {!editingStatus && (
              confirmDelete ? (
                <ConfirmDelete label="program ini" onConfirm={() => deleteMut.mutate()} onCancel={() => setConfirmDelete(false)} loading={deleteMut.isPending} />
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" /> Hapus Program
                </button>
              )
            )}
          </div>
        </div>

        {/* Summary bar */}
        <SummaryBar detail={detail} />

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative ${
                  isActive ? 'text-primary-700 bg-primary-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                <Icon className={`w-4 h-4 ${isActive ? tab.color : 'text-slate-400'}`} />
                {tab.label}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-t" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {activeTab === 'perencanaan' && (
          <FaseItemsSection programId={programId} fase="perencanaan" items={perencanaan} teamPics={teamPics} onRefresh={handleRefresh} />
        )}
        {activeTab === 'pelaksanaan' && (
          <div className="p-4">
            <PelaksanaanSection programId={programId} pelaksanaan={pelaksanaan} teamPics={teamPics} onRefresh={handleRefresh} />
          </div>
        )}
        {activeTab === 'pelaporan' && (
          <FaseItemsSection programId={programId} fase="pelaporan" items={pelaporan} teamPics={teamPics} onRefresh={handleRefresh} />
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

const PengawasanIndividualPage: React.FC = () => {
  const [tahun, setTahun]           = useState(new Date().getFullYear());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['penugasan-programs', tahun],
    queryFn: () => penugasanApi.listPrograms(tahun),
    select: (r) => r.data?.data ?? [],
  });

  const programs: AuditProgram[] = (data ?? []) as AuditProgram[];
  const existingPlanIds = programs.map((p) => p.annual_plan_id);

  if (selectedId) {
    return (
      <div className="max-w-7xl mx-auto">
        <ProgramDetailView programId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Perencanaan Pengawasan Individual</h1>
          <p className="text-sm text-slate-500 mt-0.5">Rencana kerja audit per program penugasan dari Modul 1.</p>
        </div>
        <div className="flex items-center gap-3">
          <YearFilter value={tahun} onChange={setTahun} />
          <button onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Buat Program Baru
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24"><Spinner className="w-8 h-8" /></div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">Gagal memuat data. Coba refresh halaman.</p>
        </div>
      ) : programs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <ClipboardList className="w-12 h-12 text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">Belum ada program perencanaan individual</p>
          <p className="text-sm text-slate-400 mt-1">untuk tahun {tahun}.</p>
          <button onClick={() => setShowCreateModal(true)}
            className="mt-6 flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors">
            <Plus className="w-4 h-4" /> Buat Program Baru
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {programs.map((p) => (
            <ProgramCard key={p.id} program={p} onClick={() => setSelectedId(p.id)} />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateProgramModal
          tahun={tahun}
          existingPlanIds={existingPlanIds}
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => { setShowCreateModal(false); setSelectedId(id); }}
        />
      )}
    </div>
  );
};

export default PengawasanIndividualPage;
