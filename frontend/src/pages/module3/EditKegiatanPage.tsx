/**
 * Edit Kegiatan Page (Modul 3) — full-page editor
 *
 * URL: /pelaksanaan/program/:programId/kegiatan/:kegiatanType/:kegiatanId
 *   - kegiatanType: 'fase-item' (Perencanaan/Pelaporan) | 'rincian' (Pelaksanaan langkah)
 *
 * Layout:
 *   ┌── Header (breadcrumb, title, status pills, lock-box) ──┐
 *   ├──────────────────────────────────────────────────────┤
 *   │  LEFT (60%)                  │  RIGHT (40% sticky)    │
 *   │  - Deskripsi (rich text)     │  - Lampiran section   │
 *   │    [hanya fase_item]         │  - Auto-save indicator │
 *   │  - Hasil Audit section       │                        │
 *   │    [hanya rincian]           │                        │
 *   └──────────────────────────────────────────────────────┘
 */
import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Home, Calendar, Lock, Loader2, AlertTriangle,
  Clock, Users, FileText, Save,
} from 'lucide-react';
import { module3Api } from '../../services/api';
import { FaseItemDetail, RincianDetail, ItemStatus, RichTextDoc } from '../../types';
import RichTextEditor from '../../components/shared/RichTextEditor';
import { fmtDate, STATUS_OPTIONS } from './components/helpers';
import LampiranSection from './components/LampiranSection';
import HasilAuditSection from './components/HasilAuditSection';

