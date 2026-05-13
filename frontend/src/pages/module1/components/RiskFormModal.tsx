import { useState, useEffect, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  X, Loader2, Save, AlertCircle, ChevronDown, CheckCircle2,
  Fingerprint, Building2, Target, AlertTriangle, Activity, ShieldCheck
} from 'lucide-react';
import { risksApi, organisasiApi, settingsApi } from '../../../services/api';
import { RiskData, SasaranKorporat } from '../../../types';
import toast from 'react-hot-toast';

interface Props {
  tahun: number;
  editData?: RiskData | null;
  onClose: () => void;
  onSuccess: () => void;
}

// 23 known RCSA score-level combinations
const SCORE_OPTIONS: [number, string][] = [
  [54,'E'],[53,'T'],[52,'MT'],[51,'M'],[45,'E'],
  [44,'T'],[43,'MT'],[42,'M'],[41,'RM'],[35,'T'],
  [34,'MT'],[33,'M'],[32,'M'],[31,'R'],[25,'MT'],
  [24,'M'],[23,'M'],[22,'RM'],[21,'R'],[14,'RM'],
  [13,'R'],[12,'R'],[11,'R'],
];

const LEVEL_LABEL: Record<string, string> = {
  E: 'Ekstrim', T: 'Tinggi', MT: 'Menengah Tinggi', M: 'Menengah', RM: 'Rendah Menengah', R: 'Rendah',
};

const PARAM_KEMUNGKINAN = ['Frekuensi', 'Dampak', 'Probabilitas', 'Unknown'];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

function buildScoreLabel(skor: number, level: string) {
  return `${skor} (${level}) — ${LEVEL_LABEL[level] ?? level}`;
}

function scoreKey(skor?: number | null, level?: string | null) {
  if (!skor && !level) return '';
  return `${skor ?? ''}_${level ?? ''}`;
}

interface FormState {
  id_risiko: string;
  tahun: number;
  direktorat_id: string;
  divisi_id: string;
  departemen_id: string;
  sasaran_korporat_id: string;
  sasaran_bidang: string;
  hos_kategori_id: string;
  sasaran_strategis_id: string;
  nama_risiko: string;
  parameter_kemungkinan: string;
  inherent_key: string;
  target_key: string;
  realisasi_key: string;
  pelaksanaan_mitigasi: string;
  penyebab_internal: string;
  penyebab_eksternal: string;
}

