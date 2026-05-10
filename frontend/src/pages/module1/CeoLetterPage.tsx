/**
 * Page CEO Letter — Surat Arahan Direksi
 *
 * Layout:
 *   1. Header form: nomor surat, judul, tanggal, ringkasan
 *   2. Upload PDF (1 file per tahun)
 *   3. Tabel area pengawasan (parameter + prioritas + deskripsi) — add/edit/remove
 *
 * Akses tulis: Kepala SPI & Admin SPI. Lainnya read-only.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Upload, Trash2, Plus, Save, Calendar, ChevronRight,
  AlertTriangle, CheckCircle2, FileDown, Hash, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ceoLetterApi, CeoLetterArea, AreaPrioritas,
} from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import { toInputDate } from '../../utils/dateUtils';

const CURRENT_YEAR = new Date().getFullYear();
const PRIORITAS_OPTS: AreaPrioritas[] = ['Tinggi', 'Sedang', 'Rendah'];

export default function CeoLetterPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'kepala_spi' || role === 'admin_spi';
  const qc = useQueryClient();

  const [tahun, setTahun] = useState(CURRENT_YEAR);
  const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

  const { data, isLoading } = useQuery({
    queryKey: ['ceo-letter', tahun],
    queryFn: () => ceoLetterApi.get(tahun).then((r) => r.data.data),
  });

  const header = data?.header ?? null;

  const [judul, setJudul]                 = useState('');
  const [nomor, setNomor]                 = useState('');
  const [tanggal, setTanggal]             = useState('');
  const [ringkasan, setRingkasan]         = useState('');
  const [areas, setAreas]                 = useState<CeoLetterArea[]>([]);
  const [pendingFile, setPendingFile]     = useState<File | null>(null);
  const [dirty, setDirty]                 = useState(false);

  // Sync from server
  useEffect(() => {
    setJudul(header?.judul ?? '');
    setNomor(header?.nomor_surat ?? '');
    setTanggal(toInputDate(header?.tanggal_terbit));
    setRingkasan(header?.isi_ringkasan ?? '');
    setAreas(data?.areas ?? []);
    setPendingFile(null);
    setDirty(false);
  }, [data, header]);

  const markDirty = () => setDirty(true);

  const addArea = () => {
    setAreas((prev) => [
      ...prev,
      { parameter: '', deskripsi: '', prioritas: 'Sedang', target_tipe: 'Direksi', target_unit: 'Utama', urutan: prev.length },
    ]);
    markDirty();
  };
  const updateArea = (idx: number, patch: Partial<CeoLetterArea>) => {
    setAreas((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
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
        tahun,
        nomor_surat:   nomor || null,
        judul:         judul.trim(),
        tanggal_terbit: tanggal || null,
        isi_ringkasan: ringkasan || null,
        areas: areas
          .filter((a) => (a.parameter ?? '').trim().length > 0)
          .map((a, i) => ({
            parameter: a.parameter.trim(),
            deskripsi: a.deskripsi ?? null,
            prioritas: a.prioritas,
            target_tipe: a.target_tipe ?? 'Direksi',
            target_unit: a.target_tipe === 'Komisaris' ? 'Komisaris' : (a.target_unit ?? 'Utama'),
            urutan:    i,
          })),
        file: pendingFile ?? null,
      }),
    onSuccess: () => {
      toast.success('CEO Letter tersimpan');
      qc.invalidateQueries({ queryKey: ['ceo-letter'] });
      setPendingFile(null);
      setDirty(false);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? 'Gagal menyimpan CEO Letter'),
  });

  const deleteFileMut = useMutation({
    mutationFn: () => ceoLetterApi.deleteFile(header!.id),
    onSuccess: () => {
      toast.success('PDF dihapus');
      qc.invalidateQueries({ queryKey: ['ceo-letter'] });
    },
  });

  const removeMut = useMutation({
    mutationFn: () => ceoLetterApi.remove(header!.id),
    onSuccess: () => {
      toast.success('CEO Letter tahun ini dihapus');
      qc.invalidateQueries({ queryKey: ['ceo-letter'] });
    },
  });

  const fileSizeText = useMemo(() => {
    const s = pendingFile?.size ?? header?.file_size;
    if (!s) return '';
    if (s < 1024) return `${s} B`;
    if (s < 1024 * 1024) return `${(s / 1024).toFixed(1)} KB`;
    return `${(s / 1024 / 1024).toFixed(2)} MB`;
  }, [pendingFile, header]);

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

  return (
    <div className="space-y-6">
      {/* Top panel */}
      <div className="bg-white px-5 sm:px-8 pt-5 pb-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="hover:text-slate-800 cursor-pointer">Perencanaan</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-primary-700 font-bold bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-100">
              CEO Letter — Surat Arahan Direksi
            </span>
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400">
            <div className="flex items-center gap-1.5 pl-3 pr-2 py-2 bg-slate-50 border-r border-slate-200">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider hidden sm:block">Tahun</span>
            </div>
            <select
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
              className="appearance-none bg-transparent text-slate-800 text-sm font-bold pl-3 pr-3 py-2 focus:outline-none cursor-pointer hover:bg-slate-50"
            >
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-100 rounded-xl p-4 flex items-start gap-3">
          <FileText className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold mb-1">CEO Letter — Surat Arahan Direksi Tahun {tahun}</p>
            <p className="text-slate-600">
              Unggah PDF surat dan rinci <b>area/parameter pengawasan</b> yang menjadi fokus tahun ini.
              Area ini akan menjadi rujukan saat menyusun <b>Risiko</b> dan <b>Program Kerja PKPT</b>.
            </p>
          </div>
        </div>
      </div>

      {/* Header form */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Judul Surat <span className="text-red-500">*</span></label>
            <input
              type="text" disabled={!canEdit}
              value={judul}
              onChange={(e) => { setJudul(e.target.value); markDirty(); }}
              className="input w-full"
              placeholder="Contoh: Arahan Pengawasan Direksi Tahun 2026"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nomor Surat</label>
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-slate-400" />
              <input
                type="text" disabled={!canEdit}
                value={nomor}
                onChange={(e) => { setNomor(e.target.value); markDirty(); }}
                className="input w-full"
                placeholder="contoh: 001/DIR/IV/2026"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tanggal Terbit</label>
            <input
              type="date" disabled={!canEdit}
              value={tanggal}
              onChange={(e) => { setTanggal(e.target.value); markDirty(); }}
              className="input w-full"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Ringkasan / Isi Pokok</label>
            <textarea
              disabled={!canEdit}
              value={ringkasan}
              onChange={(e) => { setRingkasan(e.target.value); markDirty(); }}
              className="input w-full min-h-[80px]"
              placeholder="Poin-poin utama arahan Direksi…"
            />
          </div>
        </div>

        {/* Upload PDF */}
        <div className="border-t border-slate-100 pt-4">
          <label className="block text-xs font-semibold text-slate-600 mb-2">Lampiran PDF</label>
          {header?.file_url && !pendingFile ? (
            <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{header.file_name ?? 'PDF Lampiran'}</p>
                <p className="text-xs text-slate-500">{fileSizeText}</p>
              </div>
              <a
                href={header.file_url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-white flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" /> Lihat
              </a>
              {canEdit && (
                <>
                  <label className="px-3 py-1.5 rounded-lg border border-primary-300 text-xs font-medium text-primary-700 hover:bg-primary-50 cursor-pointer flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" /> Ganti
                    <input type="file" accept="application/pdf" className="hidden"
                      onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)} />
                  </label>
                  <button
                    onClick={() => { if (confirm('Hapus PDF lampiran?')) deleteFileMut.mutate(); }}
                    disabled={deleteFileMut.isPending}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                </>
              )}
            </div>
          ) : pendingFile ? (
            <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{pendingFile.name}</p>
                <p className="text-xs text-amber-700">Belum diunggah · {fileSizeText} · klik <b>Simpan</b> untuk mengupload</p>
              </div>
              <button
                onClick={() => setPendingFile(null)}
                className="px-2 py-1.5 rounded-lg text-slate-500 hover:bg-white"
                title="Batalkan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            canEdit ? (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-6 cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 text-slate-500 hover:text-primary-700 transition-colors">
                <Upload className="w-5 h-5" />
                <span className="text-sm font-medium">Pilih file PDF (maks. 10 MB)</span>
                <input type="file" accept="application/pdf" className="hidden"
                  onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)} />
              </label>
            ) : (
              <p className="text-sm text-slate-400 italic">Belum ada lampiran PDF.</p>
            )
          )}
        </div>
      </div>

      {/* Areas Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">Area / Parameter Pengawasan</h2>
            <p className="text-xs text-slate-500 mt-0.5">Daftar fokus pengawasan tahun {tahun}</p>
          </div>
          {canEdit && (
            <button
              onClick={addArea}
              className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Tambah Area
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left w-12">#</th>
                <th className="px-4 py-3 text-left">Parameter</th>
                <th className="px-4 py-3 text-left">Deskripsi</th>
                <th className="px-4 py-3 text-left w-36">Prioritas</th>
                {canEdit && <th className="px-4 py-3 text-right w-16">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={canEdit ? 5 : 4} className="px-4 py-6 text-center text-slate-400">Memuat...</td></tr>
              )}
              {!isLoading && areas.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-4 py-10 text-center text-slate-400">
                    Belum ada area pengawasan. {canEdit && 'Klik "Tambah Area" untuk mulai.'}
                  </td>
                </tr>
              )}
              {!isLoading && areas.map((a, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-2">
                    <input
                      type="text" disabled={!canEdit}
                      value={a.parameter}
                      onChange={(e) => updateArea(idx, { parameter: e.target.value })}
                      className="input w-full"
                      placeholder="contoh: Rute, Efisiensi, Pengeluaran"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text" disabled={!canEdit}
                      value={a.deskripsi ?? ''}
                      onChange={(e) => updateArea(idx, { deskripsi: e.target.value })}
                      className="input w-full"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      disabled={!canEdit}
                      value={a.prioritas}
                      onChange={(e) => updateArea(idx, { prioritas: e.target.value as AreaPrioritas })}
                      className={`input w-full ${
                        a.prioritas === 'Tinggi' ? 'text-red-700' :
                        a.prioritas === 'Sedang' ? 'text-amber-700' : 'text-slate-600'
                      }`}
                    >
                      {PRIORITAS_OPTS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => removeArea(idx)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            {dirty
              ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> <span>Ada perubahan belum tersimpan</span></>
              : header
                ? <><CheckCircle2 className="w-4 h-4 text-green-500" /> <span>Tersimpan</span></>
                : <span>Belum ada CEO Letter untuk tahun ini.</span>}
          </div>
          <div className="flex items-center gap-2">
            {header && (
              <button
                onClick={() => { if (confirm(`Hapus CEO Letter tahun ${tahun}? Tindakan ini tidak bisa dibatalkan dengan mudah.`)) removeMut.mutate(); }}
                disabled={removeMut.isPending}
                className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Hapus
              </button>
            )}
            <button
              onClick={() => {
                if (!judul.trim()) { toast.error('Judul wajib diisi'); return; }
                upsertMut.mutate();
              }}
              disabled={upsertMut.isPending || !dirty}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {upsertMut.isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