type KegiatanType = 'fase-item' | 'rincian';

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export default function EditKegiatanPage() {
  const { programId, kegiatanType, kegiatanId } = useParams<{
    programId: string;
    kegiatanType: KegiatanType;
    kegiatanId: string;
  }>();
  const navigate = useNavigate();

  if (!programId || !kegiatanType || !kegiatanId) {
    return <div className="p-8 text-center text-sm text-slate-500">Parameter URL tidak lengkap.</div>;
  }

  return kegiatanType === 'fase-item'
    ? <FaseItemEditor programId={programId} kegiatanId={kegiatanId} onBack={() => navigate(`/pelaksanaan?program=${programId}`)} />
    : <RincianEditor   programId={programId} kegiatanId={kegiatanId} onBack={() => navigate(`/pelaksanaan?program=${programId}`)} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE ITEM (Perencanaan / Pelaporan)
// ─────────────────────────────────────────────────────────────────────────────

function FaseItemEditor({ programId, kegiatanId, onBack }: {
  programId: string; kegiatanId: string; onBack: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['m3-fase-item-detail', kegiatanId],
    queryFn: () => module3Api.getFaseItemDetail(kegiatanId).then((r) => r.data.data),
  });

  const [deskripsi, setDeskripsi] = useState<RichTextDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const initializedRef = useState({ done: false })[0];

  useMemo(() => {
    if (data && !initializedRef.done) {
      setDeskripsi(data.deskripsi ?? null);
      initializedRef.done = true;
    }
  }, [data, initializedRef]);

  const saveMut = useMutation({
    mutationFn: () => module3Api.patchFaseItemDeskripsi(kegiatanId, deskripsi),
    onSuccess: () => {
      toast.success('Deskripsi disimpan');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['m3-kegiatan-summary', programId] });
    },
    onError: () => toast.error('Gagal menyimpan'),
  });

  const statusMut = useMutation({
    mutationFn: (s: ItemStatus) => module3Api.patchFaseItemStatus(kegiatanId, s),
    onSuccess: () => {
      toast.success('Status diperbarui');
      qc.invalidateQueries({ queryKey: ['m3-fase-item-detail', kegiatanId] });
      qc.invalidateQueries({ queryKey: ['m3-hierarki', programId] });
      qc.invalidateQueries({ queryKey: ['m3-overview', programId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Gagal update status'),
  });

  if (isLoading) {
    return <div className="p-12 flex items-center justify-center text-slate-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Memuat kegiatan…
    </div>;
  }
  if (isError || !data) {
    return <div className="p-12 text-center text-sm text-red-500 flex flex-col items-center gap-2">
      <AlertTriangle className="w-8 h-8 opacity-60" />
      Gagal memuat data kegiatan.
    </div>;
  }

  const faseLabel = data.fase === 'perencanaan' ? 'Perencanaan' : 'Pelaporan';

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <Header
        breadcrumb={[
          { label: 'Modul 3', to: '/pelaksanaan' },
          { label: 'Program', to: `/pelaksanaan?program=${programId}` },
          { label: faseLabel },
        ]}
        title={data.title}
        onBack={onBack}
        status={data.status}
        onStatusChange={(s) => statusMut.mutate(s)}
        statusSaving={statusMut.isPending}
      />

      <LockBox
        deadline={data.tanggal_jatuh_tempo}
        estHari={data.est_hari}
        manDays={data.man_days}
        pics={data.pics}
      />

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT — konten utama (60%) */}
        <div className="lg:col-span-3 space-y-4">
          <SectionCard
            title="Deskripsi / Catatan Kegiatan"
            icon={<FileText className="w-4 h-4 text-primary-600" />}
            subtitle="Tulis catatan, observasi, atau detail pelaksanaan kegiatan ini."
          >
            <RichTextEditor
              value={deskripsi}
              onChange={(v) => { setDeskripsi(v); setDirty(true); }}
              placeholder="Tulis catatan kegiatan…"
              minHeight={250}
            />
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
              {dirty
                ? <span className="text-xs text-amber-600 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    Ada perubahan yang belum disimpan
                  </span>
                : <span className="text-xs text-slate-400">Semua perubahan tersimpan</span>
              }
              <button
                onClick={() => saveMut.mutate()}
                disabled={!dirty || saveMut.isPending}
                className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50"
              >
                {saveMut.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                Simpan
              </button>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT — sticky sidebar (40%) */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-4 space-y-4">
            <LampiranSection
              parentType="fase_item"
              parentId={kegiatanId}
              programId={programId}
              nasFolderName={data.nas_folder_name ?? undefined}
              lampiran={data.lampiran}
              onChanged={() => qc.invalidateQueries({ queryKey: ['m3-fase-item-detail', kegiatanId] })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RINCIAN (Pelaksanaan langkah)
// ─────────────────────────────────────────────────────────────────────────────

function RincianEditor({ programId, kegiatanId, onBack }: {
  programId: string; kegiatanId: string; onBack: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['m3-rincian-detail', kegiatanId],
    queryFn: () => module3Api.getRincianDetail(kegiatanId).then((r) => r.data.data),
  });

  const statusMut = useMutation({
    mutationFn: (s: ItemStatus) => module3Api.updateProgress(kegiatanId, { status: s }),
    onSuccess: () => {
      toast.success('Status diperbarui');
      qc.invalidateQueries({ queryKey: ['m3-rincian-detail', kegiatanId] });
      qc.invalidateQueries({ queryKey: ['m3-hierarki', programId] });
      qc.invalidateQueries({ queryKey: ['m3-overview', programId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Gagal update status'),
  });

  if (isLoading) {
    return <div className="p-12 flex items-center justify-center text-slate-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Memuat kegiatan…
    </div>;
  }
  if (isError || !data) {
    return <div className="p-12 text-center text-sm text-red-500 flex flex-col items-center gap-2">
      <AlertTriangle className="w-8 h-8 opacity-60" />
      Gagal memuat data langkah.
    </div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <Header
        breadcrumb={[
          { label: 'Modul 3', to: '/pelaksanaan' },
          { label: 'Program', to: `/pelaksanaan?program=${programId}` },
          { label: data.tujuan_title },
          { label: data.risiko_title },
          { label: data.prosedur_title },
          { label: 'Langkah' },
        ]}
        title={data.title}
        onBack={onBack}
        status={data.status}
        onStatusChange={(s) => statusMut.mutate(s)}
        statusSaving={statusMut.isPending}
      />

      <LockBox
        deadline={data.tanggal_jatuh_tempo}
        estHari={data.est_hari}
        manDays={data.man_days}
        pics={data.pics}
      />

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT — Hasil Audit (60%) */}
        <div className="lg:col-span-3 space-y-4">
          <HasilAuditSection
            rincianId={kegiatanId}
            hasilAudit={data.hasil_audit}
            onChanged={() => {
              qc.invalidateQueries({ queryKey: ['m3-rincian-detail', kegiatanId] });
              qc.invalidateQueries({ queryKey: ['m3-kegiatan-summary', programId] });
            }}
          />
        </div>

        {/* RIGHT — sticky sidebar (40%) */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-4 space-y-4">
            <LampiranSection
              parentType="rincian"
              parentId={kegiatanId}
              programId={programId}
              nasFolderName={data.nas_folder_name ?? undefined}
              lampiran={data.lampiran}
              onChanged={() => {
                qc.invalidateQueries({ queryKey: ['m3-rincian-detail', kegiatanId] });
                qc.invalidateQueries({ queryKey: ['m3-kegiatan-summary', programId] });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Header({
  breadcrumb, title, onBack, status, onStatusChange, statusSaving, rightExtra,
}: {
  breadcrumb: { label: string; to?: string }[];
  title: string;
  onBack: () => void;
  status: ItemStatus;
  onStatusChange: (s: ItemStatus) => void;
  statusSaving?: boolean;
  rightExtra?: React.ReactNode;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="btn-icon hover:bg-slate-100 text-slate-500 -ml-1" title="Kembali">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <nav className="flex items-center flex-wrap gap-1 text-xs text-slate-500 mb-2">
            <Home className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-slate-300">›</span>}
                {b.to
                  ? <Link to={b.to} className="hover:text-primary-700 transition-colors truncate max-w-[180px]">{b.label}</Link>
                  : <span className="truncate max-w-[180px] text-slate-700 font-medium">{b.label}</span>}
              </span>
            ))}
          </nav>
          <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-snug">{title}</h1>
          <div className="flex items-center flex-wrap gap-2 mt-3">
            <span className="section-label">Status:</span>
            <StatusPicker value={status} onChange={onStatusChange} saving={statusSaving} />
          </div>
        </div>
        {rightExtra && <div>{rightExtra}</div>}
      </div>
    </div>
  );
}

function StatusPicker({ value, onChange, saving }: {
  value: ItemStatus;
  onChange: (v: ItemStatus) => void;
  saving?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {STATUS_OPTIONS.map((s) => {
        const active = value === s.value;
        return (
          <button
            key={s.value}
            onClick={() => !active && onChange(s.value)}
            disabled={saving || active}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              active
                ? s.cls + ' ring-2 ring-offset-1 ring-primary-300 cursor-default'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
            } ${saving && !active ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </button>
        );
      })}
      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 ml-1" />}
    </div>
  );
}

function LockBox({
  deadline, estHari, manDays, pics,
}: {
  deadline: string | null;
  estHari: number | null;
  manDays: number | null;
  pics: { user_id: string; nama: string }[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
        <Lock className="w-3.5 h-3.5" /> Ditetapkan di Modul 2 (Tidak Dapat Diubah)
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Deadline
          </p>
          <p className="text-sm font-semibold text-slate-800">{deadline ? fmtDate(deadline) : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Est. Hari
          </p>
          <p className="text-sm font-semibold text-slate-800">{estHari ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Man-Days
          </p>
          <p className="text-sm font-semibold text-slate-800">{manDays ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 flex items-center gap-1">
            <Users className="w-3 h-3" /> PIC
          </p>
          {pics.length === 0
            ? <p className="text-sm text-slate-400">—</p>
            : (
              <div className="flex flex-col gap-1">
                {pics.map((p) => (
                  <span key={p.user_id} className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                    <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[8px] font-bold flex items-center justify-center shrink-0">
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
  );
}

export function SectionCard({
  title, icon, subtitle, children, headerExtra,
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            {icon}{title}
          </p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {headerExtra}
      </div>
      {children}
    </div>
  );
}
