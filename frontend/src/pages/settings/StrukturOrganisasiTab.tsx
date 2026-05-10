/**
 * StrukturOrganisasiTab
 * Tab Pengaturan Sistem untuk mengelola Divisi dan Departemen:
 * - Rename divisi / departemen
 * - Pindahkan departemen ke divisi lain
 * - Tambah divisi baru
 * - Tambah departemen baru ke dalam divisi
 * - Aktif / non-aktifkan divisi / departemen
 *
 * Akses: kepala_spi, admin_spi
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, ChevronDown, ChevronRight, Building2,
  Layers, MoveRight, Search, X, Check, AlertTriangle, ToggleLeft, ToggleRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { organisasiApi, DivisiMgmt, DepartemenMgmt } from '../../services/api';
import { Direktorat } from '../../types';
import { useAuthStore } from '../../store/auth.store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DivisiForm {
  id?: string;
  direktorat_id: string;
  kode: string;
  nama: string;
  deskripsi: string;
}

interface DepartemenForm {
  id?: string;
  divisi_id: string;
  kode: string;
  nama: string;
  deskripsi: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY_DIVISI: DivisiForm  = { direktorat_id: '', kode: '', nama: '', deskripsi: '' };
const EMPTY_DEPT:   DepartemenForm = { divisi_id: '', kode: '', nama: '', deskripsi: '' };

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StrukturOrganisasiTab() {
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'kepala_spi' || role === 'admin_spi';
  const qc = useQueryClient();

  // ── State ────────────────────────────────────────────────────
  const [search, setSearch]                     = useState('');
  const [expandedDivisi, setExpandedDivisi]     = useState<Set<string>>(new Set());
  const [divisiModal, setDivisiModal]           = useState<{ open: boolean; form: DivisiForm } | null>(null);
  const [deptModal, setDeptModal]               = useState<{ open: boolean; form: DepartemenForm; mode: 'add' | 'edit' | 'move' } | null>(null);
  const [confirmToggle, setConfirmToggle]       = useState<{ type: 'divisi' | 'departemen'; item: DivisiMgmt | DepartemenMgmt } | null>(null);

  // ── Queries ──────────────────────────────────────────────────
  const { data: direktoratList = [] } = useQuery({
    queryKey: ['dropdown-direktorat'],
    queryFn: () => organisasiApi.getDirektorats().then((r) => r.data.data ?? []),
  });

  const { data: divisiList = [], isLoading: divisiLoading } = useQuery({
    queryKey: ['mgmt-divisi'],
    queryFn: () => organisasiApi.getDivisiList().then((r) => r.data.data ?? []),
  });

  const { data: departemenList = [], isLoading: deptLoading } = useQuery({
    queryKey: ['mgmt-departemen'],
    queryFn: () => organisasiApi.getDepartemenList().then((r) => r.data.data ?? []),
  });

  // ── Mutations ────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['mgmt-divisi'] });
    qc.invalidateQueries({ queryKey: ['mgmt-departemen'] });
    qc.invalidateQueries({ queryKey: ['dropdown-divisi'] });
    qc.invalidateQueries({ queryKey: ['dropdown-departemen'] });
  };

  const saveDivisiMut = useMutation({
    mutationFn: (form: DivisiForm) =>
      form.id
        ? organisasiApi.updateDivisi(form.id, { direktorat_id: form.direktorat_id, kode: form.kode, nama: form.nama, deskripsi: form.deskripsi || undefined })
        : organisasiApi.createDivisi({ direktorat_id: form.direktorat_id, kode: form.kode, nama: form.nama, deskripsi: form.deskripsi || undefined }),
    onSuccess: (_, form) => {
      toast.success(form.id ? 'Divisi diperbarui' : 'Divisi ditambahkan');
      invalidate();
      setDivisiModal(null);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? 'Gagal menyimpan divisi'),
  });

  const saveDeptMut = useMutation({
    mutationFn: (form: DepartemenForm) =>
      form.id
        ? organisasiApi.updateDepartemen(form.id, { divisi_id: form.divisi_id, kode: form.kode, nama: form.nama, deskripsi: form.deskripsi || undefined })
        : organisasiApi.createDepartemen({ divisi_id: form.divisi_id, kode: form.kode, nama: form.nama, deskripsi: form.deskripsi || undefined }),
    onSuccess: (_, form) => {
      toast.success(form.id ? 'Departemen diperbarui' : 'Departemen ditambahkan');
      invalidate();
      setDeptModal(null);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? 'Gagal menyimpan departemen'),
  });

  const toggleDivisiMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      organisasiApi.updateDivisi(id, { is_active }),
    onSuccess: (_, { is_active }) => {
      toast.success(is_active ? 'Divisi diaktifkan' : 'Divisi dinonaktifkan');
      invalidate();
      setConfirmToggle(null);
    },
    onError: () => toast.error('Gagal mengubah status divisi'),
  });

  const toggleDeptMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      organisasiApi.updateDepartemen(id, { is_active }),
    onSuccess: (_, { is_active }) => {
      toast.success(is_active ? 'Departemen diaktifkan' : 'Departemen dinonaktifkan');
      invalidate();
      setConfirmToggle(null);
    },
    onError: () => toast.error('Gagal mengubah status departemen'),
  });

  // ── Derived data ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return divisiList;
    return divisiList.filter((d) => {
      const deptMatch = departemenList.some(
        (dept) => dept.divisi_id === d.id && dept.nama.toLowerCase().includes(q),
      );
      return d.nama.toLowerCase().includes(q) || d.kode.toLowerCase().includes(q) || deptMatch;
    });
  }, [divisiList, departemenList, search]);

  const deptsByDivisi = useMemo(() => {
    const map = new Map<string, DepartemenMgmt[]>();
    for (const dept of departemenList) {
      const arr = map.get(dept.divisi_id) ?? [];
      arr.push(dept);
      map.set(dept.divisi_id, arr);
    }
    return map;
  }, [departemenList]);

  // ── Toggle expand ─────────────────────────────────────────────
  const toggleExpand = (id: string) =>
    setExpandedDivisi((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const expandAll = () => setExpandedDivisi(new Set(filtered.map((d) => d.id)));
  const collapseAll = () => setExpandedDivisi(new Set());

  // ─────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────
  const isLoading = divisiLoading || deptLoading;

  return (
    <div className="space-y-4">

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          Kelola struktur divisi dan departemen yang menjadi auditee program pengawasan.
        </p>
        {canEdit && (
          <button
            onClick={() => setDivisiModal({ open: true, form: { ...EMPTY_DIVISI } })}
            className="btn-primary shrink-0"
          >
            <Plus className="w-4 h-4" /> Tambah Divisi
          </button>
        )}
      </div>

      {/* ── Search + Expand controls ─────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Cari divisi atau departemen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <button onClick={expandAll} className="px-2 py-1 rounded hover:bg-slate-100 transition">Buka semua</button>
          <span className="text-slate-300">|</span>
          <button onClick={collapseAll} className="px-2 py-1 rounded hover:bg-slate-100 transition">Tutup semua</button>
        </div>
      </div>

      {/* ── Summary pills ────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 border border-primary-200 px-2.5 py-0.5 font-semibold text-primary-700">
          <Layers className="w-3 h-3" /> {divisiList.length} Divisi
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 font-semibold text-slate-600">
          <Building2 className="w-3 h-3" /> {departemenList.length} Departemen
        </span>
        {search && (
          <span className="text-slate-400">— menampilkan {filtered.length} divisi sesuai pencarian</span>
        )}
      </div>

      {/* ── Divisi cards ─────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-slate-400">
          <Layers className="w-10 h-10 text-slate-200" />
          <p className="text-sm font-medium">Tidak ada divisi ditemukan.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((divisi) => {
            const depts = deptsByDivisi.get(divisi.id) ?? [];
            const activeDepts = depts.filter((d) => d.is_active);
            const isOpen = expandedDivisi.has(divisi.id);
            const searchQ = search.trim().toLowerCase();
            const filteredDepts = searchQ
              ? depts.filter((d) => d.nama.toLowerCase().includes(searchQ))
              : depts;

            return (
              <div
                key={divisi.id}
                className={`rounded-xl border overflow-hidden transition-all ${
                  divisi.is_active
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-100 bg-slate-50 opacity-60'
                }`}
              >
                {/* Divisi header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Expand toggle */}
                  <button
                    onClick={() => toggleExpand(divisi.id)}
                    className="shrink-0 text-slate-400 hover:text-slate-600 transition"
                    aria-label={isOpen ? 'Tutup' : 'Buka'}
                  >
                    {isOpen
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </button>

                  {/* Icon */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-100">
                    <Layers className="h-4 w-4 text-primary-600" />
                  </div>

                  {/* Name & meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800 truncate">{divisi.nama}</span>
                      <span className="font-mono text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{divisi.kode}</span>
                      {!divisi.is_active && (
                        <span className="text-[10px] font-semibold bg-red-50 text-red-500 border border-red-100 rounded-full px-1.5 py-0.5">Non-aktif</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {divisi.direktorat_nama ?? '—'}
                      <span className="mx-1.5 text-slate-200">·</span>
                      <span className="font-medium text-slate-500">{activeDepts.length}</span> departemen aktif
                      {depts.length > activeDepts.length && (
                        <span className="text-slate-300"> / {depts.length} total</span>
                      )}
                    </p>
                  </div>

                  {/* Actions */}
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        title="Tambah departemen"
                        onClick={() => {
                          setDeptModal({ open: true, form: { ...EMPTY_DEPT, divisi_id: divisi.id }, mode: 'add' });
                          setExpandedDivisi((prev) => new Set([...prev, divisi.id]));
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        title="Edit divisi"
                        onClick={() =>
                          setDivisiModal({
                            open: true,
                            form: { id: divisi.id, direktorat_id: divisi.direktorat_id, kode: divisi.kode, nama: divisi.nama, deskripsi: divisi.deskripsi ?? '' },
                          })
                        }
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        title={divisi.is_active ? 'Nonaktifkan divisi' : 'Aktifkan divisi'}
                        onClick={() => setConfirmToggle({ type: 'divisi', item: divisi })}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                      >
                        {divisi.is_active
                          ? <ToggleRight className="w-4 h-4 text-emerald-500" />
                          : <ToggleLeft  className="w-4 h-4 text-slate-400" />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Departemen list (collapsible) */}
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/50">
                    {filteredDepts.length === 0 ? (
                      <div className="px-6 py-4 text-sm text-slate-400 italic">
                        {depts.length === 0
                          ? 'Belum ada departemen. Klik + untuk menambahkan.'
                          : 'Tidak ada departemen sesuai pencarian.'}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {filteredDepts.map((dept) => (
                          <div
                            key={dept.id}
                            className={`flex items-center gap-3 px-6 py-2.5 transition-colors hover:bg-white ${
                              !dept.is_active ? 'opacity-50' : ''
                            }`}
                          >
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-slate-700 truncate">{dept.nama}</span>
                                <span className="font-mono text-[10px] bg-white border border-slate-200 text-slate-400 px-1.5 py-0.5 rounded">{dept.kode}</span>
                                {!dept.is_active && (
                                  <span className="text-[10px] font-semibold bg-red-50 text-red-400 border border-red-100 rounded-full px-1.5 py-0.5">Non-aktif</span>
                                )}
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                  title="Edit / rename departemen"
                                  onClick={() =>
                                    setDeptModal({
                                      open: true,
                                      form: { id: dept.id, divisi_id: dept.divisi_id, kode: dept.kode, nama: dept.nama, deskripsi: dept.deskripsi ?? '' },
                                      mode: 'edit',
                                    })
                                  }
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  title="Pindahkan ke divisi lain"
                                  onClick={() =>
                                    setDeptModal({
                                      open: true,
                                      form: { id: dept.id, divisi_id: dept.divisi_id, kode: dept.kode, nama: dept.nama, deskripsi: dept.deskripsi ?? '' },
                                      mode: 'move',
                                    })
                                  }
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition"
                                >
                                  <MoveRight className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  title={dept.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                  onClick={() => setConfirmToggle({ type: 'departemen', item: dept })}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                                >
                                  {dept.is_active
                                    ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" />
                                    : <ToggleLeft  className="w-3.5 h-3.5 text-slate-400" />}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Quick add dept link */}
                    {canEdit && depts.length > 0 && (
                      <div className="px-6 py-2 border-t border-slate-100">
                        <button
                          onClick={() => setDeptModal({ open: true, form: { ...EMPTY_DEPT, divisi_id: divisi.id }, mode: 'add' })}
                          className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-semibold transition"
                        >
                          <Plus className="w-3.5 h-3.5" /> Tambah departemen
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL: Tambah / Edit Divisi
      ════════════════════════════════════════════════════════ */}
      {divisiModal?.open && (
        <DivisiModal
          form={divisiModal.form}
          direktoratList={direktoratList}
          saving={saveDivisiMut.isPending}
          onClose={() => setDivisiModal(null)}
          onSave={(form) => saveDivisiMut.mutate(form)}
        />
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL: Tambah / Edit / Pindah Departemen
      ════════════════════════════════════════════════════════ */}
      {deptModal?.open && (
        <DepartemenModal
          form={deptModal.form}
          mode={deptModal.mode}
          divisiList={divisiList}
          saving={saveDeptMut.isPending}
          onClose={() => setDeptModal(null)}
          onSave={(form) => saveDeptMut.mutate(form)}
        />
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL: Konfirmasi Toggle Aktif/Non-aktif
      ════════════════════════════════════════════════════════ */}
      {confirmToggle && (
        <ConfirmToggleModal
          type={confirmToggle.type}
          item={confirmToggle.item}
          saving={toggleDivisiMut.isPending || toggleDeptMut.isPending}
          onClose={() => setConfirmToggle(null)}
          onConfirm={() => {
            if (confirmToggle.type === 'divisi') {
              const d = confirmToggle.item as DivisiMgmt;
              toggleDivisiMut.mutate({ id: d.id, is_active: !d.is_active });
            } else {
              const d = confirmToggle.item as DepartemenMgmt;
              toggleDeptMut.mutate({ id: d.id, is_active: !d.is_active });
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Divisi Modal ────────────────────────────────────────────────────────────

interface DivisiModalProps {
  form: DivisiForm;
  direktoratList: Direktorat[];
  saving: boolean;
  onClose: () => void;
  onSave: (form: DivisiForm) => void;
}

function DivisiModal({ form: initial, direktoratList, saving, onClose, onSave }: DivisiModalProps) {
  const [form, setForm] = useState<DivisiForm>(initial);
  const isEdit = !!initial.id;
  const valid = form.direktorat_id && form.kode.trim() && form.nama.trim();

  const set = (k: keyof DivisiForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100">
              <Layers className="h-4 w-4 text-primary-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">{isEdit ? 'Edit Divisi' : 'Tambah Divisi'}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Direktorat <span className="text-red-400">*</span></label>
            <select value={form.direktorat_id} onChange={set('direktorat_id')} className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-300 focus:border-primary-400 focus:outline-none transition bg-white text-sm">
              <option value="">— Pilih direktorat —</option>
              {direktoratList.map((d) => (
                <option key={d.id} value={d.id}>{d.nama}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Kode <span className="text-red-400">*</span></label>
              <input value={form.kode} onChange={set('kode')} placeholder="mis. DIV-SDM" className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-300 focus:border-primary-400 focus:outline-none transition text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Nama Divisi <span className="text-red-400">*</span></label>
              <input value={form.nama} onChange={set('nama')} placeholder="Nama divisi" className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-300 focus:border-primary-400 focus:outline-none transition text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Deskripsi</label>
            <textarea value={form.deskripsi} onChange={set('deskripsi')} rows={2} placeholder="Opsional" className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-300 focus:border-primary-400 focus:outline-none transition text-sm resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/60">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Batal</button>
          <button onClick={() => onSave(form)} disabled={!valid || saving} className="btn-primary">
            {saving ? 'Menyimpan…' : (isEdit ? 'Simpan' : 'Tambahkan')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Departemen Modal ────────────────────────────────────────────────────────

interface DepartemenModalProps {
  form: DepartemenForm;
  mode: 'add' | 'edit' | 'move';
  divisiList: DivisiMgmt[];
  saving: boolean;
  onClose: () => void;
  onSave: (form: DepartemenForm) => void;
}

function DepartemenModal({ form: initial, mode, divisiList, saving, onClose, onSave }: DepartemenModalProps) {
  const [form, setForm] = useState<DepartemenForm>(initial);

  const titles = { add: 'Tambah Departemen', edit: 'Edit Departemen', move: 'Pindahkan Departemen' };
  const valid = form.divisi_id && form.kode.trim() && form.nama.trim();

  const set = (k: keyof DepartemenForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const activeDivisi = divisiList.filter((d) => d.is_active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <Building2 className="h-4 w-4 text-slate-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">{titles[mode]}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3.5">
          {/* Move: info about current divisi */}
          {mode === 'move' && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
              <MoveRight className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
              <span>
                Departemen <strong>{initial.nama}</strong> saat ini berada di divisi{' '}
                <strong>{divisiList.find((d) => d.id === initial.divisi_id)?.nama ?? '—'}</strong>.
                Pilih divisi tujuan di bawah.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              {mode === 'move' ? 'Divisi Tujuan' : 'Divisi'} <span className="text-red-400">*</span>
            </label>
            <select value={form.divisi_id} onChange={set('divisi_id')} className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-300 focus:border-primary-400 focus:outline-none transition bg-white text-sm">
              <option value="">— Pilih divisi —</option>
              {activeDivisi.map((d) => (
                <option key={d.id} value={d.id} disabled={mode === 'move' && d.id === initial.divisi_id}>
                  {d.nama}{mode === 'move' && d.id === initial.divisi_id ? ' (saat ini)' : ''}
                </option>
              ))}
            </select>
          </div>

          {mode !== 'move' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Kode <span className="text-red-400">*</span></label>
                  <input value={form.kode} onChange={set('kode')} placeholder="mis. DEPT-001" className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-300 focus:border-primary-400 focus:outline-none transition text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Nama Departemen <span className="text-red-400">*</span></label>
                  <input value={form.nama} onChange={set('nama')} placeholder="Nama departemen" className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-300 focus:border-primary-400 focus:outline-none transition text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Deskripsi</label>
                <textarea value={form.deskripsi} onChange={set('deskripsi')} rows={2} placeholder="Opsional" className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-300 focus:border-primary-400 focus:outline-none transition text-sm resize-none" />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/60">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Batal</button>
          <button onClick={() => onSave(form)} disabled={!valid || saving} className="btn-primary">
            {saving ? 'Menyimpan…' : mode === 'add' ? 'Tambahkan' : mode === 'move' ? 'Pindahkan' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Toggle Modal ────────────────────────────────────────────────────

interface ConfirmToggleProps {
  type: 'divisi' | 'departemen';
  item: DivisiMgmt | DepartemenMgmt;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function ConfirmToggleModal({ type, item, saving, onClose, onConfirm }: ConfirmToggleProps) {
  const activating = !item.is_active;
  const label = type === 'divisi' ? 'divisi' : 'departemen';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="px-5 py-5 flex flex-col items-center gap-3 text-center">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${activating ? 'bg-emerald-100' : 'bg-amber-100'}`}>
            <AlertTriangle className={`h-6 w-6 ${activating ? 'text-emerald-600' : 'text-amber-600'}`} />
          </div>
          <p className="text-sm font-bold text-slate-800">
            {activating ? `Aktifkan ${label}?` : `Nonaktifkan ${label}?`}
          </p>
          <p className="text-sm text-slate-500">
            <strong>{item.nama}</strong>{' '}
            {activating
              ? `akan kembali aktif dan muncul sebagai pilihan auditee.`
              : `akan disembunyikan dari pilihan auditee. Data program yang sudah ada tidak terpengaruh.`}
          </p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={saving}>Batal</button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activating
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            <Check className="w-4 h-4" />
            {saving ? 'Memproses…' : (activating ? 'Aktifkan' : 'Nonaktifkan')}
          </button>
        </div>
      </div>
    </div>
  );
}
