import { type ReactNode } from 'react';
import { X, Pencil, Trash2, Building2, Target, Shield, AlertTriangle, Info } from 'lucide-react';
import { RiskData, RiskLevelKode } from '../../../types';

interface Props {
  risk: RiskData;
  open?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const LEVEL_DEFAULTS: Record<RiskLevelKode, { bg: string; text: string; border: string; label: string }> = {
  E:  { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-300',     label: 'Ekstrim' },
  T:  { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-300',  label: 'Tinggi' },
  MT: { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-300',   label: 'Menengah Tinggi' },
  M:  { bg: 'bg-yellow-100',  text: 'text-yellow-700',  border: 'border-yellow-300',  label: 'Menengah' },
  RM: { bg: 'bg-lime-100',    text: 'text-lime-700',    border: 'border-lime-300',    label: 'Rendah Menengah' },
  R:  { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-300',   label: 'Rendah' },
};

function LevelBadge({ level, skor, label }: { level?: RiskLevelKode; skor?: number; label?: string }) {
  if (!level && !skor) return <span className="text-slate-400 text-sm">—</span>;
  const d = level ? LEVEL_DEFAULTS[level] : null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border
      ${d ? `${d.bg} ${d.text} ${d.border}` : 'bg-slate-100 text-slate-600 border-slate-200'}`}
    >
      {level && <span className="font-mono">{level}</span>}
      {skor !== undefined && <span className="opacity-75">({skor})</span>}
      {(label ?? d?.label) && <span className="hidden sm:inline">{label ?? d?.label}</span>}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="section-label mb-0.5">{label}</p>
      <p className="text-sm text-slate-700 leading-relaxed">{value || '—'}</p>
    </div>
  );
}

export default function RiskDetailModal({ risk, onClose, onEdit, onDelete }: Props) {
  const inherentLevel = risk.level_inherent as RiskLevelKode | undefined;
  const headerDef = inherentLevel ? LEVEL_DEFAULTS[inherentLevel] : null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[92vh]">

          {/* ── Colored header ─── */}
          <div className={`px-6 py-4 border-b flex-shrink-0 ${
            headerDef ? `${headerDef.bg} ${headerDef.border}` : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  {risk.id_risiko && (
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white/70 text-slate-700 border border-slate-200">
                      {risk.id_risiko}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">Tahun {risk.tahun}</span>
                  <span className={`badge ${
                    risk.source === 'Import' ? 'bg-blue-100 text-blue-700'
                    : risk.source === 'TRUST' ? 'bg-purple-100 text-purple-700'
                    : 'bg-slate-100 text-slate-600'
                  }`}>
                    {risk.source}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{risk.nama_risiko}</p>
              </div>
              <button onClick={onClose} className="btn-icon text-slate-400 hover:text-slate-600 hover:bg-white/60 flex-shrink-0 mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Body ───────────────────────────────────── */}
          <div className="overflow-y-auto flex-1">
            <Section icon={<Building2 className="w-3.5 h-3.5" />} title="Organisasi">
              <div className="grid grid-cols-3 gap-4">
                <InfoRow label="Direktorat" value={risk.direktorat} />
                <InfoRow label="Divisi" value={risk.divisi} />
                <InfoRow label="Departemen" value={risk.departemen} />
              </div>
            </Section>

            {(risk.sasaran_korporat || risk.sasaran_bidang || risk.hos_kategori_nama || risk.sasaran_strategis_nama || risk.sasaran_strategis_parent_nama) && (
              <Section icon={<Target className="w-3.5 h-3.5" />} title="Sasaran & House of Strategy">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {risk.hos_kategori_nama && <InfoRow label="Perspektif HoS" value={risk.hos_kategori_nama} />}
                  {risk.sasaran_strategis_parent_nama && (
                    <InfoRow label="Sasaran Strategis" value={risk.sasaran_strategis_parent_nama} />
                  )}
                  {risk.sasaran_strategis_nama && (
                    <InfoRow label="Sub Sasaran Strategis" value={risk.sasaran_strategis_nama} />
                  )}
                  {risk.sasaran_korporat && <InfoRow label="Sasaran Korporat" value={risk.sasaran_korporat} />}
                  {risk.sasaran_bidang && <InfoRow label="Sasaran Bidang" value={risk.sasaran_bidang} />}
                </div>
              </Section>
            )}

            <Section icon={<Info className="w-3.5 h-3.5" />} title="Detail Risiko">
              <div className="space-y-3">
                <div>
                  <p className="section-label mb-1">Nama Risiko / Peluang</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{risk.nama_risiko}</p>
                </div>
                {risk.parameter_kemungkinan && <InfoRow label="Parameter Kemungkinan" value={risk.parameter_kemungkinan} />}
              </div>
            </Section>

            <Section icon={<Shield className="w-3.5 h-3.5" />} title="Tingkat Risiko">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left section-label pb-2 pr-4 w-1/3">Inherent</th>
                      <th className="text-left section-label pb-2 pr-4 w-1/3">Target</th>
                      <th className="text-left section-label pb-2 w-1/3">Realisasi Eksisting</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="pt-2 pr-4"><LevelBadge level={risk.level_inherent as RiskLevelKode} skor={risk.skor_inherent} label={risk.label_inherent} /></td>
                      <td className="pt-2 pr-4"><LevelBadge level={risk.level_target as RiskLevelKode} skor={risk.skor_target} label={risk.label_target} /></td>
                      <td className="pt-2"><LevelBadge level={risk.level_realisasi as RiskLevelKode} skor={risk.skor_realisasi} label={risk.label_realisasi} /></td>
                    </tr>
                    {(risk.tingkat_risiko_inherent || risk.tingkat_risiko_target || risk.realisasi_tingkat_risiko) && (
                      <tr>
                        <td className="pt-1 pr-4"><span className="font-mono text-xs text-slate-400">{risk.tingkat_risiko_inherent ?? '—'}</span></td>
                        <td className="pt-1 pr-4"><span className="font-mono text-xs text-slate-400">{risk.tingkat_risiko_target ?? '—'}</span></td>
                        <td className="pt-1"><span className="font-mono text-xs text-slate-400">{risk.realisasi_tingkat_risiko ?? '—'}</span></td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {risk.skor_inherent !== undefined && risk.skor_realisasi !== undefined && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-slate-500">Selisih Inherent vs Realisasi:</span>
                    {(() => {
                      const delta = (risk.skor_inherent ?? 0) - (risk.skor_realisasi ?? 0);
                      return (
                        <span className={`badge ${delta > 0 ? 'bg-green-100 text-green-700' : delta < 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                          {delta > 0 ? `-${delta}` : delta < 0 ? `+${Math.abs(delta)}` : '0'} poin
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            </Section>

            {risk.pelaksanaan_mitigasi && (
              <Section icon={<Shield className="w-3.5 h-3.5" />} title="Pelaksanaan Mitigasi">
                <p className="text-sm text-slate-700 leading-relaxed">{risk.pelaksanaan_mitigasi}</p>
              </Section>
            )}

            {(risk.penyebab_internal || risk.penyebab_eksternal) && (
              <Section icon={<AlertTriangle className="w-3.5 h-3.5" />} title="Penyebab Risiko">
                <div className="grid grid-cols-2 gap-4">
                  {risk.penyebab_internal && (
                    <div>
                      <p className="section-label mb-1">Internal</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{risk.penyebab_internal}</p>
                    </div>
                  )}
                  {risk.penyebab_eksternal && (
                    <div>
                      <p className="section-label mb-1">Eksternal</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{risk.penyebab_eksternal}</p>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Program Terkait */}
            {(() => {
              const programs = risk.programs;
              if (!programs || programs.length === 0) return null;
              const programList = programs as Array<{ id: string; judul_program: string; status_pkpt: string }>;
              return (
                <div className="px-6 py-4 border-t border-slate-100">
                  <p className="section-label mb-2">Program Kerja Terkait ({programList.length})</p>
                  <div className="space-y-1.5">
                    {programList.map((p, i) => (
                      <div key={p.id ?? i} className="flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50 rounded-lg">
                        <p className="text-xs text-slate-700 font-medium line-clamp-1 flex-1">{p.judul_program}</p>
                        <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          p.status_pkpt === 'Closed' ? 'bg-slate-200 text-slate-600' :
                          p.status_pkpt === 'On Progress' ? 'bg-blue-100 text-blue-700' :
                          'bg-amber-50 text-amber-700'
                        }`}>{p.status_pkpt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="px-6 py-3 border-t border-slate-50 flex items-center gap-4 flex-wrap">
              {risk.imported_by_nama && (
                <p className="text-xs text-slate-400">Diimpor oleh <span className="font-semibold text-slate-600">{risk.imported_by_nama}</span></p>
              )}
              {risk.created_at && (
                <p className="text-xs text-slate-400">
                  Dibuat {new Date(risk.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          {/* ── Footer ─────────────────────────────────── */}
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
            <div>
              {onDelete && (
                <button onClick={onDelete} className="btn-danger">
                  <Trash2 className="w-3.5 h-3.5" /> Hapus Risiko
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="btn-secondary">Tutup</button>
              {onEdit && (
                <button onClick={onEdit} className="btn-primary">
                  <Pencil className="w-3.5 h-3.5" /> Edit Risiko
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="px-6 py-4 border-b border-slate-50 last:border-b-0">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-slate-400">{icon}</span>
        <h4 className="section-label">{title}</h4>
      </div>
      {children}
    </div>
  );
}
