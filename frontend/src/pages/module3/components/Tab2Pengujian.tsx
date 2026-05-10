/**
 * Tab 2 — Pelaksanaan Pengujian
 *
 * Workspace auditor saat sedang mengerjakan langkah:
 *   - List langkah (filter by status)
 *   - Inline: ubah status (toggle), tulis catatan pengujian
 *   - Quick mark "Selesai" + auto-save
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Loader2, Save, CheckCircle2, ChevronDown, ChevronRight, Filter, FileText, Clock, Paperclip,
} from 'lucide-react';
import { module3Api } from '../../../services/api';
import { TujuanM3, RincianM3, ItemStatus } from '../../../types';
import { fmtDate, StatusBadge, STATUS_OPTIONS } from './helpers';

type FilterKey = 'all' | ItemStatus;

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'Semua',
  tidak_dimulai: 'Belum Mulai',
  dalam_proses: 'Dalam Proses',
  selesai: 'Selesai',
};

type FlatLangkah = {
  rincian: RincianM3;
  prosedur_title: string;
  risiko_title: string;
  tujuan_title: string;
};

export default function Tab2Pengujian({ programId }: { programId: string }) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const { data: hier, isLoading } = useQuery({
    queryKey: ['m3-hierarki', programId],
    queryFn: () => module3Api.getHierarki(programId).then((r) => r.data.data),
  });

  const flat: FlatLangkah[] = useMemo(() => {
    const out: FlatLangkah[] = [];
    for (const t of hier?.pelaksanaan ?? []) {
      for (const r of t.risiko) {
        for (const p of r.prosedur) {
          for (const langkah of p.rincian) {
            out.push({
              rincian: langkah,
              prosedur_title: p.title,
              risiko_title: r.title,
              tujuan_title: t.title,
            });
          }
        }
      }
    }
    return out;
  }, [hier]);

  const filtered = filter === 'all' ? flat : flat.filter((f) => f.rincian.status === filter);

  return (
    <div className="space-y-3">
      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        {(['all', 'tidak_dimulai', 'dalam_proses', 'selesai'] as FilterKey[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              filter === f
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
            ].join(' ')}
          >
            {FILTER_LABELS[f]}
            <span className="ml-1 text-xs opacity-75">
              ({f === 'all' ? flat.length : flat.filter((x) => x.rincian.status === f).length})
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400">Tidak ada langkah untuk filter ini.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => (
            <LangkahCard key={f.rincian.id} item={f} programId={programId} />
          ))}
        </div>
      )}
    </div>
  );
}

function LangkahCard({ item, programId }: { item: FlatLangkah; programId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [catatan, setCatatan] = useState(item.rincian.catatan_pengujian ?? '');
  const [dirty, setDirty] = useState(false);

  const saveCatatan = useMutation({
    mutationFn: () => module3Api.updatePengujian(item.rincian.id, catatan || null),
    onSuccess: () => {
      toast.success('Catatan disimpan');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['m3-hierarki', programId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Gagal menyimpan'),
  });

  const updateStatus = useMutation({
    mutationFn: (status: ItemStatus) => module3Api.updateProgress(item.rincian.id, { status }),
    onSuccess: (_d, status) => {
      toast.success(`Status diubah ke "${STATUS_OPTIONS.find((s) => s.value === status)?.label}"`);
      qc.invalidateQueries({ queryKey: ['m3-hierarki', programId] });
      qc.invalidateQueries({ queryKey: ['m3-overview', programId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Gagal'),
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      {/* Header */}
      <div className="px-3 py-2.5 flex items-start gap-2 border-b border-slate-100">
        <button onClick={() => setOpen((o) => !o)} className="text-slate-400 mt-0.5">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 truncate">
            {item.tujuan_title} › {item.risiko_title} › {item.prosedur_title}
          </p>
          <p className="text-sm font-medium text-slate-800 truncate">{item.rincian.title}</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <StatusBadge status={item.rincian.status} />
            {item.rincian.tanggal_jatuh_tempo && (
              <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />Deadline: {fmtDate(item.rincian.tanggal_jatuh_tempo)}
              </span>
            )}
            {item.rincian.evidence_count > 0 && (
              <span className="text-[11px] text-primary-700 inline-flex items-center gap-1">
                <Paperclip className="w-3 h-3" />{item.rincian.evidence_count} evidence
              </span>
            )}
          </div>
        </div>
        {/* Quick mark Selesai */}
        {item.rincian.status !== 'selesai' && (
          <button
            onClick={() => updateStatus.mutate('selesai')}
            disabled={updateStatus.isPending}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-xs font-medium disabled:opacity-50"
            title="Tandai selesai"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />Selesai
          </button>
        )}
      </div>

      {/* Body — catatan pengujian + status switcher */}
      {open && (
        <div className="p-3 space-y-3">
          <div>
            <p className="section-label mb-1">Status</p>
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => updateStatus.mutate(s.value)}
                  disabled={updateStatus.isPending || item.rincian.status === s.value}
                  className={[
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
                    item.rincian.status === s.value
                      ? s.cls + ' ring-2 ring-offset-1 ring-primary-300'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="section-label">
                <FileText className="inline w-3 h-3 mr-0.5" /> Catatan Pengujian
              </p>
              {item.rincian.pengujian_updated_at && (
                <p className="text-xs text-slate-400">Terakhir diupdate: {fmtDate(item.rincian.pengujian_updated_at)}</p>
              )}
            </div>
            <textarea
              value={catatan}
              onChange={(e) => { setCatatan(e.target.value); setDirty(true); }}
              rows={4}
              placeholder="Tuliskan catatan saat melakukan pengujian — observasi, sample, hasil sementara, dll."
              className="input resize-y"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => saveCatatan.mutate()}
                disabled={!dirty || saveCatatan.isPending}
                className="btn-sm"
              >
                {saveCatatan.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Simpan Catatan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
