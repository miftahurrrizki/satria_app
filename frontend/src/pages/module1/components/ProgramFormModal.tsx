import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Loader2, Users, CalendarDays, AlertTriangle,
  Search, ChevronDown, Building2, FileText, ShieldCheck,
} from 'lucide-react';
import { annualPlansApi, auditorsApi, risksApi, workloadApi, organisasiApi, settingsApi, ceoLetterApi, CeoAreaWithLetter, CreatePlanPayload } from '../../../services/api';
import { AnnualAuditPlan, AnnualAuditPlanDetail, Auditor, Departemen, Divisi, JenisProgram, KategoriProgram, RiskData, RiskLevelKode, StatusProgram } from '../../../types';
import toast from 'react-hot-toast';

interface Props {
  tahun: number;
  editData?: AnnualAuditPlan | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormState {
  jenis_program:       JenisProgram;
  judul_program:       string;
  kategori_program:    KategoriProgram;
  status_program:      StatusProgram;
  auditee:             string;
  deskripsi:           string;
  tanggal_mulai:       string;
  tanggal_selesai:     string;
  pengendali_teknis_ids: string[];
  ketua_tim_ids:         string[];
  anggota_ids:           string[];
  hari_penugasan:      string;            // jumlah hari penugasan global untuk semua anggota tim
  risk_ids:            string[];
  ceo_area_ids:        string[];
  // Finansial (Fase 5 — disederhanakan)
  anggaran:            string;            // simpan sebagai string supaya input tetap nyaman
  kategori_anggaran:   string;
}

const LEVEL_BADGE: Record<RiskLevelKode, string> = {
  E:  'bg-red-100 text-red-700',
  T:  'bg-orange-50 text-orange-700',
  MT: 'bg-amber-50 text-amber-700',
  M:  'bg-yellow-50 text-yellow-700',
  RM: 'bg-lime-50 text-lime-700',
  R:  'bg-green-50 text-green-700',
};

function calcEstimasi(mulai: string, selesai: string): number {
  if (!mulai || !selesai) return 0;
  const diff = Math.round(
    (new Date(selesai).getTime() - new Date(mulai).getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(1, diff + 1);
}

export default function ProgramFormModal({ tahun, editData, onClose, onSuccess }: Props) {
  const isEdit = !!editData;
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>({
    jenis_program:        'PKPT',
    judul_program:        '',
    kategori_program:     'Assurance',
    status_program:       'Mandatory',
    auditee:              '',
    deskripsi:            '',
    tanggal_mulai:        '',
    tanggal_selesai:      '',
    pengendali_teknis_ids: [],
    ketua_tim_ids:         [],
    anggota_ids:           [],
    hari_penugasan:       '',
    risk_ids:             [],
    ceo_area_ids:         [],
    anggaran:             '',
    kategori_anggaran:    '',
  });

  const [riskSearch,    setRiskSearch]    = useState('');
  const [ceoAreaSearch, setCeoAreaSearch] = useState('');
  const [pengendaliOpen, setPengendaliOpen] = useState(false);
  const [ketuaOpen,      setKetuaOpen]      = useState(false);
  const [anggotaOpen,    setAnggotaOpen]    = useState(false);
  const [auditeeOpen,  setAuditeeOpen]  = useState(false);
  const [auditeeSearch, setAuditeeSearch] = useState('');
  const [selectedAuditeeDeptIds, setSelectedAuditeeDeptIds] = useState<string[]>([]);

  // 1. Query Detail Program
  const { data: detailRes, isError: isDetailError } = useQuery({
    queryKey: ['annual-plan-detail', editData?.id],
    queryFn: async () => {
      const res = await annualPlansApi.getById(editData!.id);
      return res.data.data as AnnualAuditPlanDetail;
    },
    enabled: !!editData?.id,
  });

  useEffect(() => {
    if (isDetailError) toast.error('Gagal memuat data program untuk diedit');
  }, [isDetailError]);

  // Safeguard pengisian data agar tidak crash jika dari API bernilai null/undefined
  useEffect(() => {
    if (detailRes) {
      const pengendaliIds = detailRes.team?.filter((t) => t.role_tim === 'Pengendali Teknis').map((t) => t.user_id) ?? [];
      const ketuaIds      = detailRes.team?.filter((t) => t.role_tim === 'Ketua Tim').map((t) => t.user_id) ?? [];
      const anggotaIds    = detailRes.team?.filter((t) => t.role_tim === 'Anggota Tim').map((t) => t.user_id) ?? [];
      const riskIds     = detailRes.risks?.map((r) => r.id) ?? [];
      const ceoAreaIds  = detailRes.ceo_areas?.map((a) => a.id) ?? [];
      const hariAlokasiValues = (detailRes.team ?? [])
        .map((t) => t.hari_alokasi)
        .filter((v): v is number => v != null);

      setForm({
        jenis_program:        (detailRes.jenis_program as JenisProgram) || 'PKPT',
        judul_program:        detailRes.judul_program || '',
        kategori_program:     (detailRes.kategori_program as KategoriProgram) || 'Assurance',
        status_program:       (detailRes.status_program as StatusProgram) || 'Mandatory',
        auditee:              detailRes.auditee || '',
        deskripsi:            detailRes.deskripsi || '',
        tanggal_mulai:        detailRes.tanggal_mulai?.slice(0, 10) || '',
        tanggal_selesai:      detailRes.tanggal_selesai?.slice(0, 10) || '',
        pengendali_teknis_ids: pengendaliIds,
        ketua_tim_ids:         ketuaIds,
        anggota_ids:           anggotaIds,
        hari_penugasan:       hariAlokasiValues.length > 0 ? String(hariAlokasiValues[0]) : '',
        risk_ids:             riskIds,
        ceo_area_ids:         ceoAreaIds,
        anggaran:             detailRes.anggaran != null ? String(detailRes.anggaran) : '',
        kategori_anggaran:    detailRes.kategori_anggaran ?? '',
      });
    }
  }, [detailRes]);

  // Master kelompok penugasan (Kategori / Sifat Program / Kategori Anggaran)
  const { data: kelompokRes } = useQuery({
    queryKey: ['kelompok-penugasan'],
    queryFn: () => settingsApi.getKelompokPenugasan().then((r) => r.data.data ?? []),
    staleTime: 5 * 60_000,
  });
  const kategoriOptions = useMemo(
    () => (kelompokRes ?? []).filter((k) => k.tipe === 'Kategori' && k.is_active).map((k) => k.nilai),
    [kelompokRes],
  );
  const sifatOptions = useMemo(
    () => (kelompokRes ?? []).filter((k) => k.tipe === 'Sifat Program' && k.is_active).map((k) => k.nilai),
    [kelompokRes],
  );
  const kategoriAnggaranOptions = useMemo(
    () => (kelompokRes ?? []).filter((k) => k.tipe === 'Kategori Anggaran' && k.is_active).map((k) => k.nilai),
    [kelompokRes],
  );

  const { data: auditorsRes } = useQuery({
    queryKey: ['auditors'],
    queryFn: async () => {
      const res = await auditorsApi.getAll();
      return res.data.data as Auditor[];
    },
  });

  const { data: divisiRes, isLoading: isDivisiLoading } = useQuery({
    queryKey: ['dropdown-divisi'],
    queryFn: async () => {
      const res = await organisasiApi.getDivisis();
      return (res.data.data ?? []) as Divisi[];
    },
    staleTime: 3600_000,
  });

  const { data: departemenRes, isLoading: isDepartemenLoading } = useQuery({
    queryKey: ['dropdown-departemen-all'],
    queryFn: async () => {
      const res = await organisasiApi.getDepartemens();
      return (res.data.data ?? []) as Departemen[];
    },
    staleTime: 3600_000,
  });

const { data: riskRes } = useQuery({
    queryKey: ['top-risks-for-program', tahun],
    queryFn: async () => {
      const res = await risksApi.getTop({ tahun, n: 20 });
      return res.data.data ?? [];
    },
    enabled: form.jenis_program === 'PKPT',
  });

  const { data: ceoAreasRes } = useQuery({
    queryKey: ['ceo-areas-for-program', tahun],
    queryFn: async () => {
      const res = await ceoLetterApi.getAreas(tahun);
      return (res.data.data ?? []) as CeoAreaWithLetter[];
    },
    staleTime: 60_000,
  });

  const auditors: Auditor[] = auditorsRes ?? [];
  const divisiList: Divisi[] = divisiRes ?? [];
  const departemenList: Departemen[] = departemenRes ?? [];
  const divisiById = useMemo(() => new Map(divisiList.map((d) => [d.id, d])), [divisiList]);
  const departemenById = useMemo(() => new Map(departemenList.map((d) => [d.id, d])), [departemenList]);
  const allRisks: RiskData[] = riskRes ?? [];

  const formatAuditee = (deptIds: string[]) => {
    const groups = new Map<string, { divisiName: string; deptNames: string[] }>();

    deptIds
      .map((id) => departemenById.get(id))
      .filter((dept): dept is Departemen => !!dept)
      .forEach((dept) => {
        const divisiName = divisiById.get(dept.divisi_id)?.nama ?? 'Divisi belum terpetakan';
        const current = groups.get(dept.divisi_id) ?? { divisiName, deptNames: [] };
        current.deptNames.push(dept.nama);
        groups.set(dept.divisi_id, current);
      });

    return Array.from(groups.values())
      .map((group) => `${group.divisiName}: ${group.deptNames.join(', ')}`)
      .join('; ');
  };

  const selectedAuditeeGroups = useMemo(() => {
    const groups = new Map<string, { divisiName: string; departments: Departemen[] }>();

    selectedAuditeeDeptIds
      .map((id) => departemenById.get(id))
      .filter((dept): dept is Departemen => !!dept)
      .forEach((dept) => {
        const divisiName = divisiById.get(dept.divisi_id)?.nama ?? 'Divisi belum terpetakan';
        const current = groups.get(dept.divisi_id) ?? { divisiName, departments: [] };
        current.departments.push(dept);
        groups.set(dept.divisi_id, current);
      });

    return Array.from(groups.values());
  }, [departemenById, divisiById, selectedAuditeeDeptIds]);

  const filteredDepartemen = useMemo(() => {
    const q = auditeeSearch.trim().toLowerCase();
    return departemenList.filter((dept) => {
      const divisiName = divisiById.get(dept.divisi_id)?.nama ?? '';
      return !q ||
        dept.nama.toLowerCase().includes(q) ||
        (dept.kode ?? '').toLowerCase().includes(q) ||
        divisiName.toLowerCase().includes(q);
    });
  }, [auditeeSearch, departemenList, divisiById]);

  useEffect(() => {
    if (!detailRes?.auditee || departemenList.length === 0 || selectedAuditeeDeptIds.length > 0) return;

    const auditeeText = detailRes.auditee.toLowerCase();
    const matchedDeptIds = departemenList
      .filter((dept) => auditeeText.includes(dept.nama.toLowerCase()))
      .map((dept) => dept.id);

    if (matchedDeptIds.length > 0) {
      setSelectedAuditeeDeptIds(matchedDeptIds);
    }
  }, [departemenList, detailRes?.auditee, selectedAuditeeDeptIds.length]);

  const estimasi_hari = useMemo(
    () => calcEstimasi(form.tanggal_mulai, form.tanggal_selesai),
    [form.tanggal_mulai, form.tanggal_selesai],
  );

  const jumlah_personil = useMemo(
    () => new Set([
      ...form.pengendali_teknis_ids,
      ...form.ketua_tim_ids,
      ...form.anggota_ids,
    ].filter(Boolean)).size,
    [form.pengendali_teknis_ids, form.ketua_tim_ids, form.anggota_ids],
  );

  const ptIds      = form.pengendali_teknis_ids;
  const ketuaIds   = form.ketua_tim_ids;
  const anggotaIds = form.anggota_ids;
  const selectedTeamIds = useMemo(
    () => Array.from(new Set([
      ...form.pengendali_teknis_ids,
      ...form.ketua_tim_ids,
      ...form.anggota_ids,
    ].filter(Boolean) as string[])),
    [form.pengendali_teknis_ids, form.ketua_tim_ids, form.anggota_ids],
  );
  const hariPenugasanNumber = useMemo(() => {
    if (form.hari_penugasan === '') return undefined;
    const n = Number(form.hari_penugasan);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }, [form.hari_penugasan]);
  const canSimulate = !!form.tanggal_mulai && !!form.tanggal_selesai && form.tanggal_selesai >= form.tanggal_mulai && (ptIds.length + ketuaIds.length + anggotaIds.length) > 0;

  const simPT = useQuery({
    queryKey: ['workload-sim', 'pt', ptIds, form.tanggal_mulai, form.tanggal_selesai, hariPenugasanNumber],
    queryFn: () => workloadApi.simulate({ user_ids: ptIds, tanggal_mulai: form.tanggal_mulai, tanggal_selesai: form.tanggal_selesai, role_tim: 'Pengendali Teknis', hari_alokasi: hariPenugasanNumber }).then((r) => r.data),
    enabled: canSimulate && ptIds.length > 0,
    staleTime: 30_000,
  });

  const simKetua = useQuery({
    queryKey: ['workload-sim', 'ketua', ketuaIds, form.tanggal_mulai, form.tanggal_selesai, hariPenugasanNumber],
    queryFn: () => workloadApi.simulate({ user_ids: ketuaIds, tanggal_mulai: form.tanggal_mulai, tanggal_selesai: form.tanggal_selesai, role_tim: 'Ketua Tim', hari_alokasi: hariPenugasanNumber }).then((r) => r.data),
    enabled: canSimulate && ketuaIds.length > 0,
    staleTime: 30_000,
  });

  const simAnggota = useQuery({
    queryKey: ['workload-sim', 'anggota', anggotaIds, form.tanggal_mulai, form.tanggal_selesai, hariPenugasanNumber],
    queryFn: () => workloadApi.simulate({ user_ids: anggotaIds, tanggal_mulai: form.tanggal_mulai, tanggal_selesai: form.tanggal_selesai, role_tim: 'Anggota Tim', hari_alokasi: hariPenugasanNumber }).then((r) => r.data),
    enabled: canSimulate && anggotaIds.length > 0,
    staleTime: 30_000,
  });

  const overworkAlerts = useMemo(() => {
    const alerts: { user_id: string; nama: string; role_tim: string; months: number[] }[] = [];
    const byId = (id: string) => auditors.find((a) => a.id === id)?.nama_lengkap ?? 'Auditor';
    (simPT.data?.data ?? []).filter((r) => r.is_overwork).forEach((r) =>
      alerts.push({ user_id: r.user_id, nama: byId(r.user_id), role_tim: 'Pengendali Teknis', months: r.overwork_months }),
    );
    (simKetua.data?.data ?? []).filter((r) => r.is_overwork).forEach((r) =>
      alerts.push({ user_id: r.user_id, nama: byId(r.user_id), role_tim: 'Ketua Tim', months: r.overwork_months }),
    );
    (simAnggota.data?.data ?? []).filter((r) => r.is_overwork).forEach((r) =>
      alerts.push({ user_id: r.user_id, nama: byId(r.user_id), role_tim: 'Anggota Tim', months: r.overwork_months }),
    );
    return alerts;
  }, [simPT.data, simKetua.data, simAnggota.data, auditors]);

  const filteredRisks = useMemo(
    () =>
      allRisks.filter((r) =>
        !riskSearch ||
        (r.id_risiko ?? '').toLowerCase().includes(riskSearch.toLowerCase()) ||
        (r.nama_risiko ?? '').toLowerCase().includes(riskSearch.toLowerCase()) || // Mencegah crash jika nama_risiko null
        (r.divisi ?? '').toLowerCase().includes(riskSearch.toLowerCase()),
      ),
    [allRisks, riskSearch],
  );

  const pengendaliOptions = auditors.filter((a) => ['kepala_spi', 'pengendali_teknis'].includes(a.role));
  const ketuaOptions = auditors.filter((a) => ['pengendali_teknis', 'anggota_tim'].includes(a.role));
  const anggotaOptions = auditors.filter((a) => ['pengendali_teknis', 'anggota_tim'].includes(a.role));
  const auditorNameById = useMemo(() => new Map(auditors.map((a) => [a.id, a.nama_lengkap])), [auditors]);

  const set = (k: keyof FormState, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  function togglePengendali(uid: string) {
    setForm((f) => {
      const selected = f.pengendali_teknis_ids.includes(uid);
      return {
        ...f,
        pengendali_teknis_ids: selected
          ? f.pengendali_teknis_ids.filter((x) => x !== uid)
          : [...f.pengendali_teknis_ids, uid],
        // Pastikan auditor tidak dobel di role lain saat ditambahkan
        ketua_tim_ids: selected ? f.ketua_tim_ids : f.ketua_tim_ids.filter((x) => x !== uid),
        anggota_ids:   selected ? f.anggota_ids   : f.anggota_ids.filter((x) => x !== uid),
      };
    });
  }

  function toggleKetua(uid: string) {
    setForm((f) => {
      const selected = f.ketua_tim_ids.includes(uid);
      return {
        ...f,
        ketua_tim_ids:         selected ? f.ketua_tim_ids.filter((x) => x !== uid) : [...f.ketua_tim_ids, uid],
        anggota_ids:           selected ? f.anggota_ids : f.anggota_ids.filter((x) => x !== uid),
        pengendali_teknis_ids: selected ? f.pengendali_teknis_ids : f.pengendali_teknis_ids.filter((x) => x !== uid),
      };
    });
  }

  function toggleAnggota(uid: string) {
    setForm((f) => {
      const selected = f.anggota_ids.includes(uid);
      return {
        ...f,
        anggota_ids:           selected ? f.anggota_ids.filter((x) => x !== uid) : [...f.anggota_ids, uid],
        ketua_tim_ids:         selected ? f.ketua_tim_ids : f.ketua_tim_ids.filter((x) => x !== uid),
        pengendali_teknis_ids: selected ? f.pengendali_teknis_ids : f.pengendali_teknis_ids.filter((x) => x !== uid),
      };
    });
  }

  function toggleAuditeeDept(deptId: string) {
    setSelectedAuditeeDeptIds((prev) => {
      const next = prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId];
      setForm((f) => ({ ...f, auditee: formatAuditee(next) }));
      return next;
    });
  }

  function clearAuditeeSelection() {
    setSelectedAuditeeDeptIds([]);
    set('auditee', '');
    setAuditeeSearch('');
  }

  function toggleRisk(id: string) {
    setForm((f) => ({
      ...f,
      risk_ids: f.risk_ids.includes(id) ? f.risk_ids.filter((x) => x !== id) : [...f.risk_ids, id],
    }));
  }

  function toggleCeoArea(id: string) {
    setForm((f) => ({
      ...f,
      ceo_area_ids: f.ceo_area_ids.includes(id) ? f.ceo_area_ids.filter((x) => x !== id) : [...f.ceo_area_ids, id],
    }));
  }

  const allCeoAreas: CeoAreaWithLetter[] = ceoAreasRes ?? [];
  const filteredCeoAreas = useMemo(() => {
    const q = ceoAreaSearch.trim().toLowerCase();
    if (!q) return allCeoAreas;
    return allCeoAreas.filter(
      (a) =>
        a.parameter.toLowerCase().includes(q) ||
        (a.judul_surat ?? '').toLowerCase().includes(q),
    );
  }, [allCeoAreas, ceoAreaSearch]);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: CreatePlanPayload = {
        // Pastikan tahun perencanaan konsisten dengan filter tahun di halaman
        tahun_perencanaan:     `${tahun}-01-01`,
        jenis_program:        form.jenis_program,
        kategori_program:     form.kategori_program,
        judul_program:        form.judul_program,
        status_program:       form.status_program,
        auditee:              form.auditee || undefined,
        deskripsi:            form.deskripsi || undefined,
        tanggal_mulai:        form.tanggal_mulai,
        tanggal_selesai:      form.tanggal_selesai,
        pengendali_teknis_id:  form.pengendali_teknis_ids[0] || undefined,
        pengendali_teknis_ids: form.pengendali_teknis_ids.length > 0 ? form.pengendali_teknis_ids : undefined,
        ketua_tim_id:          form.ketua_tim_ids[0] || undefined,
        ketua_tim_ids:         form.ketua_tim_ids.length > 0 ? form.ketua_tim_ids : undefined,
        anggota_ids:           form.anggota_ids.length > 0 ? form.anggota_ids : undefined,
        team_alokasi:         (() => {
          if (hariPenugasanNumber === undefined || selectedTeamIds.length === 0) return undefined;
          const out: Record<string, number> = {};
          selectedTeamIds.forEach((uid) => {
            out[uid] = hariPenugasanNumber;
          });
          return out;
        })(),
        risk_ids:             form.jenis_program === 'PKPT' ? form.risk_ids : undefined,
        ceo_area_ids:         form.ceo_area_ids,
        // Finansial (Fase 5 — disederhanakan)
        anggaran:             form.anggaran          === '' ? null : Number(form.anggaran),
        kategori_anggaran:    form.kategori_anggaran === '' ? null : form.kategori_anggaran,
      };
      return isEdit ? annualPlansApi.update(editData!.id, payload) : annualPlansApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annual-plan-detail'] });
      queryClient.invalidateQueries({ queryKey: ['annual-plans'] });
      queryClient.invalidateQueries({ queryKey: ['ceo-letter'] });
      queryClient.invalidateQueries({ queryKey: ['risks'] });
      toast.success(isEdit ? 'Program berhasil diperbarui' : 'Program kerja berhasil dibuat');
      onSuccess();
    },
    onError: (err: unknown) => {
      const errorResponse = err as { response?: { data?: { message?: string } } };
      const msg = errorResponse?.response?.data?.message ?? 'Gagal menyimpan program';
      toast.error(msg);
    },
  });