export default function RiskFormModal({ tahun, editData, onClose, onSuccess }: Props) {
  const isEdit = !!editData;
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>({
    id_risiko:             '',
    tahun,
    direktorat_id:         '',
    divisi_id:             '',
    departemen_id:         '',
    sasaran_korporat_id:   '',
    sasaran_bidang:        '',
    hos_kategori_id:       '',
    sasaran_strategis_id:  '',
    nama_risiko:           '',
    parameter_kemungkinan: '',
    inherent_key:          '',
    target_key:            '',
    realisasi_key:         '',
    pelaksanaan_mitigasi:  '',
    penyebab_internal:     '',
    penyebab_eksternal:    '',
  });

  useEffect(() => {
    if (editData) {
      setForm({
        id_risiko:             editData.id_risiko ?? '',
        tahun:                 editData.tahun ?? tahun,
        direktorat_id:         editData.direktorat_id ?? '',
        divisi_id:             editData.divisi_id ?? '',
        departemen_id:         editData.departemen_id ?? '',
        sasaran_korporat_id:   editData.sasaran_korporat_id ?? '',
        sasaran_bidang:        editData.sasaran_bidang ?? '',
        hos_kategori_id:       editData.hos_kategori_id ?? '',
        sasaran_strategis_id:  editData.sasaran_strategis_id ?? '',
        nama_risiko:           editData.nama_risiko ?? '',
        parameter_kemungkinan: editData.parameter_kemungkinan ?? '',
        inherent_key:          scoreKey(editData.skor_inherent, editData.level_inherent),
        target_key:            scoreKey(editData.skor_target, editData.level_target),
        realisasi_key:         scoreKey(editData.skor_realisasi, editData.level_realisasi),
        pelaksanaan_mitigasi:  editData.pelaksanaan_mitigasi ?? '',
        penyebab_internal:     editData.penyebab_internal ?? '',
        penyebab_eksternal:    editData.penyebab_eksternal ?? '',
      });
    }
  }, [editData, tahun]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleDirektoratChange = (id: string) => {
    setForm((f) => ({ ...f, direktorat_id: id, divisi_id: '', departemen_id: '' }));
  };
  const handleDivisiChange = (id: string) => {
    setForm((f) => ({ ...f, divisi_id: id, departemen_id: '' }));
  };

  // ── Data fetching ──
  const { data: direktorats = [] } = useQuery({
    queryKey: ['direktorats'],
    queryFn: async () => {
      const r = await organisasiApi.getDirektorats();
      return r.data.data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: divisis = [] } = useQuery({
    queryKey: ['divisis', form.direktorat_id],
    queryFn: async () => {
      const r = await organisasiApi.getDivisis(form.direktorat_id || undefined);
      return r.data.data ?? [];
    },
    enabled: !!form.direktorat_id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: departemens = [] } = useQuery({
    queryKey: ['departemens', form.divisi_id],
    queryFn: async () => {
      const r = await organisasiApi.getDepartemens(form.divisi_id || undefined);
      return r.data.data ?? [];
    },
    enabled: !!form.divisi_id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sasaranList = [] } = useQuery({
    queryKey: ['sasaran-korporat'],
    queryFn: async () => {
      const r = await risksApi.getSasaranKorporat();
      return (r.data.data ?? []) as SasaranKorporat[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // House of Strategy — kategori (perspektif) per tahun
  const { data: hosKategoris = [] } = useQuery({
    queryKey: ['hos-kategori', form.tahun],
    queryFn: async () => {
      const r = await settingsApi.getHosKategoris(form.tahun);
      return r.data.data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Sasaran strategis — filter by tahun + (optional) kategori
  const { data: sasaranStrategisList = [] } = useQuery({
    queryKey: ['sasaran-strategis', form.tahun, form.hos_kategori_id],
    queryFn: async () => {
      const r = await settingsApi.getSasaranStrategis({
        tahun: form.tahun,
        kategori_id: form.hos_kategori_id || undefined,
      });
      return r.data.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: form.tahun > 0,
  });

  function parseKey(key: string): { skor?: number; level?: string } {
    if (!key) return {};
    const [s, l] = key.split('_');
    return { skor: Number(s) || undefined, level: l || undefined };
  }

  // ── Mutation ──
  const saveMut = useMutation({
    mutationFn: () => {
      const inherent = parseKey(form.inherent_key);
      const target   = parseKey(form.target_key);
      const real     = parseKey(form.realisasi_key);

      const payload: Partial<RiskData> = {
        id_risiko:             form.id_risiko.trim() || undefined,
        tahun:                 form.tahun,
        direktorat_id:         form.direktorat_id || undefined,
        divisi_id:             form.divisi_id || undefined,
        departemen_id:         form.departemen_id || undefined,
        sasaran_korporat_id:   form.sasaran_korporat_id || undefined,
        sasaran_bidang:        form.sasaran_bidang || undefined,
        hos_kategori_id:       form.hos_kategori_id || undefined,
        sasaran_strategis_id:  form.sasaran_strategis_id || undefined,
        nama_risiko:           form.nama_risiko.trim(),
        parameter_kemungkinan: form.parameter_kemungkinan || undefined,
        skor_inherent:         inherent.skor,
        level_inherent:        inherent.level as RiskData['level_inherent'],
        tingkat_risiko_inherent: form.inherent_key ? `${inherent.skor} (${inherent.level})` : undefined,
        skor_target:           target.skor,
        level_target:          target.level as RiskData['level_target'],
        tingkat_risiko_target: form.target_key ? `${target.skor} (${target.level})` : undefined,
        skor_realisasi:        real.skor,
        level_realisasi:       real.level as RiskData['level_realisasi'],
        realisasi_tingkat_risiko: form.realisasi_key ? `${real.skor} (${real.level})` : undefined,
        pelaksanaan_mitigasi:  form.pelaksanaan_mitigasi || undefined,
        penyebab_internal:     form.penyebab_internal || undefined,
        penyebab_eksternal:    form.penyebab_eksternal || undefined,
      };

      return isEdit ? risksApi.update(editData!.id, payload) : risksApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks'] });
      queryClient.invalidateQueries({ queryKey: ['annual-plans'] });
      toast.success(isEdit ? 'Risiko berhasil diperbarui' : 'Risiko berhasil ditambahkan');
      onSuccess();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Gagal menyimpan data risiko';
      toast.error(msg);
    },
  });

  const isValid = form.nama_risiko.trim() !== '' && form.tahun > 0;

  // ── Input Styling ──
  const inputClass = "w-full text-[14px] border border-slate-300 bg-white rounded-lg px-3.5 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed appearance-none";

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div className="bg-slate-50 rounded-[20px] shadow-2xl w-full max-w-3xl pointer-events-auto flex flex-col max-h-[95vh]">

          {/* ── Header ── */}
          <div className="px-4 sm:px-8 py-5 border-b border-slate-200 bg-white rounded-t-[20px] flex items-center justify-between flex-shrink-0 z-10">
            <div>
              <h2 className="font-bold text-slate-800 text-xl">
                {isEdit ? 'Edit Data Risiko' : 'Tambah Risiko Baru'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Lengkapi seluruh informasi form ke bawah
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Body (Card Layout + Vertical Stack) ── */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar">

            {/* 1. Identifikasi Dasar */}
            <Card title="Identifikasi Dasar" icon={Fingerprint}>
              <Field label="ID Risiko">
                <input value={form.id_risiko} onChange={(e) => set('id_risiko', e.target.value.toUpperCase())} placeholder="Contoh: RR-KTP-2025-002" className={inputClass} />
              </Field>
              <Field label="Tahun" required>
                <div className="relative">
                  <select value={form.tahun} onChange={(e) => set('tahun', Number(e.target.value))} disabled={isEdit} className={inputClass}>
                    {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </Field>
            </Card>

            {/* 2. Struktur Organisasi */}
            <Card title="Struktur Organisasi" icon={Building2}>
              <Field label="Direktorat">
                <div className="relative">
                  <select value={form.direktorat_id} onChange={(e) => handleDirektoratChange(e.target.value)} className={inputClass}>
                    <option value="">— Pilih Direktorat —</option>
                    {direktorats.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </Field>
              <Field label="Divisi">
                <div className="relative">
                  <select value={form.divisi_id} onChange={(e) => handleDivisiChange(e.target.value)} disabled={!form.direktorat_id} className={inputClass}>
                    <option value="">— Pilih Divisi —</option>
                    {divisis.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </Field>
              <Field label="Departemen">
                <div className="relative">
                  <select value={form.departemen_id} onChange={(e) => set('departemen_id', e.target.value)} disabled={!form.divisi_id} className={inputClass}>
                    <option value="">— Pilih Departemen —</option>
                    {departemens.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </Field>
            </Card>

            {/* 3. Sasaran */}
            <Card title="Target & Sasaran" icon={Target}>
              <Field label="House of Strategy — Perspektif">
                <div className="relative">
                  <select
                    value={form.hos_kategori_id}
                    onChange={(e) => setForm((f) => ({ ...f, hos_kategori_id: e.target.value, sasaran_strategis_id: '' }))}
                    className={inputClass}
                  >
                    <option value="">— Pilih Perspektif HoS —</option>
                    {hosKategoris.map((k) => (
                      <option key={k.id} value={k.id}>{k.kode} — {k.nama_perspektif}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                {hosKategoris.length === 0 && (
                  <p className="text-[12px] text-amber-600 mt-1">
                    Belum ada master perspektif HoS untuk tahun {form.tahun}. Buat dulu di <b>Pengaturan Sistem</b>.
                  </p>
                )}
              </Field>
              <Field label="Sasaran Strategis">
                <div className="relative">
                  <select
                    value={form.sasaran_strategis_id}
                    onChange={(e) => set('sasaran_strategis_id', e.target.value)}
                    disabled={sasaranStrategisList.length === 0}
                    className={inputClass}
                  >
                    <option value="">— Pilih Sasaran Strategis —</option>
                    {(() => {
                      const isChild = (kode?: string | null) => !!kode && kode.includes('.');
                      const byKode = (a: { kode?: string | null }, b: { kode?: string | null }) =>
                        (a.kode ?? '').localeCompare(b.kode ?? '', 'id', { numeric: true });
                      const parents  = sasaranStrategisList.filter((s) => !isChild(s.kode)).sort(byKode);
                      const children = sasaranStrategisList.filter((s) =>  isChild(s.kode)).sort(byKode);
                      const pfx = (kode: string) => { const m = kode.match(/^([A-Za-z]+)(\d+)$/); return m ? `${m[1]}.${m[2]}.` : `${kode}.`; };
                      const els: React.ReactNode[] = [];
                      for (const p of parents) {
                        els.push(
                          <option key={`hdr-${p.id}`} value={p.id} disabled>
                            {p.kode ? `${p.kode} — ${p.nama}` : p.nama}
                          </option>
                        );
                        for (const c of children.filter((ch) => ch.kode?.startsWith(pfx(p.kode ?? '')))) {
                          els.push(<option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>);
                        }
                      }
                      for (const c of children.filter((ch) => !parents.some((p) => ch.kode?.startsWith(pfx(p.kode ?? ''))))) {
                        els.push(<option key={c.id} value={c.id}>{c.kode} — {c.nama}</option>);
                      }
                      return els;
                    })()}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </Field>
              <Field label="Sasaran Korporat">
                <div className="relative">
                  <select value={form.sasaran_korporat_id} onChange={(e) => set('sasaran_korporat_id', e.target.value)} className={inputClass}>
                    <option value="">— Pilih Sasaran Korporat —</option>
                    {sasaranList.map((s) => <option key={s.id} value={s.id}>{s.kode} — {s.nama}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </Field>
              <Field label="Sasaran Bidang">
                <textarea rows={2} value={form.sasaran_bidang} onChange={(e) => set('sasaran_bidang', e.target.value)} placeholder="Deskripsi sasaran bidang..." className={`${inputClass} resize-none`} />
              </Field>
            </Card>

            {/* 4. Detail Risiko */}
            <Card title="Detail Risiko & Peluang" icon={AlertTriangle}>
              <Field label="Nama Risiko / Peluang" required>
                <textarea rows={3} value={form.nama_risiko} onChange={(e) => set('nama_risiko', e.target.value)} placeholder="Tuliskan nama risiko spesifik..." className={`${inputClass} resize-none`} />
              </Field>
              <Field label="Parameter Kemungkinan">
                <div className="relative">
                  <select value={form.parameter_kemungkinan} onChange={(e) => set('parameter_kemungkinan', e.target.value)} className={inputClass}>
                    <option value="">— Pilih Parameter —</option>
                    {PARAM_KEMUNGKINAN.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </Field>
            </Card>

            {/* 5. Tingkat Risiko */}
            <Card title="Evaluasi Tingkat Risiko" icon={Activity}>
              <Field label="Skor Inherent">
                <div className="relative">
                  <select value={form.inherent_key} onChange={(e) => set('inherent_key', e.target.value)} className={inputClass}>
                    <option value="">— Pilih Skor —</option>
                    {SCORE_OPTIONS.map(([skor, level]) => <option key={`${skor}_${level}`} value={`${skor}_${level}`}>{buildScoreLabel(skor, level)}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </Field>
              <Field label="Skor Target">
                <div className="relative">
                  <select value={form.target_key} onChange={(e) => set('target_key', e.target.value)} className={inputClass}>
                    <option value="">— Pilih Skor —</option>
                    {SCORE_OPTIONS.map(([skor, level]) => <option key={`${skor}_${level}`} value={`${skor}_${level}`}>{buildScoreLabel(skor, level)}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </Field>
              <Field label="Skor Realisasi Eksisting">
                <div className="relative">
                  <select value={form.realisasi_key} onChange={(e) => set('realisasi_key', e.target.value)} className={inputClass}>
                    <option value="">— Pilih Skor —</option>
                    {SCORE_OPTIONS.map(([skor, level]) => <option key={`${skor}_${level}`} value={`${skor}_${level}`}>{buildScoreLabel(skor, level)}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </Field>
            </Card>

            {/* 6. Mitigasi & Penyebab */}
            <Card title="Mitigasi & Faktor Penyebab" icon={ShieldCheck}>
              <Field label="Pelaksanaan Mitigasi Risiko">
                <textarea rows={3} value={form.pelaksanaan_mitigasi} onChange={(e) => set('pelaksanaan_mitigasi', e.target.value)} placeholder="Jelaskan rencana mitigasi..." className={`${inputClass} resize-none`} />
              </Field>
              <Field label="Faktor Penyebab Internal">
                <textarea rows={2} value={form.penyebab_internal} onChange={(e) => set('penyebab_internal', e.target.value)} placeholder="Faktor dari dalam..." className={`${inputClass} resize-none`} />
              </Field>
              <Field label="Faktor Penyebab Eksternal">
                <textarea rows={2} value={form.penyebab_eksternal} onChange={(e) => set('penyebab_eksternal', e.target.value)} placeholder="Faktor dari luar..." className={`${inputClass} resize-none`} />
              </Field>
            </Card>

          </div>

          {/* ── Footer ── */}
          <div className="px-4 sm:px-8 py-5 border-t border-slate-200 flex items-center justify-between flex-shrink-0 bg-white rounded-b-[20px] z-10">
            <div className="flex-1">
              {!isValid && form.nama_risiko === '' && (
                <div className="flex items-center gap-1.5 text-sm text-red-500 font-medium">
                  <AlertCircle className="w-4 h-4" />
                  <span>Nama Risiko wajib diisi</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-5 py-2.5 text-[14px] font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                Batal
              </button>
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !isValid}
                className="px-6 py-2.5 text-[14px] font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isEdit ? 'Simpan Perubahan' : 'Simpan Data'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ──

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <Icon className="w-5 h-5 text-slate-400" />
        <h3 className="text-[15px] font-bold text-slate-800">
          {title}
        </h3>
      </div>
      <div className="flex flex-col space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode; }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-slate-700 flex items-center">
        {label}
        {required && <span className="text-red-500 ml-1 text-[13px]">*</span>}
      </label>
      {children}
    </div>
  );
}
