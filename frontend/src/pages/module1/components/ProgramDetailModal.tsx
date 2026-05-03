import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  X, Pencil, Trash2, CheckCircle2, Users, CalendarDays, Clock,
  AlertCircle, Loader2, ShieldCheck, Building2, FileText, AlertTriangle,
} from 'lucide-react';
import { annualPlansApi, settingsApi } from '../../../services/api';
import { AnnualAuditPlan, AnnualAuditPlanDetail, RiskLevelKode } from '../../../types';
import toast from 'react-hot-toast';

interface Props {
  programId: string;
  onClose: () => void;
  onEdit?: (plan: AnnualAuditPlan) => void;
  onFinalize?: (id: string) => void;
  onDelete?: (plan: AnnualAuditPlan) => void;
}

const LEVEL_BADGE: Record<RiskLevelKode, string> = {
  E:  'bg-red-100 text-red-700',
  T:  'bg-orange-50 text-orange-700',
  MT: 'bg-amber-50 text-amber-700',
  M:  'bg-yellow-50 text-yellow-700',
  RM: 'bg-lime-50 text-lime-700',
  R:  'bg-green-50 text-green-700',
};

function parseAuditeeGroups(auditee?: string | null) {
  if (!auditee) return [];
  return auditee
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [divisi, departments] = part.split(':');
      return {
        divisi: departments ? divisi.trim() : 'Auditee',
        departments: (departments ?? divisi).split(',').map((dept) => dept.trim()).filter(Boolean),
      };
    });
}

function countAuditeeDepartments(groups: ReturnType<typeof parseAuditeeGroups>) {
  return groups.reduce((sum, group) => sum + group.departments.length, 0);
}

