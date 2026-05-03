import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Star, Lock, CheckCircle2, Loader2, X, Info, Award, TrendingUp,
  ChevronRight, ChevronDown, User as UserIcon, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { evaluationsApi } from '../../../services/api';
import { useAuthStore } from '../../../store/auth.store';
import {
  PendingEvaluatee, PendingEvaluationPlan, EvaluationSummaryRow,
  EvaluationDetailRow, ROLE_LABELS,
} from '../../../types';

// ── Star rating ──────────────────────────────────────────────
function StarRating({
  value, onChange, readOnly = false, size = 20,
}: { value: number; onChange?: (v: number) => void; readOnly?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform'}
        >
          <Star
            className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
            style={{ width: size, height: size }}
          />
        </button>
      ))}
    </div>
  );
}

// ── Evaluation Form Modal ────────────────────────────────────
function EvaluationModal({
  plan, evaluatee, onClose,
}: {
  plan: PendingEvaluationPlan;
  evaluatee: PendingEvaluatee;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [kompetensi, setKompetensi] = useState(0);
  const [komunikasi, setKomunikasi] = useState(0);
  const [hasilKerja, setHasilKerja] = useState(0);
  const [catatan, setCatatan] = useState('');

  const submit = useMutation({
    mutationFn: () => evaluationsApi.submit({
      annual_plan_id: plan.plan_id,
      evaluatee_id: evaluatee.user_id,
      role_tim_evaluatee: evaluatee.role_tim,
      kompetensi_teknis: kompetensi,
      komunikasi, hasil_kerja: hasilKerja,
      catatan: catatan || undefined,
    }),
    onSuccess: () => {
      toast.success('Penilaian tersimpan');
      qc.invalidateQueries({ queryKey: ['evaluations'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Gagal menyimpan penilaian');
    },
  });

  const isValid = kompetensi > 0 && komunikasi > 0 && hasilKerja > 0;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full pointer-events-auto overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Penilaian Auditor</h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-1">{plan.judul_program}</p>
              <p className="text-sm text-slate-700 mt-2">
                <b>{evaluatee.nama_lengkap}</b>
                <span className="text-slate-400"> · {evaluatee.role_tim}</span>
              </p>
            </div>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-700">Kompetensi Teknis</label>
              <p className="text-xs text-slate-400 mb-2">Penguasaan metodologi audit & tools.</p>
              <StarRating value={kompetensi} onChange={setKompetensi} size={28} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Komunikasi</label>
              <p className="text-xs text-slate-400 mb-2">Interaksi dengan tim & auditee.</p>
              <StarRating value={komunikasi} onChange={setKomunikasi} size={28} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Hasil Kerja</label>
              <p className="text-xs text-slate-400 mb-2">Kualitas temuan & dokumentasi.</p>
              <StarRating value={hasilKerja} onChange={setHasilKerja} size={28} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Catatan (opsional)</label>
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                rows={3}
                placeholder="Area pengembangan, apresiasi, dll."
                className="mt-1.5 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Batal</button>
            <button
              onClick={() => submit.mutate()}
              disabled={!isValid || submit.isPending}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
            >
              {submit.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan Penilaian
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Pending card ─────────────────────────────────────────────
function PendingCard({ plan }: { plan: PendingEvaluationPlan }) {
  const [active, setActive] = useState<PendingEvaluatee | null>(null);
  const done = plan.evaluatees.filter((e) => e.already_evaluated).length;
  const total = plan.evaluatees.length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 truncate">{plan.judul_program}</p>
            <p className="text-xs text-slate-500 mt-1">
              Selesai {new Date(plan.completed_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
            done === total ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {done}/{total}
          </span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {plan.evaluatees.map((e) => (
          <div key={e.user_id} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <UserIcon className="h-4 w-4 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{e.nama_lengkap}</p>
                <p className="text-xs text-slate-500">{e.role_tim}</p>
              </div>
            </div>
            {e.already_evaluated ? (
              <span className="px-3 py-1 rounded-lg text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Sudah
              </span>
            ) : e.blocked ? (
              <span className="px-3 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-500 flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" /> Menunggu PT
              </span>
            ) : (
              <button
                onClick={() => setActive(e)}
                className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Nilai
              </button>
            )}
          </div>
        ))}
      </div>
      {active && <EvaluationModal plan={plan} evaluatee={active} onClose={() => setActive(null)} />}
    </div>
  );
}

// ── Detail Drawer (annual summary per auditor) ───────────────
function DetailDrawer({
  userId, tahun, onClose,
}: { userId: string; tahun: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['evaluations', 'detail', userId, tahun],
    queryFn: () => evaluationsApi.getAuditorDetail(userId, tahun).then((r) => r.data.data ?? []),
  });

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/50" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:max-w-xl bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Riwayat Penilaian · Tahun {tahun}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}
          {!isLoading && (data ?? []).length === 0 && (
            <p className="text-center text-sm text-slate-400 py-10">Belum ada penilaian.</p>
          )}
          {(data ?? []).map((d: EvaluationDetailRow, i: number) => {
            const overall = (d.kompetensi_teknis + d.komunikasi + d.hasil_kerja) / 3;
            return (
              <div key={i} className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate">{d.judul_program}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Stage: <b>{d.stage === 'pengendali_teknis' ? 'Pengendali Teknis' : 'Kepala SPI'}</b>
                      {' · '}oleh {d.evaluator_nama}
                    </p>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{d.role_tim_evaluatee}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500 mb-1">Kompetensi</p>
                    <StarRating value={d.kompetensi_teknis} readOnly size={14} />
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Komunikasi</p>
                    <StarRating value={d.komunikasi} readOnly size={14} />
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Hasil Kerja</p>
                    <StarRating value={d.hasil_kerja} readOnly size={14} />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  Rata-rata: <b>{overall.toFixed(2)}</b> / 5.00
                </p>
                {d.catatan && (
                  <p className="text-xs italic text-slate-500 mt-2 bg-slate-50 px-3 py-2 rounded">
                    "{d.catatan}"
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Summary row ──────────────────────────────────────────────
function SummaryRow({
  row, onOpen,
}: { row: EvaluationSummaryRow; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const overall = Number(row.avg_overall);
  const color =
    overall >= 4.5 ? 'text-green-700 bg-green-50' :
    overall >= 4.0 ? 'text-lime-700 bg-lime-50' :
    overall >= 3.0 ? 'text-amber-700 bg-amber-50' :
                     'text-red-700 bg-red-50';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3"
      >
        <div className="text-slate-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 truncate">{row.nama_lengkap}</p>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
              {row.role === 'anggota_tim' && row.jabatan ? row.jabatan : ROLE_LABELS[row.role]}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            NIK {row.nik} · {row.total_program} program dinilai
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded-lg font-bold ${color}`}>
          {overall.toFixed(2)}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Kompetensi Teknis', v: row.avg_kompetensi },
              { label: 'Komunikasi',        v: row.avg_komunikasi },
              { label: 'Hasil Kerja',       v: row.avg_hasil_kerja },
            ].map((a) => (
              <div key={a.label} className="bg-slate-50 rounded-lg p-3">
                <p className="text-[10px] font-medium text-slate-500 uppercase">{a.label}</p>
                <div className="flex items-center gap-2 mt-1">
                  <StarRating value={Math.round(Number(a.v))} readOnly size={14} />
                  <span className="text-sm font-bold text-slate-700">{Number(a.v).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
            <TrendingUp className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">Area yang perlu ditingkatkan:</p>
              <p className="text-amber-700 mt-0.5">{row.improvement_areas.join(', ')}</p>
            </div>
          </div>
          <button
            onClick={onOpen}
            className="w-full text-sm text-primary-600 hover:bg-primary-50 border border-primary-200 rounded-lg py-2 font-medium"
          >
            Lihat Riwayat Penilaian
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Tab ─────────────────────────────────────────────────
export default function EvaluationTab({ tahun }: { tahun: number }) {
  const { user } = useAuthStore();
  const canEvaluate = ['pengendali_teknis', 'kepala_spi', 'admin_spi'].includes(user?.role ?? '');
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  const pendingQ = useQuery({
    queryKey: ['evaluations', 'pending'],
    queryFn: () => evaluationsApi.getPending().then((r) => r.data.data ?? []),
    enabled: canEvaluate,
  });

  const summaryQ = useQuery({
    queryKey: ['evaluations', 'summary', tahun],
    queryFn: () => evaluationsApi.getSummary(tahun).then((r) => r.data.data ?? []),
  });

  const pending = pendingQ.data ?? [];
  const summary = summaryQ.data ?? [];
  const pendingCount = useMemo(
    () => pending.reduce((s, p) => s + p.evaluatees.filter((e) => !e.already_evaluated && !e.blocked).length, 0),
    [pending],
  );

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 flex gap-2 text-sm text-primary-800">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          Penilaian berjenjang: <b>Pengendali Teknis</b> menilai dulu, lalu <b>Kepala SPI</b>. Aspek: kompetensi teknis, komunikasi, hasil kerja (1–5 bintang).
          Muncul otomatis saat program berstatus Selesai (dari pelaporan Modul 3).
        </div>
      </div>

      {/* Pending section */}
      {canEvaluate && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Award className="h-4 w-4 text-primary-600" />
              Penilaian Pending
            </h3>
            {pendingCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {pendingCount} perlu dinilai
              </span>
            )}
          </div>
          {pendingQ.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>
          ) : pending.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl">
              Tidak ada program yang perlu dinilai.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pending.map((p) => <PendingCard key={p.plan_id} plan={p} />)}
            </div>
          )}
        </section>
      )}

      {/* Annual summary */}
      <section>
        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary-600" />
          Performa Tahunan {tahun}
        </h3>
        {summaryQ.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>
        ) : summary.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl">
            Belum ada data penilaian tahun ini.
          </div>
        ) : (
          <div className="space-y-2">
            {summary.map((s) => (
              <SummaryRow key={s.user_id} row={s} onOpen={() => setOpenDetail(s.user_id)} />
            ))}
          </div>
        )}
      </section>

      {openDetail && <DetailDrawer userId={openDetail} tahun={tahun} onClose={() => setOpenDetail(null)} />}
    </div>
  );
}
