import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Lock, Unlock, Save, Users, TrendingUp, AlertTriangle, CheckCircle2,
  CalendarDays, CalendarOff, CalendarCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { kalenderKerjaApi, KalenderBulan } from '../../../services/api';
import { useAuthStore } from '../../../store/auth.store';
import { useConfirm } from '../../../components/shared/ConfirmDialog';

const BULAN_LABEL = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
const BULAN_FULL  = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// ── Stat card — sama persis dengan WorkloadTab ────────────────
function StatCard({ label, value, sub, icon: Icon, tone }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  tone: 'slate' | 'amber' | 'green' | 'primary' | 'blue';
}) {
  const toneClass = {
    slate:   { icon: 'bg-slate-100 text-slate-600',   label: 'text-slate-600'   },
    amber:   { icon: 'bg-amber-50 text-amber-700',    label: 'text-amber-700'   },
    green:   { icon: 'bg-green-50 text-green-700',    label: 'text-green-700'   },
    blue:    { icon: 'bg-blue-50 text-blue-700',      label: 'text-blue-700'    },
    primary: { icon: 'bg-primary-50 text-primary-700', label: 'text-primary-700' },
  }[tone];

  return (
    <div className="stat-card">
      <div className={`p-2 rounded-lg flex-shrink-0 ${toneClass.icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none text-slate-900">
          {typeof value === 'number' ? value.toLocaleString('id-ID') : value}
        </p>
        <p className={`text-xs font-bold mt-1 ${toneClass.label}`}>{label}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function ManDaysTab({ tahun }: { tahun: number }) {
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'kepala_spi' || role === 'admin_spi';
  const qc = useQueryClient();
  const confirm = useConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ['kalender-kerja', tahun],
    queryFn: () => kalenderKerjaApi.get(tahun).then((r) => r.data.data),
  });

  const header       = data?.header ?? null;
  const auditorCount = data?.auditor_count_now ?? 0;
  const isLocked     = !!header?.locked_at;

  const [rows, setRows]           = useState<KalenderBulan[]>([]);
  const [keterangan, setKeterangan] = useState<string>('');
  const [dirty, setDirty]         = useState(false);

  useEffect(() => {
    if (data?.bulan) {
      setRows(data.bulan);
      setKeterangan(data.header?.keterangan ?? '');
      setDirty(false);
    }
  }, [data]);

  const totalHari    = useMemo(() => rows.reduce((s, r) => s + (r.jumlah_hari  || 0), 0), [rows]);
  const totalLibur   = useMemo(() => rows.reduce((s, r) => s + (r.jumlah_libur || 0), 0), [rows]);
  const totalEfektif = useMemo(
    () => rows.reduce((s, r) => s + Math.max((r.jumlah_hari || 0) - (r.jumlah_libur || 0), 0), 0),
    [rows],
  );
  const pagu = totalEfektif * auditorCount;

  const updateRow = (idx: number, patch: Partial<KalenderBulan>) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      next[idx].hari_efektif = Math.max((next[idx].jumlah_hari || 0) - (next[idx].jumlah_libur || 0), 0);
      return next;
    });
    setDirty(true);
  };

  const upsertMut = useMutation({
    mutationFn: () =>
      kalenderKerjaApi.upsert({
        tahun,
        keterangan: keterangan || null,
        bulan: rows.map((r) => ({
          bulan: r.bulan,
          jumlah_hari:  r.jumlah_hari  || 0,
          jumlah_libur: r.jumlah_libur || 0,
          catatan:      r.catatan ?? null,
        })),
      }),
    onSuccess: () => {
      toast.success('Kalender tersimpan. Pagu Man-Days terupdate.');
      qc.invalidateQueries({ queryKey: ['kalender-kerja'] });
      setDirty(false);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? 'Gagal menyimpan kalender'),
  });

  const lockMut = useMutation({
    mutationFn: () => kalenderKerjaApi.lock(header!.id),
    onSuccess: () => { toast.success('Kalender dikunci'); qc.invalidateQueries({ queryKey: ['kalender-kerja'] }); },
  });
  const unlockMut = useMutation({
    mutationFn: () => kalenderKerjaApi.unlock(header!.id),
    onSuccess: () => { toast.success('Kunci dibuka'); qc.invalidateQueries({ queryKey: ['kalender-kerja'] }); },
  });

  const inputDisabled = isLocked || !canEdit;

  return (
    <div className="space-y-5">

      {/* ── Summary cards — sama dengan WorkloadTab ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <StatCard icon={CalendarDays}  label="Total Hari"        value={totalHari}    sub="hari"      tone="slate"   />
        <StatCard icon={CalendarOff}   label="Total Libur"       value={totalLibur}   sub="hari"      tone="amber"   />
        <StatCard icon={CalendarCheck} label="Hari Efektif"      value={totalEfektif} sub="hari"      tone="green"   />
        <StatCard icon={Users}         label="Total Auditor"     value={auditorCount} sub="orang"     tone="blue"    />
        <StatCard icon={TrendingUp}    label="Pagu Pemeriksaan"  value={pagu}         sub="man-days"  tone="primary" />
      </div>

      {/* ── Lock notice ── */}
      {isLocked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-800">
          <Lock className="w-4 h-4 flex-shrink-0" />
          <span>
            Kalender ini <b>dikunci</b>
            {header?.locked_at && ` pada ${new Date(header.locked_at).toLocaleString('id-ID')}`}
            {header?.locked_by_nama && ` oleh ${header.locked_by_nama}`}.
            {' '}Pagu Man-Days tidak bisa diubah hingga kunci dibuka.
          </span>
        </div>
      )}

      {/* ── Tabel 12 bulan ── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base min-w-[480px]">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3 text-left">Bulan</th>
                <th className="px-4 py-3 text-right">Jumlah Hari</th>
                <th className="px-4 py-3 text-right">Hari Libur</th>
                <th className="px-4 py-3 text-right">Hari Efektif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Memuat...</td></tr>
              )}
              {!isLoading && rows.map((r, idx) => (
                <tr key={r.bulan} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-sm">
                    <span className="inline-block w-8 text-slate-400 font-mono text-xs">{BULAN_LABEL[r.bulan - 1]}</span>
                    <span className="ml-2 text-slate-800">{BULAN_FULL[r.bulan - 1]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number" min={0} max={31}
                      disabled={inputDisabled}
                      value={r.jumlah_hari}
                      onChange={(e) => updateRow(idx, { jumlah_hari: Number(e.target.value) })}
                      className="input w-20 text-right"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number" min={0} max={31}
                      disabled={inputDisabled}
                      value={r.jumlah_libur}
                      onChange={(e) => updateRow(idx, { jumlah_libur: Number(e.target.value) })}
                      className="input w-20 text-right"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`badge font-semibold ${r.hari_efektif > 0 ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-400'}`}>
                      {r.hari_efektif}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200 text-sm font-bold">
              <tr>
                <td className="px-4 py-3 text-slate-700">TOTAL</td>
                <td className="px-4 py-3 text-right text-slate-700">{totalHari}</td>
                <td className="px-4 py-3 text-right text-slate-700">{totalLibur}</td>
                <td className="px-4 py-3 text-right text-green-700">{totalEfektif}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Actions ── */}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            {dirty
              ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> <span>Ada perubahan belum tersimpan</span></>
              : data?.header
                ? <><CheckCircle2 className="w-4 h-4 text-green-500" /> <span>Tersimpan</span></>
                : <span>Belum ada kalender untuk tahun ini.</span>}
          </div>
          <div className="flex items-center gap-2">
            {!isLocked && (
              <button
                onClick={() => upsertMut.mutate()}
                disabled={upsertMut.isPending || !dirty}
                className="btn-primary"
              >
                <Save className="w-4 h-4" />
                {upsertMut.isPending ? 'Menyimpan...' : 'Simpan Kalender'}
              </button>
            )}
            {header && !isLocked && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    variant: 'warning',
                    title: `Kunci Kalender Tahun ${tahun}?`,
                    description: (
                      <>
                        Setelah dikunci, <b>jumlah hari pemeriksaan & kapasitas tahunan</b> tidak
                        dapat diubah lagi. Pagu tahunan akan menjadi acuan tetap untuk seluruh
                        Modul 2 (Perencanaan Pengawasan Individual).
                        <br /><br />
                        Pastikan seluruh data sudah final dan disetujui.
                      </>
                    ),
                    confirmLabel: 'Ya, Kunci Pagu',
                  });
                  if (ok) lockMut.mutate();
                }}
                disabled={lockMut.isPending || dirty}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors"
              >
                <Lock className="w-4 h-4" /> Kunci Pagu
              </button>
            )}
            {header && isLocked && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    variant: 'warning',
                    title: 'Buka Kunci Kalender?',
                    description: (
                      <>
                        Kalender pagu akan dapat diedit kembali. Lakukan ini hanya jika ada
                        <b> perubahan resmi</b> yang perlu disesuaikan (mis. perubahan jumlah
                        hari libur nasional atau kapasitas tim).
                        <br /><br />
                        Perubahan pagu setelah Modul 2 berjalan dapat memengaruhi alokasi
                        Man-Days yang sudah ditetapkan.
                      </>
                    ),
                    confirmLabel: 'Ya, Buka Kunci',
                  });
                  if (ok) unlockMut.mutate();
                }}
                disabled={unlockMut.isPending}
                className="btn-secondary"
              >
                <Unlock className="w-4 h-4" /> Buka Kunci
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
