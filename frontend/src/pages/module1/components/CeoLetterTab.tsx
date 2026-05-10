import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, FileDown, FileText, Plus, Save, Trash2, Upload, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AreaPrioritas,
  CeoLetterArea,
  CeoLetterDocument,
  CeoLetterTargetTipe,
  CeoLetterTargetUnit,
  ceoLetterApi,
} from '../../../services/api';
import { useAuthStore } from '../../../store/auth.store';
import { parseLocalDate, toInputDate } from '../../../utils/dateUtils';

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

  if (count === 0) return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
      <ClipboardList className="w-3 h-3" /> Belum ada program kerja
    </span>
  );

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
            <p className="text-xs text-slate-500">{count} program kerja terkait area ini.</p>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

const PRIORITAS_OPTS: AreaPrioritas[] = ['Tinggi', 'Sedang', 'Rendah'];
const TARGET_TIPE_OPTS: CeoLetterTargetTipe[] = ['Direksi', 'Komisaris'];
const DIREKSI_UNIT_OPTS: CeoLetterTargetUnit[] = ['Utama', 'Keuangan', 'Bisnis', 'Operasional', 'Teknologi Informasi'];

function normalizeArea(area: Partial<CeoLetterArea>, urutan = 0): CeoLetterArea {
  const targetTipe = area.target_tipe ?? 'Direksi';
  return {
    id: area.id,
    ceo_letter_id: area.ceo_letter_id,
    parameter: area.parameter ?? '',
    deskripsi: area.deskripsi ?? '',
    prioritas: area.prioritas ?? 'Sedang',
    target_tipe: targetTipe,
    target_unit: targetTipe === 'Komisaris' ? 'Komisaris' : (area.target_unit ?? 'Utama'),
    urutan: area.urutan ?? urutan,
    programs_count: area.programs_count ?? 0,
    programs: area.programs ?? [],
  };
}

