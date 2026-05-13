/**
 * HasilAuditSection — Multi-finding manager untuk kegiatan Pelaksanaan (langkah/rincian).
 *
 * 1 langkah bisa punya banyak Hasil Audit:
 *   - Konfirmasi Positif: kondisi, kriteria, rekomendasi
 *   - Temuan:             kondisi, kriteria, sebab, akibat, rekomendasi (+ severity High/Medium/Low)
 *   - OFI:                kondisi, saran, peningkatan
 *
 * UI: list collapsible cards dengan auto-save inline pada tiap card.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ListChecks, Plus, ChevronDown, ChevronRight, Trash2, Save, CheckCircle2,
  AlertTriangle, Lightbulb, Loader2, Pencil,
} from 'lucide-react';
import { module3Api } from '../../../services/api';
import {
  HasilAudit, HasilAuditKategori, HasilAuditSeverity, RichTextDoc, HasilAuditPatch,
} from '../../../types';
import RichTextEditor from '../../../components/shared/RichTextEditor';
import { useConfirm } from '../../../components/shared/ConfirmDialog';

interface Props {
  rincianId: string;
  hasilAudit: HasilAudit[];
  onChanged: () => void;
}

const KATEGORI_META: Record<HasilAuditKategori, {
  label: string;
  shortLabel: string;
  cls: string;
  ringCls: string;
  Icon: React.ElementType;
  fields: { key: keyof HasilAuditPatch; label: string }[];
}> = {
  konfirmasi_positif: {
    label: 'Konfirmasi Positif',
    shortLabel: 'Konfirmasi',
    cls: 'bg-green-50 text-green-700 border-green-200',
    ringCls: 'border-green-200',
    Icon: CheckCircle2,
    fields: [
      { key: 'kondisi',     label: 'Kondisi' },
      { key: 'kriteria',    label: 'Kriteria' },
      { key: 'rekomendasi', label: 'Rekomendasi' },
    ],
  },
  temuan: {
    label: 'Temuan',
    shortLabel: 'Temuan',
    cls: 'bg-red-50 text-red-700 border-red-200',
    ringCls: 'border-red-200',
    Icon: AlertTriangle,
    fields: [
      { key: 'kondisi',     label: 'Kondisi' },
      { key: 'kriteria',    label: 'Kriteria' },
      { key: 'sebab',       label: 'Sebab' },
      { key: 'akibat',      label: 'Akibat' },
      { key: 'rekomendasi', label: 'Rekomendasi' },
    ],
  },
  ofi: {
    label: 'Opportunity for Improvement (OFI)',
    shortLabel: 'OFI',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
    ringCls: 'border-amber-200',
    Icon: Lightbulb,
    fields: [
      { key: 'kondisi',     label: 'Kondisi' },
      { key: 'saran',       label: 'Saran' },
      { key: 'peningkatan', label: 'Peningkatan' },
    ],
  },
};

const SEVERITY_META: Record<HasilAuditSeverity, { label: string; cls: string; dot: string }> = {
  high:   { label: 'Tinggi',  cls: 'bg-red-100 text-red-700 border-red-200',     dot: 'bg-red-500' },
  medium: { label: 'Sedang',  cls: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  low:    { label: 'Rendah',  cls: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
};

const KATEGORI_ORDER: HasilAuditKategori[] = ['konfirmasi_positif', 'temuan', 'ofi'];

export default function HasilAuditSection({ rincianId, hasilAudit, onChanged }: Props) {
  const createMut = useMutation({
    mutationFn: (kategori: HasilAuditKategori) =>
      module3Api.createHasilAudit(rincianId, { kategori }),
    onSuccess: () => { toast.success('Hasil audit ditambahkan'); onChanged(); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Gagal menambahkan'),
  });

  // Group by kategori, urutkan sesuai KATEGORI_ORDER
  const grouped = KATEGORI_ORDER.map((k) => ({
    kategori: k,
    items: hasilAudit.filter((h) => h.kategori === k),
  }));

  // Running index per item (global) untuk label #N
  let globalIdx = 0;

  return (
    <div className="card p-4 sm:p-5">
      {/* Section header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <ListChecks className="w-4 h-4 text-primary-600" />
            Kategori Hasil Audit
            <span className="ml-1 text-xs font-normal text-slate-500">({hasilAudit.length})</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Hasil pemeriksaan untuk langkah ini. Bisa banyak temuan/konfirmasi/OFI per langkah.
          </p>
        </div>
        {/* Add buttons */}
        <div className="flex flex-wrap gap-1.5">
          {KATEGORI_ORDER.map((k) => {
            const meta = KATEGORI_META[k];
            return (
              <button key={k}
                onClick={() => createMut.mutate(k)}
                disabled={createMut.isPending}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${meta.cls} hover:brightness-95`}
              >
                <Plus className="w-3.5 h-3.5" /> {meta.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {hasilAudit.length === 0 ? (
        <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Belum ada hasil audit.</p>
          <p className="mt-1">Klik tombol di atas untuk tambah <b>Konfirmasi Positif</b>, <b>Temuan</b>, atau <b>OFI</b>.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ kategori, items }) => {
            if (items.length === 0) return null;
            const meta = KATEGORI_META[kategori];
            const groupStart = globalIdx + 1;
            globalIdx += items.length;
            return (
              <KategoriGroup
                key={kategori}
                kategori={kategori}
                meta={meta}
                items={items}
                startIndex={groupStart}
                onChanged={onChanged}
                onAdd={() => createMut.mutate(kategori)}
                addPending={createMut.isPending}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Kategori Group — collapsible header + daftar item di dalamnya
// ─────────────────────────────────────────────────────────────────────────────
function KategoriGroup({
  kategori, meta, items, startIndex, onChanged, onAdd, addPending,
}: {
  kategori: HasilAuditKategori;
  meta: typeof KATEGORI_META[HasilAuditKategori];
  items: HasilAudit[];
  startIndex: number;
  onChanged: () => void;
  onAdd: () => void;
  addPending: boolean;
}) {
  const [open, setOpen] = useState(true);
  const Icon = meta.Icon;

  return (
    <div className={`rounded-xl border ${meta.ringCls} overflow-hidden`}>
      {/* ── Group header ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2.5 px-4 py-2.5 ${meta.cls} transition-all hover:brightness-95`}
      >
        <div className={`p-1 rounded-md ${meta.cls} border ${meta.ringCls}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-sm font-bold flex-1 text-left">{meta.label}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${meta.cls}`}>
          {items.length} item
        </span>
        {open
          ? <ChevronDown  className="w-4 h-4 shrink-0 opacity-60" />
          : <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />}
      </button>

      {/* ── Item list ── */}
      {open && (
        <div className="divide-y divide-slate-100 bg-white">
          {items.map((h, idx) => (
            <HasilAuditCard
              key={h.id}
              hasil={h}
              index={startIndex + idx}
              onChanged={onChanged}
            />
          ))}
          {/* Add more button di bawah grup */}
          <div className="px-4 py-2 bg-slate-50/60">
            <button
              onClick={onAdd}
              disabled={addPending}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${meta.cls} hover:brightness-95`}
            >
              <Plus className="w-3 h-3" /> Tambah {meta.shortLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hasil Audit Card (1 item) — collapsible dengan auto-save inline
// ─────────────────────────────────────────────────────────────────────────────

function HasilAuditCard({ hasil, index, onChanged }: {
  hasil: HasilAudit;
  index: number;
  onChanged: () => void;
}) {
  const meta = KATEGORI_META[hasil.kategori];
  const confirm = useConfirm();
  const [open, setOpen] = useState(true);

  // Local state untuk judul (plain text) dan semua field rich text + severity
  const [judul, setJudul] = useState<string>(hasil.judul ?? '');
  const [fields, setFields] = useState<Partial<HasilAuditPatch>>({
    judul:       hasil.judul,
    kondisi:     hasil.kondisi,
    kriteria:    hasil.kriteria,
    sebab:       hasil.sebab,
    akibat:      hasil.akibat,
    rekomendasi: hasil.rekomendasi,
    saran:       hasil.saran,
    peningkatan: hasil.peningkatan,
    severity:    hasil.severity,
  });

  // Sync from props ketika data berubah eksternal
  const lastIdRef = useRef(hasil.id);
  useEffect(() => {
    if (lastIdRef.current !== hasil.id) {
      setJudul(hasil.judul ?? '');
      setFields({
        judul: hasil.judul, kondisi: hasil.kondisi, kriteria: hasil.kriteria, sebab: hasil.sebab,
        akibat: hasil.akibat, rekomendasi: hasil.rekomendasi, saran: hasil.saran,
        peningkatan: hasil.peningkatan, severity: hasil.severity,
      });
      lastIdRef.current = hasil.id;
    }
  }, [hasil]);

  const [dirty, setDirty] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => module3Api.patchHasilAudit(hasil.id, fields),
    onSuccess: () => { toast.success('Tersimpan'); setDirty(false); onChanged(); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Gagal menyimpan'),
  });

  const updateField = (key: keyof HasilAuditPatch, value: unknown) => {
    setFields((prev) => ({ ...prev, [key]: value } as Partial<HasilAuditPatch>));
    setDirty(true);
  };

  const updateJudul = (val: string) => {
    setJudul(val);
    setFields((prev) => ({ ...prev, judul: val.trim() || null } as Partial<HasilAuditPatch>));
    setDirty(true);
  };

  const deleteMut = useMutation({
    mutationFn: () => module3Api.deleteHasilAudit(hasil.id),
    onSuccess: () => { toast.success('Hasil audit dihapus'); onChanged(); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Gagal menghapus'),
  });

  const displayJudul = judul.trim() || null;

  return (
    <div className="bg-white">
      {/* ── Row header (collapsible) ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors group">
        {/* Nomor urut */}
        <span className="text-[11px] font-mono text-slate-400 w-5 text-center shrink-0">
          {index}
        </span>

        {/* Chevron toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className={`shrink-0 p-0.5 rounded transition-all ${meta.cls}`}
          title={open ? 'Tutup detail' : 'Buka detail'}
        >
          {open
            ? <ChevronDown  className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Judul / placeholder */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 min-w-0 text-left"
        >
          {displayJudul ? (
            <span className="text-sm font-semibold text-slate-800 truncate block leading-snug">
              {displayJudul}
            </span>
          ) : (
            <span className="text-xs text-slate-400 italic flex items-center gap-1">
              <Pencil className="w-3 h-3 shrink-0" />
              Belum ada judul — klik untuk isi
            </span>
          )}
        </button>

        {/* Severity badge (jika set) */}
        {hasil.kategori === 'temuan' && fields.severity && (
          <span className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${SEVERITY_META[fields.severity as HasilAuditSeverity].cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_META[fields.severity as HasilAuditSeverity].dot}`} />
            {SEVERITY_META[fields.severity as HasilAuditSeverity].label}
          </span>
        )}

        {dirty && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-amber-600 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Belum disimpan
          </span>
        )}
        {!dirty && !open && null}

        {/* Delete */}
        <button
          onClick={async () => {
            const ok = await confirm({
              variant: 'danger',
              title: `Hapus ${meta.label}${displayJudul ? ` "${displayJudul}"` : ` #${index}`}?`,
              description: (
                <>
                  Hasil audit ini akan dihapus <b>permanen</b> beserta seluruh isinya
                  (judul, kondisi, kriteria{hasil.kategori === 'temuan' && ', sebab, akibat'}
                  {hasil.kategori === 'ofi' ? ', saran, peningkatan' : ', rekomendasi'}).
                  <br />
                  <span className="text-red-600 font-medium">Tindakan ini tidak bisa dibatalkan.</span>
                </>
              ),
              confirmLabel: 'Ya, Hapus Permanen',
            });
            if (ok) deleteMut.mutate();
          }}
          disabled={deleteMut.isPending}
          className="p-1.5 rounded-md text-slate-400 hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50 shrink-0"
          title="Hapus"
        >
          {deleteMut.isPending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Body (expanded) ── */}
      {open && (
        <div className={`mx-4 mb-3 p-4 rounded-xl border ${meta.ringCls} bg-slate-50/50 space-y-4`}>

          {/* Judul input */}
          <div>
            <p className="section-label mb-1 flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Judul
            </p>
            <input
              type="text"
              value={judul}
              onChange={(e) => updateJudul(e.target.value)}
              placeholder={`Judul singkat ${meta.label.toLowerCase()}…`}
              className="input w-full text-sm font-semibold"
              maxLength={200}
            />
          </div>

          {/* Severity selector (temuan only) */}
          {hasil.kategori === 'temuan' && (
            <div>
              <p className="section-label mb-1.5">Severity / Tingkat Risiko</p>
              <SeveritySelector
                value={(fields.severity ?? null) as HasilAuditSeverity | null}
                onChange={(v) => updateField('severity', v)}
              />
            </div>
          )}

          {/* Rich text fields */}
          {meta.fields.map((f) => (
            <FieldEditor
              key={f.key}
              label={f.label}
              value={(fields[f.key] as RichTextDoc) ?? null}
              onChange={(v) => updateField(f.key, v)}
            />
          ))}

          {/* Tombol Simpan */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            {dirty
              ? <span className="flex items-center gap-1.5 text-xs text-amber-600">
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
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Save className="w-3.5 h-3.5" />}
              Simpan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldEditor({
  label, value, onChange,
}: {
  label: string;
  value: RichTextDoc | null;
  onChange: (v: RichTextDoc | null) => void;
}) {
  return (
    <div>
      <p className="section-label mb-1">{label}</p>
      <RichTextEditor
        value={value}
        onChange={onChange}
        placeholder={`Tulis ${label.toLowerCase()}…`}
        minHeight={100}
      />
    </div>
  );
}

function SeveritySelector({
  value, onChange,
}: { value: HasilAuditSeverity | null; onChange: (v: HasilAuditSeverity | null) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(['high', 'medium', 'low'] as HasilAuditSeverity[]).map((s) => {
        const meta = SEVERITY_META[s];
        const active = value === s;
        return (
          <button key={s}
            onClick={() => onChange(active ? null : s)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              active
                ? meta.cls + ' ring-2 ring-offset-1 ring-primary-300 shadow-sm'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
            title={active ? 'Klik untuk hapus severity' : `Set severity ${meta.label}`}>
            <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </button>
        );
      })}
      {value && (
        <span className="text-[11px] text-slate-400 italic">Klik lagi untuk hapus pilihan</span>
      )}
    </div>
  );
}