export default function ProgramDetailModal({ programId, onClose, onEdit, onFinalize, onDelete }: Props) {
  const { data: plan, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['annual-plan-detail', programId],
    queryFn: async () => {
      const res = await annualPlansApi.getById(programId);
      return res.data.data as AnnualAuditPlanDetail;
    },
  });

  useEffect(() => {
    if (isError) toast.error('Gagal memuat detail program');
  }, [isError]);

  function fmtDate(d?: string) {
    if (!d) return '—';
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const auditeeGroups          = parseAuditeeGroups(plan?.auditee);
  const auditeeDepartmentCount = countAuditeeDepartments(auditeeGroups);
  const hariPenugasan = plan
    ? (plan.team?.find((member) => member.hari_alokasi != null)?.hari_alokasi ?? plan.estimasi_hari ?? 0)
    : 0;

  const tahunProgram = plan?.tahun_perencanaan
    ? new Date(plan.tahun_perencanaan).getFullYear()
    : new Date().getFullYear();

  const { data: bobotPeranList } = useQuery({
    queryKey: ['bobot-peran', tahunProgram],
    queryFn: () => settingsApi.getBobotPeran(tahunProgram).then((r) => r.data.data ?? []),
    enabled: !!plan,
    staleTime: 5 * 60_000,
  });

  const bobotByRoleTim = useMemo(() => {
    const map: Record<string, number> = {};
    (bobotPeranList ?? []).forEach((b) => { map[b.peran] = Number(b.bobot); });
    return map;
  }, [bobotPeranList]);

  const memberMandays = useMemo(() => {
    if (!plan?.team) return new Map<string, number>();
    const m = new Map<string, number>();
    plan.team.forEach((mb) => {
      const hari  = Number(mb.hari_alokasi ?? hariPenugasan ?? 0);
      const bobot = bobotByRoleTim[mb.role_tim] ?? 0;
      m.set(mb.id, Number((hari * bobot).toFixed(2)));
    });
    return m;
  }, [plan?.team, bobotByRoleTim, hariPenugasan]);

  const canFinalize = onFinalize && plan && plan.status_pkpt !== 'Closed';
  const canEdit     = onEdit && plan && plan.status_pkpt !== 'Closed';
  const canDelete   = onDelete && plan && plan.status_pkpt === 'Open';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">

          {/* ── Header ── */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 flex-shrink-0">
            {isLoading ? (
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`badge border ${plan?.jenis_program === 'PKPT' ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                    {plan?.jenis_program}
                  </span>
                  <span className={`badge ${
                    plan?.status_pkpt === 'Closed'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : plan?.status_pkpt === 'On Progress'
                        ? 'bg-primary-50 text-primary-700 border border-primary-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {plan?.status_pkpt === 'Closed' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {plan?.status_pkpt}
                  </span>
                </div>
                <h2 className="font-bold text-slate-800 text-base leading-snug">{plan?.judul_program}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{plan?.kategori_program} · {plan?.status_program} · Tahun {plan?.tahun}</p>
              </div>
            )}
            <button type="button" onClick={onClose} className="btn-icon text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-5 space-y-5">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />)}
                <Loader2 className="w-6 h-6 text-slate-300 animate-spin mx-auto mt-4" />
              </div>
            ) : isError ? (
              <div className="text-center py-8">
                <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">Gagal memuat detail program.</p>
                <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary text-xs mt-3">Coba lagi</button>
              </div>
            ) : !plan ? (
              <div className="text-center py-8">
                <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Program tidak ditemukan.</p>
              </div>
            ) : (
              <>
                {/* Periode banner */}
                <div className="col-span-2 bg-primary-50 rounded-xl p-4 flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary-600" />
                    <div>
                      <p className="text-xs text-primary-500 font-medium">Periode</p>
                      <p className="text-sm font-bold text-primary-800">{fmtDate(plan.tanggal_mulai)} — {fmtDate(plan.tanggal_selesai)}</p>
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-primary-500 font-medium">Hari Penugasan</p>
                    <p className="text-2xl font-black text-primary-700">{hariPenugasan} <span className="text-sm font-semibold ml-1">hari</span></p>
                  </div>
                </div>

                {/* Auditee */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="section-label">Auditee</p>
                        <p className="text-sm font-semibold text-slate-800">Unit yang menjadi objek audit</p>
                      </div>
                    </div>
                    {auditeeGroups.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="badge bg-primary-50 border border-primary-200 text-primary-700">{auditeeGroups.length} divisi</span>
                        <span className="badge bg-white border border-slate-200 text-slate-600">{auditeeDepartmentCount} departemen</span>
                      </div>
                    )}
                  </div>
                  {auditeeGroups.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {auditeeGroups.map((group) => (
                        <div key={`${group.divisi}-${group.departments.join('-')}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[190px_1fr] sm:gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-700">{group.divisi}</p>
                            <p className="text-[11px] font-medium text-slate-400">{group.departments.length} departemen</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {group.departments.map((dept) => (
                              <span key={dept} className="badge bg-primary-50 border border-primary-100 text-primary-700">{dept}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-5 text-sm text-slate-400">Belum ada auditee yang dipilih.</div>
                  )}
                </div>

                {/* Anggaran & Man-Days */}
                {(plan.anggaran != null || plan.man_days_terpakai != null || plan.kategori_anggaran) && (
                  <div className="border-t border-slate-100 pt-4">
                    <p className="section-label mb-3">Anggaran & Man-Days</p>
                    <div className="grid grid-cols-2 gap-4">
                      {plan.anggaran != null && (
                        <div>
                          <p className="section-label mb-0.5">Anggaran</p>
                          <p className="text-sm font-bold text-slate-800">Rp {Number(plan.anggaran).toLocaleString('id-ID')}</p>
                        </div>
                      )}
                      {plan.kategori_anggaran && (
                        <div>
                          <p className="section-label mb-0.5">Kategori Anggaran</p>
                          <span className={`badge border ${plan.kategori_anggaran === 'Subsidi' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                            {plan.kategori_anggaran}
                          </span>
                        </div>
                      )}
                      {plan.man_days_terpakai != null && (
                        <div className="col-span-2">
                          <p className="section-label mb-0.5">Man-Days Terpakai</p>
                          <p className="text-sm font-bold text-primary-700">
                            {Number(plan.man_days_terpakai).toFixed(2)}
                            <span className="text-[11px] font-normal text-slate-400 ml-1.5">(auto-calc dari tim × hari penugasan × bobot peran)</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Deskripsi */}
                {plan.deskripsi && (
                  <div className="border-t border-slate-100 pt-4">
                    <p className="section-label mb-2">Deskripsi</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{plan.deskripsi}</p>
                  </div>
                )}

                {/* Tim Auditor */}
                {plan.team && plan.team.length > 0 && (
                  <div className="border-t border-slate-100 pt-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="section-label">Tim Auditor</p>
                      <span className="badge bg-primary-50 border border-primary-100 text-primary-700">
                        <Users className="h-3.5 w-3.5" /> {plan.team.length} personil
                      </span>
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <div className="badge bg-slate-50 border border-slate-200 text-slate-600 py-2 px-3">
                        <CalendarDays className="h-3.5 w-3.5 text-primary-500" />
                        Hari Penugasan: <span className="text-primary-700 font-bold">{hariPenugasan} hari</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {plan.team.map((member) => {
                        const mdMember   = memberMandays.get(member.id) ?? 0;
                        const bobotMember = bobotByRoleTim[member.role_tim];
                        const hariMember  = Number(member.hari_alokasi ?? hariPenugasan ?? 0);
                        return (
                          <div key={member.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
                            <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
                              {member.nama_lengkap.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{member.nama_lengkap}</p>
                              <p className="text-xs text-slate-400">{member.jabatan || member.role.replace('_', ' ')}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className={`badge text-xs ${member.role_tim === 'Pengendali Teknis' ? 'bg-blue-50 text-blue-700' : member.role_tim === 'Ketua Tim' ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-600'}`}>
                                {member.role_tim}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-700" title={`${hariMember} hari × bobot ${bobotMember ?? '?'} = ${mdMember.toFixed(2)} HP`}>
                                {mdMember.toFixed(2)} <span className="text-[10px] font-normal text-slate-400">HP</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Dasar Pengawasan */}
                {((plan.ceo_areas && plan.ceo_areas.length > 0) || (plan.risks && plan.risks.length > 0)) && (
                  <div className="border-t border-slate-100 pt-4 space-y-4">
                    <p className="section-label">Dasar Pengawasan</p>

                    {/* Arahan Surat */}
                    {plan.ceo_areas && plan.ceo_areas.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <FileText className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="text-xs font-semibold text-slate-700">Arahan Surat Direksi / Komisaris</span>
                          <span className="ml-auto text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                            {plan.ceo_areas.length} arahan
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {plan.ceo_areas.map((area) => {
                            const isDireksi = area.target_tipe !== 'Komisaris';
                            return (
                              <div key={area.id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 border ${isDireksi ? 'bg-indigo-50 border-indigo-100' : 'bg-violet-50 border-violet-100'}`}>
                                <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isDireksi ? 'text-indigo-500' : 'text-violet-500'}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 truncate">{area.parameter}</p>
                                  <p className="text-[10px] text-slate-500 truncate">{area.judul_surat}{area.nomor_surat ? ` · ${area.nomor_surat}` : ''}</p>
                                </div>
                                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isDireksi ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700'}`}>
                                    {area.target_tipe}
                                  </span>
                                  {isDireksi && area.target_unit && (
                                    <span className="text-[9px] text-slate-400 font-medium">{area.target_unit}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Risiko RCSA */}
                    {plan.risks && plan.risks.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs font-semibold text-slate-700">Risiko RCSA</span>
                          <span className="ml-auto text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                            {plan.risks.length} risiko
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {plan.risks.map((risk) => {
                            const lvl = risk.level_inherent as RiskLevelKode | undefined;
                            const bl = lvl === 'E' ? 'border-l-red-500' : lvl === 'T' ? 'border-l-orange-400' : lvl === 'MT' ? 'border-l-amber-400' : lvl === 'M' ? 'border-l-yellow-400' : 'border-l-slate-300';
                            const lvlCls = lvl ? (LEVEL_BADGE[lvl] ?? 'bg-slate-100 text-slate-600') : '';
                            return (
                              <div key={risk.id} className={`border border-slate-200 border-l-[3px] ${bl} rounded-lg px-3 py-2 bg-white`}>
                                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                  <span className="font-mono text-xs font-bold text-slate-700">{risk.id_risiko}</span>
                                  {lvl && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${lvlCls}`}>{lvl} · {risk.skor_inherent}</span>}
                                </div>
                                <p className="text-xs text-slate-700 line-clamp-2 leading-snug">{risk.nama_risiko}</p>
                                {risk.divisi && <p className="text-[10px] text-slate-400 mt-0.5">{risk.divisi}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
            {/* Left: destructive actions */}
            <div className="flex items-center gap-2">
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete!(plan as unknown as AnnualAuditPlan)}
                  className="btn-danger"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus
                </button>
              )}
            </div>

            {/* Right: primary actions */}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="btn-secondary">Tutup</button>
              {canFinalize && (
                <button
                  type="button"
                  onClick={() => onFinalize!(plan.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Tutup Program
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onEdit!(plan as unknown as AnnualAuditPlan)}
                  className="btn-primary"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit Program
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
