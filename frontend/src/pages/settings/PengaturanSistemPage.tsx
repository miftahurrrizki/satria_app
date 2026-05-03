/**
 * Pengaturan Sistem — Master Data Modul 1
 *
 * Akses: kepala_spi, admin_spi (untuk full CRUD)
 * Sasaran Strategis bisa di-CRUD oleh seluruh user SPI.
 *
 * 4 Tab:
 * 1. House of Strategy   → 4 perspektif BSC per tahun
 * 2. Sasaran Strategis   → child HoS, free-input
 * 3. Bobot Peran         → bobot Man-Days per peran
 * 4. Tipe Penugasan      → sub-kategori program
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Target, Scale, Tags, Calendar, Settings, Plus, ChevronRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  settingsApi, HosKategori, SasaranStrategis, BobotPeran, KelompokPenugasan,
} from '../../services/api';
import { useAuthStore } from '../../store/auth.store';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

type TabId = 'hos' | 'sasaran' | 'bobot' | 'tipe';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'hos',     label: 'House of Strategy', icon: Layers },
  { id: 'sasaran', label: 'Sasaran Strategis', icon: Target },
  { id: 'bobot',   label: 'Bobot Peran',       icon: Scale  },
  { id: 'tipe',    label: 'Kelompok Penugasan', icon: Tags   },
];

export default function PengaturanSistemPage() {
  const [activeTab, setActiveTab] = useState<TabId>('hos');
  const [tahun, setTahun] = useState(CURRENT_YEAR);

  return (
    <div className="space-y-6 pb-8">

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">

        {/* Title & Icon Header */}
        <div className="flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 bg-slate-100 rounded-xl border border-slate-200/60">
            <Settings className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Pengaturan Sistem</h1>
            <p className="text-sm text-slate-500">Master data konfigurasi Modul Perencanaan</p>
          </div>
        </div>

        {/* Filter Tahun — same style as Modul 1 (PKPTPage) */}
        {(activeTab === 'hos' || activeTab === 'sasaran' || activeTab === 'bobot') && (
          <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400 transition-all">
            <div className="flex items-center gap-1.5 pl-3 pr-2 py-2 bg-slate-50 border-r border-slate-200">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider hidden sm:block">
                Tahun
              </span>
            </div>
            <div className="relative">
              <select
                value={tahun}
                onChange={(e) => setTahun(Number(e.target.value))}
                className="appearance-none bg-transparent text-slate-800 text-sm font-bold pl-3 pr-8 py-2 focus:outline-none cursor-pointer hover:bg-slate-50 transition-colors"
              >
                {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronRight className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* TABS NAVIGATION */}
      <div className="border-b border-slate-200 mt-2">
        <nav className="flex gap-8 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2.5 pb-3 text-sm font-semibold border-b-[2px] transition-all whitespace-nowrap ${
                  active
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${active ? 'text-primary-600' : 'text-slate-400'}`} strokeWidth={2} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB CONTENT */}
      <div className="pt-2">
        {activeTab === 'hos'     && <HosTab tahun={tahun} />}
        {activeTab === 'sasaran' && <SasaranTab tahun={tahun} />}
        {activeTab === 'bobot'   && <BobotTab tahun={tahun} />}
        {activeTab === 'tipe'    && <KelompokTab />}
      </div>
      
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  TAB 1: HOUSE OF STRATEGY KATEGORI
// ════════════════════════════════════════════════════════════
function HosTab({ tahun }: { tahun: number }) {
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'kepala_spi' || role === 'admin_spi';
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<HosKategori> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HosKategori | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['hos-kategori', tahun],
    queryFn: () => settingsApi.getHosKategoris(tahun).then((r) => r.data.data ?? []),
  });

  const createMut = useMutation({
    mutationFn: (payload: Partial<HosKategori>) => settingsApi.createHosKategori({ ...payload, tahun }),
    onSuccess: () => { toast.success('Kategori ditambahkan'); qc.invalidateQueries({ queryKey: ['hos-kategori'] }); setEditing(null); },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'Gagal menyimpan'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...payload }: Partial<HosKategori> & { id: string }) =>
      settingsApi.updateHosKategori(id, payload),
    onSuccess: () => { toast.success('Tersimpan'); qc.invalidateQueries({ queryKey: ['hos-kategori'] }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: settingsApi.deleteHosKategori,
    onSuccess: () => { toast.success('Perspektif dihapus'); qc.invalidateQueries({ queryKey: ['hos-kategori'] }); setDeleteTarget(null); },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'Gagal menghapus'),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-600">4 perspektif Balanced Scorecard tahun {tahun}.</p>
        {canEdit && (
          <button
            onClick={() => setEditing({ kode: '', nama_perspektif: '', urutan: 0 })}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> Tambah Perspektif
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Urutan</th>
              <th className="px-4 py-3 text-left">Kode</th>
              <th className="px-4 py-3 text-left">Nama Perspektif</th>
              <th className="px-4 py-3 text-left">Deskripsi</th>
              {canEdit && <th className="px-4 py-3 text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Memuat...</td></tr>}
            {!isLoading && (data ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada perspektif untuk tahun ini.</td></tr>
            )}
            {(data ?? []).map((k) => (
              <tr key={k.id}>
                <td className="px-4 py-3">{k.urutan}</td>
                <td className="px-4 py-3 font-mono text-xs">{k.kode}</td>
                <td className="px-4 py-3 font-medium">{k.nama_perspektif}</td>
                <td className="px-4 py-3 text-slate-500">{k.deskripsi ?? '-'}</td>
                {canEdit && (
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => setEditing(k)} className="text-primary-600 hover:underline text-xs font-medium">Edit</button>
                    <button onClick={() => setDeleteTarget(k)} className="text-red-600 hover:underline text-xs font-medium">Hapus</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <FormModal
          title={editing.id ? 'Edit Perspektif' : 'Tambah Perspektif'}
          onClose={() => setEditing(null)}
          onSubmit={() => editing.id
            ? updateMut.mutate({ ...editing, id: editing.id! })
            : createMut.mutate(editing)}
          loading={createMut.isPending || updateMut.isPending}
        >
          <FormRow label="Kode" required>
            <input className="input" value={editing.kode ?? ''} onChange={(e) => setEditing({ ...editing, kode: e.target.value })} placeholder="F | C | IBP | LG" />
          </FormRow>
          <FormRow label="Nama Perspektif" required>
            <input className="input" value={editing.nama_perspektif ?? ''} onChange={(e) => setEditing({ ...editing, nama_perspektif: e.target.value })} />
          </FormRow>
          <FormRow label="Urutan">
            <input type="number" className="input" value={editing.urutan ?? 0} onChange={(e) => setEditing({ ...editing, urutan: Number(e.target.value) })} />
          </FormRow>
          <FormRow label="Deskripsi">
            <textarea className="input min-h-[64px]" value={editing.deskripsi ?? ''} onChange={(e) => setEditing({ ...editing, deskripsi: e.target.value })} />
          </FormRow>
        </FormModal>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          label={`Perspektif "${deleteTarget.nama_perspektif}"`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMut.isPending}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  TAB 2: SASARAN STRATEGIS
// ════════════════════════════════════════════════════════════

// Sasaran dianggap "anak" jika kodenya mengandung titik (F.1.1, IBP.2.1, dsb)
function isChildKode(kode: string | null) {
  return !!kode && kode.includes('.');
}

// Konversi kode induk (C1, IBP2) ke prefix anak (C.1., IBP.2.)
function childPrefix(parentKode: string): string {
  const m = parentKode.match(/^([A-Za-z]+)(\d+)$/);
  return m ? `${m[1]}.${m[2]}.` : `${parentKode}.`;
}

function SasaranTab({ tahun }: { tahun: number }) {
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = ['kepala_spi', 'admin_spi', 'pengendali_teknis', 'anggota_tim'].includes(role ?? '');
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<SasaranStrategis> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SasaranStrategis | null>(null);

  const { data: kategoris } = useQuery({
    queryKey: ['hos-kategori', tahun],
    queryFn: () => settingsApi.getHosKategoris(tahun).then((r) => r.data.data ?? []),
  });

  // Selalu ambil semua (tidak difilter per kategori), biar grouping di client
  const { data, isLoading } = useQuery({
    queryKey: ['sasaran-strategis', tahun],
    queryFn: () => settingsApi.getSasaranStrategis({ tahun }).then((r) => r.data.data ?? []),
  });

  const createMut = useMutation({
    mutationFn: (p: Partial<SasaranStrategis>) => settingsApi.createSasaranStrategis({ ...p, tahun }),
    onSuccess: () => { toast.success('Sasaran ditambahkan'); qc.invalidateQueries({ queryKey: ['sasaran-strategis'] }); setEditing(null); },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'Gagal menyimpan'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...p }: Partial<SasaranStrategis> & { id: string }) => settingsApi.updateSasaranStrategis(id, p),
    onSuccess: () => { toast.success('Tersimpan'); qc.invalidateQueries({ queryKey: ['sasaran-strategis'] }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: settingsApi.deleteSasaranStrategis,
    onSuccess: () => { toast.success('Sasaran dihapus'); qc.invalidateQueries({ queryKey: ['sasaran-strategis'] }); setDeleteTarget(null); },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'Gagal menghapus'),
  });

  // Group sasaran per perspektif — interleaved: parent → its children → next parent → …
  const grouped = useMemo(() => {
    const all = data ?? [];
    return (kategoris ?? []).map((kat) => {
      const katItems = all.filter((s) => s.kategori_id === kat.id);
      const byKode = (a: SasaranStrategis, b: SasaranStrategis) =>
        (a.kode ?? '').localeCompare(b.kode ?? '', 'id', { numeric: true });
      const parents  = katItems.filter((s) => !isChildKode(s.kode)).sort(byKode);
      const children = katItems.filter((s) =>  isChildKode(s.kode)).sort(byKode);
      const sorted: SasaranStrategis[] = [];
      for (const p of parents) {
        sorted.push(p);
        sorted.push(...children.filter((c) => c.kode?.startsWith(childPrefix(p.kode ?? ''))));
      }
      // orphan children with no matching parent
      sorted.push(...children.filter((c) => !parents.some((p) => c.kode?.startsWith(childPrefix(p.kode ?? '')))));
      return { kategori: kat, items: sorted };
    }).filter(() => true);
  }, [data, kategoris]);

  const totalSasaran = (data ?? []).length;

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">
            Total <b className="text-slate-800">{totalSasaran}</b> sasaran strategis tahun {tahun}
          </span>
          {isLoading && <span className="text-xs text-slate-400">Memuat...</span>}
        </div>
        {canEdit && (
          <button
            onClick={() => setEditing({ kategori_id: kategoris?.[0]?.id ?? '', kode: '', nama: '' })}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> Tambah Sasaran
          </button>
        )}
      </div>

      {/* Grouped cards per perspektif */}
      {isLoading ? (
        <div className="card p-8 text-center text-slate-400">Memuat...</div>
      ) : (kategoris ?? []).length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          Belum ada perspektif. Tambahkan perspektif di tab House of Strategy terlebih dahulu.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ kategori, items }) => (
            <div key={kategori.id} className="card overflow-hidden border border-slate-200">
              {/* Perspektif header */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-black text-slate-700 font-mono">{kategori.kode}</span>
                  <span className="text-sm font-semibold text-slate-700">{kategori.nama_perspektif}</span>
                  <span className="badge text-[11px] bg-slate-100 text-slate-700">{items.length} sasaran</span>
                </div>
                {canEdit && (
                  <button
                    onClick={() => setEditing({ kategori_id: kategori.id, kode: '', nama: '' })}
                    className="text-xs font-semibold text-slate-700 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah di sini
                  </button>
                )}
              </div>

              {/* Items */}
              {items.length === 0 ? (
                <div className="px-4 py-6 text-center text-slate-400 text-sm">
                  Belum ada sasaran untuk perspektif ini.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {items.map((s) => {
                    const isChild = isChildKode(s.kode);
                    return (
                      <div
                        key={s.id}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors ${isChild ? 'pl-10' : ''}`}
                      >
                        {/* Indentation indicator */}
                        {isChild && (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 -ml-6" />
                        )}

                        {/* Kode + Nama inline (same line, kode never wraps) */}
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <code className={`text-xs font-bold whitespace-nowrap flex-shrink-0 ${isChild ? 'text-slate-500' : 'text-slate-700 font-black'}`}>
                            {s.kode ?? '—'}
                          </code>
                          <p className={`text-sm truncate ${isChild ? 'text-slate-600' : 'text-slate-800 font-semibold'}`}>
                            {s.nama}
                          </p>
                        </div>

                        {/* Dibuat oleh */}
                        <span className="text-[11px] text-slate-400 flex-shrink-0 hidden sm:block">
                          {s.created_by_nama ?? '—'}
                        </span>

                        {/* Aksi */}
                        {canEdit && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => setEditing(s)}
                              className="px-2.5 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteTarget(s)}
                              className="px-2.5 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              Hapus
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {editing && (
        <SasaranFormModal
          editing={editing}
          kategoris={kategoris ?? []}
          allSasaran={data ?? []}
          onClose={() => setEditing(null)}
          onSubmit={() => editing.id
            ? updateMut.mutate({ ...editing, id: editing.id! })
            : createMut.mutate(editing)}
          onChange={setEditing}
          loading={createMut.isPending || updateMut.isPending}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          label={`Sasaran strategis "${deleteTarget.nama}"`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id!)}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMut.isPending}
        />
      )}
    </div>
  );
}