function fmtDate(value?: string | null) {
  if (!value) return '-';
  const parsed = parseLocalDate(value);
  if (!parsed) return '-';
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function priorityClass(priority: AreaPrioritas) {
  if (priority === 'Tinggi') return 'text-red-700';
  if (priority === 'Sedang') return 'text-amber-700';
  return 'text-slate-600';
}

export default function CeoLetterTab({ tahun }: { tahun: number }) {
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'kepala_spi' || role === 'admin_spi';
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['ceo-letter', tahun],
    queryFn: () => ceoLetterApi.get(tahun).then((r) => r.data.data),
  });

  const letters = useMemo<CeoLetterDocument[]>(() => {
    if (data?.letters) return data.letters;
    if (data?.header) return [{ ...data.header, areas: data.areas ?? [] }];
    return [];
  }, [data]);

  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [judul, setJudul] = useState('');
  const [nomor, setNomor] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [ringkasan, setRingkasan] = useState('');
  const [areas, setAreas] = useState<CeoLetterArea[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showDeleteFileConfirm, setShowDeleteFileConfirm]     = useState(false);
  const [showDeleteLetterConfirm, setShowDeleteLetterConfirm] = useState(false);

  const selectedLetter = letters.find((l) => l.id === selectedId) ?? null;
  const isNew = selectedId === 'new';
  const showDetail = selectedId !== null;

  const loadLetter = (letter: CeoLetterDocument | null) => {
    setSelectedId(letter?.id ?? 'new');
    setJudul(letter?.judul ?? '');
    setNomor(letter?.nomor_surat ?? '');
    setTanggal(toInputDate(letter?.tanggal_terbit));
    setRingkasan(letter?.isi_ringkasan ?? '');
    setAreas((letter?.areas ?? []).map((area, idx) => normalizeArea(area, idx)));
    setPendingFile(null);
    setDirty(false);
  };

  useEffect(() => {
    if (selectedId === 'new' || selectedId === null) return;
    const next = letters.find((l) => l.id === selectedId);
    if (next) loadLetter(next);
    if (!next) setSelectedId(null);
  }, [letters, selectedId]);

  const backToList = () => {
    setSelectedId(null);
    setPendingFile(null);
    setDirty(false);
  };

  const markDirty = () => setDirty(true);

  const addArea = () => {
    setAreas((prev) => [...prev, normalizeArea({}, prev.length)]);
    markDirty();
  };

  const updateArea = (idx: number, patch: Partial<CeoLetterArea>) => {
    setAreas((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };
      if (patch.target_tipe === 'Komisaris') merged.target_unit = 'Komisaris';
      if (patch.target_tipe === 'Direksi' && merged.target_unit === 'Komisaris') merged.target_unit = 'Utama';
      next[idx] = normalizeArea(merged, idx);
      return next;
    });
    markDirty();
  };

  const removeArea = (idx: number) => {
    setAreas((prev) => prev.filter((_, i) => i !== idx).map((a, i) => ({ ...a, urutan: i })));
    markDirty();
  };

  const upsertMut = useMutation({
    mutationFn: () =>
      ceoLetterApi.upsert({
        id: selectedLetter?.id ?? null,
        create_new: isNew,
        tahun,
        nomor_surat: nomor || null,
        judul: judul.trim(),
        tanggal_terbit: tanggal || null,
        isi_ringkasan: ringkasan || null,
        areas: areas
          .filter((a) => (a.parameter ?? '').trim().length > 0)
          .map((a, i) => ({
            parameter: a.parameter.trim(),
            deskripsi: a.deskripsi ?? null,
            prioritas: a.prioritas,
            target_tipe: a.target_tipe,
            target_unit: a.target_tipe === 'Komisaris' ? 'Komisaris' : a.target_unit,
            urutan: i,
          })),
        file: pendingFile ?? null,
      }),
    onSuccess: () => {
      toast.success('CEO Letter tersimpan');
      qc.invalidateQueries({ queryKey: ['ceo-letter'] });
      setPendingFile(null);
      setDirty(false);
      if (isNew) setSelectedId(null);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? 'Gagal menyimpan CEO Letter'),
  });

  const deleteFileMut = useMutation({
    mutationFn: () => ceoLetterApi.deleteFile(selectedLetter!.id),
    onSuccess: () => {
      toast.success('PDF lampiran dihapus');
      qc.invalidateQueries({ queryKey: ['ceo-letter'] });
      setShowDeleteFileConfirm(false);
    },
  });

  const removeMut = useMutation({
    mutationFn: () => ceoLetterApi.remove(selectedLetter!.id),
    onSuccess: () => {
      toast.success('CEO Letter dihapus');
      backToList();
      qc.invalidateQueries({ queryKey: ['ceo-letter'] });
      setShowDeleteLetterConfirm(false);
    },
  });

  const fileSizeText = useMemo(() => {
    const s = pendingFile?.size ?? selectedLetter?.file_size;
    if (!s) return '';
    if (s < 1024) return `${s} B`;
    if (s < 1024 * 1024) return `${(s / 1024).toFixed(1)} KB`;
    return `${(s / 1024 / 1024).toFixed(2)} MB`;
  }, [pendingFile, selectedLetter]);

  const handleFilePick = (f: File | null) => {
    if (!f) return;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      toast.error('Hanya PDF yang diperbolehkan');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('Ukuran maksimal 10 MB');
      return;
    }
    setPendingFile(f);
    markDirty();
  };

  const saveLetter = () => {
    if (!judul.trim()) {
      toast.error('Judul wajib diisi');
      return;
    }
    upsertMut.mutate();
  };

  if (showDetail) {
    return (
      <>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={backToList} className="btn-secondary px-3 py-2 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{isNew ? 'Tambah CEO Letter' : 'Detail CEO Letter'}</h2>
              <p className="text-sm text-slate-500">Surat arahan tahun {tahun}</p>
            </div>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-2">
            {dirty
              ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> <span>Ada perubahan belum tersimpan</span></>
              : selectedLetter
                ? <><CheckCircle2 className="w-4 h-4 text-green-500" /> <span>Tersimpan</span></>
                : <span>Draft baru</span>}
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6">
              <label className="block text-xs font-bold text-slate-600 mb-1">Judul Surat <span className="text-red-500">*</span></label>
              <input type="text" disabled={!canEdit} value={judul} onChange={(e) => { setJudul(e.target.value); markDirty(); }} className="input" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-600 mb-1">Nomor Surat</label>
              <input type="text" disabled={!canEdit} value={nomor} onChange={(e) => { setNomor(e.target.value); markDirty(); }} className="input" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-600 mb-1">Tanggal Terbit</label>
              <input type="date" disabled={!canEdit} value={tanggal} onChange={(e) => { setTanggal(e.target.value); markDirty(); }} className="input" />
            </div>
            <div className="md:col-span-12">
              <label className="block text-xs font-bold text-slate-600 mb-1">Ringkasan / Isi Pokok</label>
              <textarea
                disabled={!canEdit}
                value={ringkasan}
                onChange={(e) => { setRingkasan(e.target.value); markDirty(); }}
                className="input min-h-[88px]"
                placeholder="Poin-poin utama arahan..."
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4">
            <label className="block text-xs font-bold text-slate-600 mb-2">Lampiran PDF</label>
            {selectedLetter?.file_url && !pendingFile ? (
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <FileText className="w-5 h-5 text-red-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{selectedLetter.file_name ?? 'PDF Lampiran'}</p>
                  <p className="text-xs text-slate-500">{fileSizeText}</p>
                </div>
                <a href={selectedLetter.file_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm flex items-center gap-2">
                  <FileDown className="w-4 h-4" /> Lihat
                </a>
                {canEdit && (
                  <>
                    <label className="btn-secondary text-sm flex items-center gap-2 cursor-pointer text-primary-700">
                      <Upload className="w-4 h-4" /> Ganti
                      <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)} />
                    </label>
                    <button
                      onClick={() => setShowDeleteFileConfirm(true)}
                      disabled={deleteFileMut.isPending}
                      className="btn-danger"
                    >
                      <Trash2 className="w-4 h-4" /> Hapus
                    </button>
                  </>
                )}
              </div>
            ) : pendingFile ? (
              <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <Upload className="w-5 h-5 text-amber-700" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{pendingFile.name}</p>
                  <p className="text-xs text-amber-700">Belum diunggah · {fileSizeText} · klik Simpan untuk mengupload</p>
                </div>
                <button onClick={() => setPendingFile(null)} className="p-2 rounded-lg text-slate-500 hover:bg-white" title="Batalkan">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : canEdit ? (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-5 cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 text-slate-500 hover:text-primary-700 transition-colors">
                <Upload className="w-5 h-5" />
                <span className="text-sm font-bold">Pilih satu file PDF (maks. 10 MB)</span>
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)} />
              </label>
            ) : (
              <p className="text-sm text-slate-400 italic">Belum ada lampiran PDF.</p>
            )}
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">Area / Parameter Pengawasan</h3>
                <p className="text-xs text-slate-500">Pilih penerima arahan per area: Direksi atau Komisaris.</p>
              </div>
              {canEdit && (
                <button onClick={addArea} className="btn-secondary text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Tambah Area
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead className="bg-slate-50/70 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left w-10">#</th>
                    <th className="px-4 py-3 text-left w-44">Penerima</th>
                    <th className="px-4 py-3 text-left w-56">Bidang</th>
                    <th className="px-4 py-3 text-left">Parameter</th>
                    <th className="px-4 py-3 text-left">Deskripsi</th>
                    <th className="px-4 py-3 text-left w-36">Prioritas</th>
                    <th className="px-4 py-3 text-center w-36">Program Kerja</th>
                    {canEdit && <th className="px-4 py-3 text-right w-14">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {areas.length === 0 && (
                    <tr>
                      <td colSpan={canEdit ? 8 : 7} className="px-4 py-8 text-center text-slate-400">
                        Belum ada area pengawasan.
                      </td>
                    </tr>
                  )}
                  {areas.map((area, idx) => {
                    const cnt = area.programs_count ?? 0;
                    return (
                    <tr key={idx} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <select disabled={!canEdit} value={area.target_tipe} onChange={(e) => updateArea(idx, { target_tipe: e.target.value as CeoLetterTargetTipe })} className="input">
                          {TARGET_TIPE_OPTS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          disabled={!canEdit || area.target_tipe === 'Komisaris'}
                          value={area.target_unit}
                          onChange={(e) => updateArea(idx, { target_unit: e.target.value as CeoLetterTargetUnit })}
                          className="input disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {area.target_tipe === 'Komisaris'
                            ? <option value="Komisaris">Komisaris</option>
                            : DIREKSI_UNIT_OPTS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input type="text" disabled={!canEdit} value={area.parameter} onChange={(e) => updateArea(idx, { parameter: e.target.value })} className="input" />
                      </td>
                      <td className="px-4 py-3">
                        <input type="text" disabled={!canEdit} value={area.deskripsi ?? ''} onChange={(e) => updateArea(idx, { deskripsi: e.target.value })} className="input" />
                      </td>
                      <td className="px-4 py-3">
                        <select disabled={!canEdit} value={area.prioritas} onChange={(e) => updateArea(idx, { prioritas: e.target.value as AreaPrioritas })} className={`input font-bold ${priorityClass(area.prioritas)}`}>
                          {PRIORITAS_OPTS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {area.id
                          ? <ProgramsBadge count={cnt} names={area.programs} />
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => removeArea(idx)} className="p-2 rounded-lg text-red-500 hover:bg-red-50" title="Hapus area">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedLetter && (
                <button
                  onClick={() => setShowDeleteLetterConfirm(true)}
                  disabled={removeMut.isPending}
                  className="btn-danger"
                >
                  <Trash2 className="w-4 h-4" /> Hapus
                </button>
              )}
              <button onClick={saveLetter} disabled={upsertMut.isPending || !dirty} className="btn-primary flex items-center gap-2">
                <Save className="w-4 h-4" />
                {upsertMut.isPending ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirm: hapus PDF */}
      {showDeleteFileConfirm && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm" onClick={() => !deleteFileMut.isPending && setShowDeleteFileConfirm(false)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full pointer-events-auto space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">Hapus PDF Lampiran?</p>
                  <p className="text-sm text-slate-500 mt-1">File PDF yang terlampir pada CEO Letter ini akan dihapus permanen. Data teks CEO Letter tetap tersimpan.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteFileConfirm(false)} disabled={deleteFileMut.isPending} className="btn-secondary flex-1 justify-center">Batal</button>
                <button onClick={() => deleteFileMut.mutate()} disabled={deleteFileMut.isPending} className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {deleteFileMut.isPending ? 'Menghapus...' : 'Ya, Hapus PDF'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Confirm: hapus CEO Letter */}
      {showDeleteLetterConfirm && selectedLetter && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm" onClick={() => !removeMut.isPending && setShowDeleteLetterConfirm(false)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full pointer-events-auto space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">Hapus CEO Letter?</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Surat arahan <strong className="text-slate-700">"{selectedLetter.judul}"</strong> beserta seluruh area dan lampiran PDF-nya akan dihapus permanen.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteLetterConfirm(false)} disabled={removeMut.isPending} className="btn-secondary flex-1 justify-center">Batal</button>
                <button onClick={() => removeMut.mutate()} disabled={removeMut.isPending} className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {removeMut.isPending ? 'Menghapus...' : 'Ya, Hapus CEO Letter'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      </>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">CEO Letter</h2>
          <p className="text-sm text-slate-500">Daftar surat arahan Direksi dan Komisaris tahun {tahun}</p>
        </div>
        {canEdit && (
          <button onClick={() => { loadLetter(null); setDirty(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Tambah Surat
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left w-12">#</th>
              <th className="px-4 py-3 text-left">Judul Surat</th>
              <th className="px-4 py-3 text-left w-40">Nomor</th>
              <th className="px-4 py-3 text-left w-40">Tanggal</th>
              <th className="px-4 py-3 text-left w-28">Area</th>
              <th className="px-4 py-3 text-left w-40">Lampiran</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Memuat...</td></tr>
            )}
            {!isLoading && letters.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Belum ada CEO Letter untuk tahun ini.
                </td>
              </tr>
            )}
            {!isLoading && letters.map((letter, idx) => (
              <tr
                key={letter.id}
                onClick={() => loadLetter(letter)}
                className="cursor-pointer transition-colors hover:bg-primary-50/50"
              >
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{idx + 1}</td>
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-900 line-clamp-1">{letter.judul}</p>
                  <p className="text-xs text-slate-500 line-clamp-1">{letter.isi_ringkasan || 'Belum ada ringkasan'}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{letter.nomor_surat || '-'}</td>
                <td className="px-4 py-3 text-slate-600">{fmtDate(letter.tanggal_terbit)}</td>
                <td className="px-4 py-3 text-slate-600">{letter.areas.length} area</td>
                <td className="px-4 py-3">
                  {letter.file_url ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-primary-100 bg-primary-50 text-primary-700 text-xs font-bold">
                      <FileText className="w-3.5 h-3.5" /> PDF tersedia
                    </span>
                  ) : (
                    <span className="text-slate-400">Belum ada</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