  // ── FUNGSI VALIDASI KLIK (Akan memunculkan pop-up jika gagal) ──
  const handleSaveClick = () => {
    if (!form.judul_program?.trim()) {
      return toast.error('Mohon isi Judul Program terlebih dahulu.');
    }
    if (!form.tanggal_mulai || !form.tanggal_selesai) {
      return toast.error('Mohon isi Tanggal Mulai dan Tanggal Selesai.');
    }
    if (form.tanggal_selesai < form.tanggal_mulai) {
      return toast.error('Tanggal Selesai tidak boleh lebih awal dari Tanggal Mulai.');
    }
    if (form.hari_penugasan !== '') {
      const hari = Number(form.hari_penugasan);
      if (!Number.isFinite(hari) || hari < 0) {
        return toast.error('Jumlah Hari Penugasan harus berupa angka 0 atau lebih.');
      }
    }
    
    // Jika semua lolos, jalankan proses simpan ke backend
    saveMut.mutate();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col max-h-[92vh] overflow-hidden">
          
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="font-bold text-slate-800 text-base">
                {isEdit ? 'Edit Program Kerja' : 'Buat Program Kerja Baru'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Tahun {tahun}</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-5 space-y-6">
            <section>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Informasi Program</h3>
              
              {/* === LAYOUT INPUT VERTIKAL === */}
              <div className="flex flex-col gap-4">
                
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Jenis Program <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {(['PKPT', 'Non PKPT'] as JenisProgram[]).map((j) => (
                      <button
                        key={j} type="button" onClick={() => set('jenis_program', j)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                          form.jenis_program === j ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {j}
                        <span className="block text-xs font-normal text-current opacity-60 mt-0.5">
                          {j === 'PKPT' ? 'Berbasis risiko' : 'Independen / Ad-hoc'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Judul Program <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.judul_program}
                    onChange={(e) => set('judul_program', e.target.value)}
                    placeholder="cth: Audit Keuangan & Pengadaan Q1 2026"
                    className="input text-sm w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Kategori</label>
                  <select value={form.kategori_program} onChange={(e) => set('kategori_program', e.target.value)} className="input text-sm w-full">
                    {kategoriOptions.length === 0 && <option value="">— Belum ada nilai —</option>}
                    {kategoriOptions.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Sifat Program</label>
                  <select value={form.status_program} onChange={(e) => set('status_program', e.target.value)} className="input text-sm w-full">
                    {sifatOptions.length === 0 && <option value="">— Belum ada nilai —</option>}
                    {sifatOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Auditee (Departemen yang Diaudit)
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setAuditeeOpen((open) => !open)}
                      className="w-full min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={selectedAuditeeDeptIds.length > 0 ? 'text-slate-700 font-medium' : 'text-slate-400'}>
                          {selectedAuditeeDeptIds.length > 0
                            ? `${selectedAuditeeDeptIds.length} departemen dipilih`
                            : 'Pilih satu atau lebih departemen'}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${auditeeOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {auditeeOpen && (
                      <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                        <div className="border-b border-slate-100 p-3">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <input
                              value={auditeeSearch}
                              onChange={(e) => setAuditeeSearch(e.target.value)}
                              placeholder="Cari departemen atau divisi..."
                              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-300"
                            />
                          </div>
                        </div>

                        <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
                          {isDivisiLoading || isDepartemenLoading ? (
                            <div className="flex items-center justify-center gap-2 px-4 py-5 text-xs text-slate-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Memuat master departemen...
                            </div>
                          ) : filteredDepartemen.length === 0 ? (
                            <p className="px-4 py-5 text-center text-xs text-slate-400">Departemen tidak ditemukan.</p>
                          ) : (
                            filteredDepartemen.map((dept) => {
                              const checked = selectedAuditeeDeptIds.includes(dept.id);
                              const divisiName = divisiById.get(dept.divisi_id)?.nama ?? 'Divisi belum terpetakan';

                              return (
                                <label
                                  key={dept.id}
                                  className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors ${checked ? 'bg-primary-50' : 'hover:bg-slate-50'}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAuditeeDept(dept.id)}
                                    className="mt-0.5 flex-shrink-0 rounded text-primary-600"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-slate-700">{dept.nama}</span>
                                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                                      <Building2 className="h-3 w-3" />
                                      {divisiName}
                                    </span>
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>

                        {selectedAuditeeDeptIds.length > 0 && (
                          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-3 py-2">
                            <span className="text-xs font-medium text-slate-500">{selectedAuditeeDeptIds.length} departemen terpilih</span>
                            <button type="button" onClick={clearAuditeeSelection} className="text-xs font-semibold text-red-600 hover:text-red-700">
                              Hapus pilihan
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedAuditeeGroups.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-3">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary-700">Divisi otomatis mengikuti</p>
                      <div className="space-y-2">
                        {selectedAuditeeGroups.map((group) => (
                          <div key={group.divisiName}>
                            <p className="text-xs font-semibold text-slate-700">{group.divisiName}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {group.departments.map((dept) => (
                                <span key={dept.id} className="rounded-full border border-primary-200 bg-white px-2 py-0.5 text-xs text-primary-700">
                                  {dept.nama}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : form.auditee ? (
                    <p className="mt-2 text-xs text-slate-400">Data lama: {form.auditee}</p>
                  ) : null}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Deskripsi / Latar Belakang
                  </label>
                  <textarea
                    rows={3}
                    value={form.deskripsi}
                    onChange={(e) => set('deskripsi', e.target.value)}
                    placeholder="Jelaskan latar belakang dan ruang lingkup program audit ini..."
                    className="input text-sm resize-none w-full"
                  />
                </div>
              </div>
            </section>

            <section className="border-t border-slate-100 pt-5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Anggaran</h3>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Anggaran (Rupiah)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={form.anggaran}
                      onChange={(e) => set('anggaran', e.target.value)}
                      placeholder="cth: 25000000"
                      className="input text-sm w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Kategori Anggaran
                    </label>
                    <select
                      value={form.kategori_anggaran}
                      onChange={(e) => set('kategori_anggaran', e.target.value)}
                      className="input text-sm w-full"
                    >
                      <option value="">— Pilih Kategori —</option>
                      {kategoriAnggaranOptions.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 mt-1">
                  <b>Man-Days terpakai</b> program ini dihitung otomatis dari tim × hari penugasan × bobot peran. Pagu HP tahunan SPI dipantau lewat tab Man-Days.
                </p>
              </div>
            </section>

            <section className="border-t border-slate-100 pt-5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Timeline Pelaksanaan</h3>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Tanggal Mulai <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.tanggal_mulai}
                    onChange={(e) => set('tanggal_mulai', e.target.value)}
                    className="input text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Tanggal Selesai <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.tanggal_selesai}
                    min={form.tanggal_mulai}
                    onChange={(e) => set('tanggal_selesai', e.target.value)}
                    className="input text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Jumlah Hari Penugasan
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={form.hari_penugasan}
                      onChange={(e) => set('hari_penugasan', e.target.value)}
                      placeholder={estimasi_hari > 0 ? String(estimasi_hari) : 'cth: 30'}
                      className="input text-sm w-full pr-14"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                      hari
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Berlaku untuk seluruh tim. Kosongkan untuk memakai durasi kalender program.
                  </p>
                </div>
              </div>

              {estimasi_hari > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary-500" />
                  <span className="text-sm text-slate-600">
                    Durasi Kalender:
                    <span className="ml-2 font-bold text-primary-700 text-base">{estimasi_hari}</span>
                    <span className="text-slate-400 text-xs ml-1">hari</span>
                  </span>
                </div>
              )}
            </section>

            <section className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tim Auditor (SDM)</h3>
                {jumlah_personil > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 rounded-full">
                    <Users className="w-3.5 h-3.5 text-primary-600" />
                    <span className="text-xs font-bold text-primary-700">{jumlah_personil} personil</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Pengendali Teknis {form.pengendali_teknis_ids.length > 0 && <span className="ml-2 text-primary-600">({form.pengendali_teknis_ids.length} dipilih)</span>}
                  </label>
                  <button type="button" onClick={() => setPengendaliOpen((o) => !o)} className="w-full flex items-center justify-between input text-sm text-left">
                    <span className={form.pengendali_teknis_ids.length > 0 ? 'text-slate-700 truncate' : 'text-slate-400'}>
                      {form.pengendali_teknis_ids.length > 0
                        ? form.pengendali_teknis_ids.map((id) => auditorNameById.get(id)).filter(Boolean).join(', ')
                        : '— Pilih Pengendali Teknis —'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${pengendaliOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {pengendaliOpen && (
                    <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-50">
                        {pengendaliOptions.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-slate-400 text-center">Tidak ada auditor tersedia</p>
                        ) : (
                          pengendaliOptions.map((a) => {
                            const checked = form.pengendali_teknis_ids.includes(a.id);
                            return (
                              <label key={a.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-primary-50' : 'hover:bg-slate-50'}`}>
                                <input type="checkbox" checked={checked} onChange={() => togglePengendali(a.id)} className="rounded text-primary-600 flex-shrink-0" />
                                <span className="text-sm text-slate-700 flex-1">{a.nama_lengkap}</span>
                                <span className="text-xs text-slate-400 capitalize">{a.role.replace('_', ' ')}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {form.pengendali_teknis_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {form.pengendali_teknis_ids.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700">
                          {auditorNameById.get(id) ?? 'Auditor'}
                          <button type="button" onClick={() => togglePengendali(id)} className="text-primary-500 hover:text-primary-800">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Ketua Tim {form.ketua_tim_ids.length > 0 && <span className="ml-2 text-primary-600">({form.ketua_tim_ids.length} dipilih)</span>}
                  </label>
                  <button type="button" onClick={() => setKetuaOpen((o) => !o)} className="w-full flex items-center justify-between input text-sm text-left">
                    <span className={form.ketua_tim_ids.length > 0 ? 'text-slate-700 truncate' : 'text-slate-400'}>
                      {form.ketua_tim_ids.length > 0
                        ? form.ketua_tim_ids.map((id) => auditorNameById.get(id)).filter(Boolean).join(', ')
                        : '— Pilih Ketua Tim —'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${ketuaOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {ketuaOpen && (
                    <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-50">
                        {ketuaOptions.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-slate-400 text-center">Tidak ada auditor tersedia</p>
                        ) : (
                          ketuaOptions.map((a) => {
                            const checked = form.ketua_tim_ids.includes(a.id);
                            const disabled = form.pengendali_teknis_ids.includes(a.id);
                            return (
                              <label key={a.id} className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : checked ? 'cursor-pointer bg-primary-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleKetua(a.id)} className="rounded text-primary-600 flex-shrink-0" />
                                <span className="text-sm text-slate-700 flex-1">{a.nama_lengkap}</span>
                                <span className="text-xs text-slate-400 capitalize">{a.role.replace('_', ' ')}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {form.ketua_tim_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {form.ketua_tim_ids.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700">
                          {auditorNameById.get(id) ?? 'Auditor'}
                          <button type="button" onClick={() => toggleKetua(id)} className="text-primary-500 hover:text-primary-800">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Anggota Tim {form.anggota_ids.length > 0 && <span className="ml-2 text-primary-600">({form.anggota_ids.length} dipilih)</span>}
                  </label>
                  <button type="button" onClick={() => setAnggotaOpen((o) => !o)} className="w-full flex items-center justify-between input text-sm text-left">
                    <span className={form.anggota_ids.length > 0 ? 'text-slate-700 truncate' : 'text-slate-400'}>
                      {form.anggota_ids.length > 0
                        ? form.anggota_ids.map((id) => auditorNameById.get(id)).filter(Boolean).join(', ')
                        : '— Pilih Anggota Tim —'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${anggotaOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {anggotaOpen && (
                    <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-50">
                        {anggotaOptions.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-slate-400 text-center">Tidak ada auditor tersedia</p>
                        ) : (
                          anggotaOptions.map((a) => {
                            const checked = form.anggota_ids.includes(a.id);
                            const disabled = form.pengendali_teknis_ids.includes(a.id);
                            return (
                              <label key={a.id} className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : checked ? 'cursor-pointer bg-primary-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleAnggota(a.id)} className="rounded text-primary-600 flex-shrink-0" />
                                <span className="text-sm text-slate-700 flex-1">{a.nama_lengkap}</span>
                                <span className="text-xs text-slate-400 capitalize">{a.role.replace('_', ' ')}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {form.anggota_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {form.anggota_ids.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                          {auditorNameById.get(id) ?? 'Auditor'}
                          <button type="button" onClick={() => toggleAnggota(id)} className="text-slate-400 hover:text-slate-700">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Dasar Pengawasan ─────────────────────────────── */}
            <section className="border-t border-slate-100 pt-5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Dasar Pengawasan</h3>

              {/* ── Arahan Surat Direksi / Komisaris ── */}
              <div className="mb-5">
                <div className="flex items-center gap-1.5 mb-2">
                  <FileText className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-700">Arahan Surat Direksi / Komisaris</span>
                  {form.ceo_area_ids.length > 0 && (
                    <span className="ml-auto text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                      {form.ceo_area_ids.length} dipilih
                    </span>
                  )}
                </div>

                {/* Selected chips */}
                {form.ceo_area_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {form.ceo_area_ids.map((id) => {
                      const area = allCeoAreas.find((a) => a.id === id);
                      if (!area) return null;
                      const isK = area.target_tipe === 'Komisaris';
                      return (
                        <span key={id} className={`inline-flex items-center gap-1 text-[11px] border rounded-full pl-2 pr-1 py-0.5 font-medium ${isK ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                          {area.parameter}
                          <button type="button" onClick={() => toggleCeoArea(id)} className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ml-0.5 ${isK ? 'bg-violet-200 hover:bg-violet-300 text-violet-700' : 'bg-indigo-200 hover:bg-indigo-300 text-indigo-700'}`}>
                            <X className="w-2 h-2" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {allCeoAreas.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-xl">
                    Belum ada arahan surat Direksi/Komisaris untuk tahun {tahun}.
                  </p>
                ) : (
                  <>
                    <div className="relative mb-1.5">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input value={ceoAreaSearch} onChange={(e) => setCeoAreaSearch(e.target.value)} placeholder="Cari area pengawasan..." className="input pl-8 text-xs py-1.5 w-full" />
                    </div>
                    <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
                      {filteredCeoAreas.length === 0 ? (
                        <p className="px-4 py-5 text-xs text-slate-400 text-center">Tidak ada area yang cocok.</p>
                      ) : (
                        filteredCeoAreas.map((area) => {
                          const checked = form.ceo_area_ids.includes(area.id!);
                          const isK = area.target_tipe === 'Komisaris';
                          return (
                            <label key={area.id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer transition-colors border ${
                              checked
                                ? (isK ? 'bg-violet-100 border-violet-200' : 'bg-indigo-100 border-indigo-200')
                                : (isK ? 'bg-violet-50 border-violet-100 hover:bg-violet-100' : 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100')
                            }`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleCeoArea(area.id!)} className={`rounded flex-shrink-0 ${isK ? 'text-violet-600' : 'text-indigo-600'}`} />
                              <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isK ? 'text-violet-400' : 'text-indigo-400'}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{area.parameter}</p>
                                <p className="text-[10px] text-slate-500 truncate">{area.judul_surat}</p>
                              </div>
                              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isK ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                  {area.target_tipe}
                                </span>
                                {!isK && area.target_unit && (
                                  <span className="text-[9px] text-slate-400 font-medium">{area.target_unit}</span>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* ── Risiko RCSA ── */}
              {form.jenis_program === 'PKPT' && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-700">Risiko RCSA (Top 20)</span>
                    {form.risk_ids.length > 0 && (
                      <span className="ml-auto text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                        {form.risk_ids.length} dipilih
                      </span>
                    )}
                  </div>

                  {/* Selected risk chips */}
                  {form.risk_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {form.risk_ids.map((id) => {
                        const risk = allRisks.find((r) => r.id === id);
                        if (!risk) return null;
                        return (
                          <span key={id} className="inline-flex items-center gap-1 text-[11px] bg-slate-100 border border-slate-200 text-slate-700 rounded-full pl-2 pr-1 py-0.5 font-mono font-semibold">
                            {risk.id_risiko}
                            <button type="button" onClick={() => toggleRisk(id)} className="w-3.5 h-3.5 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center ml-0.5">
                              <X className="w-2 h-2" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="relative mb-1.5">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input value={riskSearch} onChange={(e) => setRiskSearch(e.target.value)} placeholder="Cari risk code atau nama risiko..." className="input pl-8 text-xs py-1.5 w-full" />
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
                    {filteredRisks.length === 0 ? (
                      <p className="px-4 py-5 text-xs text-slate-400 text-center">Tidak ada Top 20 risiko level Ekstrim s/d Menengah Tinggi.</p>
                    ) : (
                      filteredRisks.map((risk) => {
                        const checked = form.risk_ids.includes(risk.id);
                        const lvl = risk.level_inherent;
                        const bl = lvl === 'E' ? 'border-l-red-500' : lvl === 'T' ? 'border-l-orange-400' : lvl === 'MT' ? 'border-l-amber-400' : lvl === 'M' ? 'border-l-yellow-400' : 'border-l-slate-300';
                        const lvlCls = lvl === 'E' ? 'bg-red-50 text-red-700' : lvl === 'T' ? 'bg-orange-50 text-orange-700' : lvl === 'MT' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600';
                        return (
                          <label key={risk.id} className={`flex items-start gap-2.5 cursor-pointer rounded-lg border border-l-[3px] ${bl} px-3 py-2 transition-colors ${checked ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleRisk(risk.id)} className="rounded text-slate-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-slate-700">{risk.id_risiko}</span>
                                {lvl && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${lvlCls}`}>{lvl} · {risk.skor_inherent}</span>}
                              </div>
                              <p className="text-xs text-slate-700 line-clamp-2 leading-snug">{risk.nama_risiko}</p>
                              {risk.divisi && <p className="text-[10px] text-slate-400 mt-0.5">{risk.divisi}</p>}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex-shrink-0">
            {overworkAlerts.length > 0 && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-800">
                  <p className="font-bold mb-1">Peringatan Overwork</p>
                  <ul className="space-y-0.5">
                    {overworkAlerts.map((a) => (
                      <li key={a.user_id + a.role_tim}><b>{a.nama}</b> ({a.role_tim}) di bulan {a.months.join(', ')}.</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={onClose} className="btn-secondary text-sm">Batal</button>
              {/* TOMBOL SIMPAN DIUBAH AGAR MEMBERIKAN ALERT JIKA ADA YANG KOSONG */}
              <button 
                type="button" 
                onClick={handleSaveClick} 
                disabled={saveMut.isPending} 
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
              >
                {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEdit ? 'Simpan Perubahan' : 'Simpan Draft'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