function SasaranFormModal({
  editing, kategoris, allSasaran, onClose, onSubmit, onChange, loading,
}: {
  editing: Partial<SasaranStrategis>;
  kategoris: HosKategori[];
  allSasaran: SasaranStrategis[];
  onClose: () => void;
  onSubmit: () => void;
  onChange: (v: Partial<SasaranStrategis>) => void;
  loading?: boolean;
}) {
  const isEdit = !!editing.id;

  // Sasaran induk = semua sasaran di perspektif yang sama, yang bukan child (tidak ada titik)
  const parentOptions = useMemo(() =>
    allSasaran.filter(
      (s) => s.kategori_id === editing.kategori_id && !isChildKode(s.kode) && s.id !== editing.id,
    ),
  [allSasaran, editing.kategori_id, editing.id]);

  // Perspektif yang dipilih
  const selectedKat = kategoris.find((k) => k.id === editing.kategori_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800">{isEdit ? 'Edit Sasaran Strategis' : 'Tambah Sasaran Strategis'}</h3>
            {selectedKat && (
              <p className="text-xs text-slate-400 mt-0.5">
                Perspektif: <b className="text-slate-600">{selectedKat.kode} — {selectedKat.nama_perspektif}</b>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">

          {/* Perspektif */}
          <FormRow label="Perspektif" required>
            <select
              className="input"
              value={editing.kategori_id ?? ''}
              onChange={(e) => onChange({ ...editing, kategori_id: e.target.value, kode: '' })}
            >
              <option value="">— Pilih perspektif —</option>
              {kategoris.map((k) => (
                <option key={k.id} value={k.id}>{k.kode} — {k.nama_perspektif}</option>
              ))}
            </select>
          </FormRow>

          {/* Sasaran Induk (opsional) — muncul jika ada parent options */}
          {editing.kategori_id && parentOptions.length > 0 && (
            <FormRow label="Sasaran Induk">
              <select
                className="input"
                value={editing.kode?.split('.').slice(0, -1).join('.') ?? ''}
                onChange={(e) => {
                  const parentKode = e.target.value;
                  if (parentKode) {
                    // Auto-set kode prefix berdasarkan parent
                    const parent = allSasaran.find((s) => s.kode === parentKode);
                    const parentNum = parentKode.replace(/\D/g, '');
                    onChange({ ...editing, kode: `${selectedKat?.kode ?? ''}.${parentNum}.` });
                  } else {
                    onChange({ ...editing, kode: '' });
                  }
                }}
              >
                <option value="">— Sasaran ini adalah induk (top-level) —</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.kode ?? ''}>
                    {p.kode} — {p.nama}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Pilih induk jika ini adalah sub-sasaran (contoh: F.1.1 di bawah F1).
              </p>
            </FormRow>
          )}

          {/* Kode */}
          <FormRow label="Kode">
            <input
              className="input font-mono"
              value={editing.kode ?? ''}
              onChange={(e) => onChange({ ...editing, kode: e.target.value })}
              placeholder={selectedKat ? `${selectedKat.kode}1 atau ${selectedKat.kode}.1.1` : 'F1 atau F.1.1'}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Format induk: <code className="bg-slate-100 px-1 rounded">{selectedKat?.kode ?? 'F'}1</code> ·
              Format sub-sasaran: <code className="bg-slate-100 px-1 rounded">{selectedKat?.kode ?? 'F'}.1.1</code>
            </p>
          </FormRow>

          {/* Nama */}
          <FormRow label="Nama Sasaran" required>
            <input
              className="input"
              value={editing.nama ?? ''}
              onChange={(e) => onChange({ ...editing, nama: e.target.value })}
              placeholder="% Implementasi GRC"
            />
          </FormRow>

          {/* Deskripsi */}
          <FormRow label="Deskripsi">
            <textarea
              className="input min-h-[64px]"
              value={editing.deskripsi ?? ''}
              onChange={(e) => onChange({ ...editing, deskripsi: e.target.value })}
            />
          </FormRow>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button
            onClick={onSubmit}
            disabled={loading || !editing.kategori_id || !editing.nama}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  TAB 3: BOBOT PERAN (mass upsert)
// ════════════════════════════════════════════════════════════
function BobotTab({ tahun }: { tahun: number }) {
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'kepala_spi' || role === 'admin_spi';
  const qc = useQueryClient();
  const [draft, setDraft] = useState<BobotPeran[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bobot-peran', tahun],
    queryFn: () => settingsApi.getBobotPeran(tahun).then((r) => r.data.data ?? []),
  });

  const upsertMut = useMutation({
    mutationFn: () => settingsApi.upsertBobotPeran(tahun, draft ?? []),
    onSuccess: () => { toast.success('Bobot tersimpan'); qc.invalidateQueries({ queryKey: ['bobot-peran'] }); setDraft(null); },
  });

  const rows = draft ?? data ?? [];

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
        💡 Bobot peran dipakai untuk menghitung <b>Man-Days</b>:{' '}
        <code className="bg-white px-1 rounded text-xs">Man-Days = Σ (Hari Penugasan × Bobot Peran)</code>.
        <br />
        <b>Max Bobot/Bulan</b> = pagu maksimum akumulasi bobot per orang dalam satu bulan (cegah overload).
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Peran</th>
              <th className="px-4 py-3 text-left">Bobot</th>
              <th className="px-4 py-3 text-left">Max Bobot/Bulan</th>
              <th className="px-4 py-3 text-left">Keterangan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Memuat...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Belum ada konfigurasi bobot tahun ini.</td></tr>
            )}
            {rows.map((b, idx) => (
              <tr key={b.id || b.peran}>
                <td className="px-4 py-3 font-medium">{b.peran}</td>
                <td className="px-4 py-3">
                  <input
                    type="number" step="0.05" min="0" max="5"
                    disabled={!canEdit}
                    className="input w-24"
                    value={b.bobot}
                    onChange={(e) => {
                      const next = [...rows];
                      next[idx] = { ...next[idx], bobot: Number(e.target.value) };
                      setDraft(next);
                    }}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number" step="0.5" min="0.5" max="31"
                    disabled={!canEdit}
                    className="input w-24"
                    value={b.max_bobot_per_bulan}
                    onChange={(e) => {
                      const next = [...rows];
                      next[idx] = { ...next[idx], max_bobot_per_bulan: Number(e.target.value) };
                      setDraft(next);
                    }}
                  />
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{b.keterangan ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && draft && (
        <div className="flex justify-end gap-2">
          <button onClick={() => setDraft(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Batal</button>
          <button
            onClick={() => upsertMut.mutate()}
            disabled={upsertMut.isPending}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {upsertMut.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  TAB 4: KELOMPOK PENUGASAN — master generik
//  Tipe pengelompokan default: Kategori, Sifat Program,
//  Kategori Anggaran. Admin bisa menambah tipe baru bebas.
// ════════════════════════════════════════════════════════════
const TIPE_BUILT_IN = ['Kategori', 'Sifat Program', 'Kategori Anggaran'];

const DEFAULT_COLOR = {
  bg: 'bg-slate-50',
  text: 'text-slate-700',
  border: 'border-slate-200',
  badge: 'bg-slate-100 text-slate-700',
};

function KelompokTab() {
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'kepala_spi' || role === 'admin_spi';
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<KelompokPenugasan> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KelompokPenugasan | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['kelompok-penugasan'],
    queryFn: () => settingsApi.getKelompokPenugasan().then((r) => r.data.data ?? []),
  });

  // Daftar tipe yang ada di data + built-in
  const tipeOptions = useMemo(() => {
    const set = new Set<string>([...TIPE_BUILT_IN, ...((data ?? []).map((d) => d.tipe))]);
    return Array.from(set).sort();
  }, [data]);

  const createMut = useMutation({
    mutationFn: settingsApi.createKelompokPenugasan,
    onSuccess: () => { toast.success('Nilai ditambahkan'); qc.invalidateQueries({ queryKey: ['kelompok-penugasan'] }); setEditing(null); },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'Gagal'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...p }: Partial<KelompokPenugasan> & { id: string }) => settingsApi.updateKelompokPenugasan(id, p),
    onSuccess: () => { toast.success('Tersimpan'); qc.invalidateQueries({ queryKey: ['kelompok-penugasan'] }); setEditing(null); },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'Gagal'),
  });
  const deleteMut = useMutation({
    mutationFn: settingsApi.deleteKelompokPenugasan,
    onSuccess: () => { toast.success('Nilai dihapus'); qc.invalidateQueries({ queryKey: ['kelompok-penugasan'] }); setDeleteTarget(null); },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'Gagal menghapus'),
  });

  // Group items by tipe & sort by urutan
  const grouped = useMemo(() => {
    const all = data ?? [];
    return tipeOptions.map((tipe) => {
      const items = all
        .filter((item) => item.tipe === tipe)
        .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
      return {
        tipe,
        items,
      };
    });
  }, [data, tipeOptions]);

  const totalNilai = (data ?? []).length;

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
        💡 Master ini menyimpan nilai-nilai untuk pengelompokan program kerja
        (mis. <b>Kategori</b>: Assurance/Non Assurance, <b>Sifat Program</b>: Mandatory/Strategis,
        <b> Kategori Anggaran</b>: Subsidi/Non Subsidi). Tambah tipe baru kapan saja jika dibutuhkan
        klasifikasi lain.
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">
            Total <b className="text-slate-800">{totalNilai}</b> nilai pengelompokan
          </span>
          {isLoading && <span className="text-xs text-slate-400">Memuat...</span>}
        </div>
        {canEdit && (
          <button
            onClick={() => setEditing({ tipe: 'Kategori', nilai: '', urutan: 0 })}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> Tambah Nilai
          </button>
        )}
      </div>

      {/* Grouped cards per tipe */}
      {isLoading ? (
        <div className="card p-8 text-center text-slate-400">Memuat...</div>
      ) : tipeOptions.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          Belum ada nilai pengelompokan.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ tipe, items }) => (
            <div key={tipe} className="card overflow-hidden border border-slate-200">
              {/* Tipe header */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-bold text-slate-700">{tipe}</span>
                  <span className="badge text-[11px] bg-slate-100 text-slate-700">{items.length} nilai</span>
                </div>
                {canEdit && (
                  <button
                    onClick={() => setEditing({ tipe, nilai: '', urutan: 0 })}
                    className="text-xs font-semibold text-slate-700 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah di sini
                  </button>
                )}
              </div>

              {/* Items */}
              {items.length === 0 ? (
                <div className="px-4 py-6 text-center text-slate-400 text-sm">
                  Belum ada nilai untuk tipe ini.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors justify-between"
                    >
                      {/* Nilai & Info */}
                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {item.nilai}
                          </p>
                          {item.urutan > 0 && (
                            <p className="text-xs text-slate-400">
                              Urutan: {item.urutan} · Status: {item.is_active ? 'Aktif' : 'Non-aktif'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Aksi */}
                      {canEdit && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => setEditing(item)}
                            className="px-2.5 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            className="px-2.5 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {editing && (
        <FormModal
          title={editing.id ? 'Edit Nilai' : 'Tambah Nilai'}
          onClose={() => setEditing(null)}
          onSubmit={() => editing.id
            ? updateMut.mutate({ ...editing, id: editing.id! })
            : createMut.mutate(editing)}
          loading={createMut.isPending || updateMut.isPending}
        >
          <FormRow label="Tipe" required>
            <input
              className="input"
              list="tipe-options"
              value={editing.tipe ?? ''}
              onChange={(e) => setEditing({ ...editing, tipe: e.target.value })}
              placeholder="Kategori | Sifat Program | Kategori Anggaran | (custom)"
            />
            <datalist id="tipe-options">
              {tipeOptions.map((t) => <option key={t} value={t} />)}
            </datalist>
            <p className="mt-1 text-[11px] text-slate-400">Pilih tipe yang ada atau ketik tipe baru untuk membuat dimensi pengelompokan baru.</p>
          </FormRow>
          <FormRow label="Nilai" required>
            <input className="input" value={editing.nilai ?? ''} onChange={(e) => setEditing({ ...editing, nilai: e.target.value })} placeholder="cth: Assurance / Mandatory / Subsidi" />
          </FormRow>
          <FormRow label="Urutan">
            <input type="number" className="input" value={editing.urutan ?? 0} onChange={(e) => setEditing({ ...editing, urutan: Number(e.target.value) })} />
          </FormRow>
          {editing.id && (
            <FormRow label="Aktif">
              <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="w-4 h-4" />
            </FormRow>
          )}
        </FormModal>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          label={`Nilai "${deleteTarget.nilai}" (${deleteTarget.tipe})`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMut.isPending}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Shared UI helpers
// ════════════════════════════════════════════════════════════
function DeleteConfirmModal({ label, onConfirm, onCancel, isPending }: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm" onClick={() => !isPending && onCancel()} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full pointer-events-auto space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-bold text-slate-800">Hapus Data?</p>
              <p className="text-sm text-slate-500 mt-1">{label} akan dihapus permanen dan tidak dapat dipulihkan.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} disabled={isPending} className="btn-secondary flex-1 justify-center">Batal</button>
            <button
              onClick={onConfirm}
              disabled={isPending}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Menghapus...' : 'Ya, Hapus'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function FormModal({
  title, onClose, onSubmit, loading, children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Batal</button>
          <button
            onClick={onSubmit}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}