/**
 * Tab 4 — KKA & Simpulan
 *
 * Per prosedur:
 *   - Lihat ringkasan langkah-langkah & evidence-nya
 *   - Tulis simpulan (textarea besar)
 *   - Toggle "Ada Temuan" → kalau on, isi temuan_catatan (akan ke Modul 4 Pelaporan)
 *   - Tombol "Tandai Final"
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ChevronDown, ChevronRight, Save, Loader2, AlertTriangle, CheckCircle2, FileText,
} from 'lucide-react';
import { module3Api } from '../../../services/api';
import { TujuanM3, ProsedurM3 } from '../../../types';
import { fmtDate, StatusBadge } from './helpers';

export default function Tab4KkaSimpulan({ programId }: { programId: string }) {
  const { data: hierData, isLoading } = useQuery({
    queryKey: ['m3-hierarki', programId],
    queryFn: () => module3Api.getHierarki(programId).then((r) => r.data.data),
  });
  const hier = hierData?.pelaksanaan;

  if (isLoading) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Memuat…
      </div>
    );
  }

  if (!hier || hier.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-slate-400">
        Hierarki kosong. Buat tujuan/risiko/prosedur di Modul 2.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hier.map((t) => (
        <div key={t.id}>
          <p className="section-label text-primary-600 mb-1.5 px-1">{t.title}</p>
          <div className="space-y-2">
            {t.risiko.flatMap((r) =>
              r.prosedur.map((p) => (
                <ProsedurCard
                  key={p.id}
                  prosedur={p}
                  risikoTitle={r.title}
                  programId={programId}
                />
              )),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProsedurCard({ prosedur, risikoTitle, programId }: {
  prosedur: ProsedurM3;
  risikoTitle: string;
  programId: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [simpulan, setSimpulan] = useState(prosedur.simpulan ?? '');
  const [hasTemuan, setHasTemuan] = useState(prosedur.has_temuan);
  const [temuanCatatan, setTemuanCatatan] = useState(prosedur.temuan_catatan ?? '');
  const [dirty, setDirty] = useState(false);

  const save = useMutation({
    mutationFn: (finalize: boolean) => module3Api.upsertSimpulan(prosedur.id, {
      simpulan: simpulan || null,
      has_temuan: hasTemuan,
      temuan_catatan: hasTemuan ? (temuanCatatan || null) : null,
      finalized: finalize,
    }),
    onSuccess: (_d, finalize) => {
      toast.success(finalize ? 'Simpulan difinalkan' : 'Simpulan disimpan');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['m3-hierarki', programId] });
      qc.invalidateQueries({ queryKey: ['m3-overview', programId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Gagal menyimpan'),
  });

  const totalLangkah    = prosedur.rincian.length;
  const langkahSelesai  = prosedur.rincian.filter((r) => r.status === 'selesai').length;
  const totalEvidence   = prosedur.rincian.reduce((s, r) => s + r.evidence_count, 0);
  const isFinalized     = !!prosedur.finalized_at;

  return (
    <div className={[
      'bg-white border rounded-2xl',
      prosedur.has_temuan ? 'border-red-200' : isFinalized ? 'border-green-200' : 'border-slate-200',
    ].join(' ')}>
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-start gap-3 text-left"
      >
        <div className="text-slate-400 mt-0.5">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400">Risiko: {risikoTitle}</p>
          <p className="text-sm font-semibold text-slate-800 truncate">{prosedur.title}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
            <span>{langkahSelesai}/{totalLangkah} langkah selesai</span>
            <span>• {totalEvidence} evidence</span>
            {prosedur.has_temuan && (
              <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                <AlertTriangle className="w-3 h-3" />Ada Temuan
              </span>
            )}
            {isFinalized && (
              <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                <CheckCircle2 className="w-3 h-3" />Finalized {fmtDate(prosedur.finalized_at)}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-3">
          {/* Ringkasan langkah */}
          <div>
            <p className="section-label mb-1.5">Ringkasan Langkah</p>
            {prosedur.rincian.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Tidak ada langkah.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {prosedur.rincian.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
                    <span className="text-slate-400">•</span>
                    <span className="flex-1 text-slate-700 truncate">{r.title}</span>
                    {r.evidence_count > 0 && (
                      <span className="badge bg-primary-50 text-primary-700">📎{r.evidence_count}</span>
                    )}
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Simpulan */}
          <div>
            <p className="section-label mb-1.5">
              <FileText className="inline w-3 h-3 mr-0.5" /> Simpulan Auditor
            </p>
            <textarea
              value={simpulan}
              onChange={(e) => { setSimpulan(e.target.value); setDirty(true); }}
              rows={5}
              placeholder="Tuliskan kesimpulan auditor berlandaskan pelaksanaan langkah-langkah & evidence di atas."
              className="input resize-y"
            />
          </div>

          {/* Temuan toggle */}
          <div className="bg-slate-50 rounded-xl p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasTemuan}
                onChange={(e) => { setHasTemuan(e.target.checked); setDirty(true); }}
                className="rounded text-red-600"
              />
              <span className="text-sm font-medium text-slate-700 inline-flex items-center gap-1.5">
                <AlertTriangle className={`w-4 h-4 ${hasTemuan ? 'text-red-500' : 'text-slate-400'}`} />
                Ada Temuan
              </span>
              <span className="text-xs text-slate-400">(akan diteruskan ke Modul 4 Pelaporan)</span>
            </label>
            {hasTemuan && (
              <textarea
                value={temuanCatatan}
                onChange={(e) => { setTemuanCatatan(e.target.value); setDirty(true); }}
                rows={3}
                placeholder="Deskripsi temuan — harus diisi jika 'Ada Temuan' dicentang."
                className="input mt-2 border-red-200 focus:ring-red-300 resize-y"
              />
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => save.mutate(false)}
              disabled={!dirty || save.isPending}
              className="btn-secondary"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan
            </button>
            <button
              onClick={() => save.mutate(true)}
              disabled={save.isPending || (hasTemuan && !temuanCatatan.trim())}
              className="btn-primary"
              title={isFinalized ? 'Re-finalize akan update timestamp' : 'Tandai simpulan final'}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isFinalized ? 'Update & Re-finalize' : 'Simpan & Tandai Final'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
