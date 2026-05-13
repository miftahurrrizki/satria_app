/**
 * Program Detail (Modul 3) — shell yang menampung 2 tab.
 * UI selaras Modul 2: header card dengan badge + lokasi + stat cards, lalu tab navigator.
 *
 * Restruktur: 4 tab → 2 tab
 *   - Project Management (Tab1)
 *   - Repository (renamed dari Auditor's Copy / Tab3)
 *   - Pengujian + KKA Simpulan dihapus → fungsinya digabung ke halaman edit kegiatan full-page
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Calendar, Users, BarChart3,
  Clock, TrendingUp, CheckCircle2, Circle, List,
} from 'lucide-react';
import { module3Api } from '../../../services/api';
import { fmtDate } from './helpers';

import Tab1ProjectMgmt from './Tab1ProjectMgmt';

type TabKey = 'pm';

const TABS: { key: TabKey; label: string; Icon: React.ElementType }[] = [
  { key: 'pm', label: 'Project Management', Icon: BarChart3 },
];

export default function ProgramDetail({
  programId,
  onBack,
}: {
  programId: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('pm');

  const { data: overview, isLoading } = useQuery({
    queryKey: ['m3-overview', programId],
    queryFn: () => module3Api.getOverview(programId).then((r) => r.data.data),
    staleTime: 10_000,
  });

  // Ambil hierarki untuk progress komprehensif (fase + rincian)
  const { data: hier } = useQuery({
    queryKey: ['m3-hierarki', programId],
    queryFn: () => module3Api.getHierarki(programId).then((r) => r.data.data),
    staleTime: 10_000,
  });

  const progressStats = useMemo(() => {
    if (!hier) return null;
    const allItems = [
      ...hier.perencanaan,
      ...hier.pelaporan,
      ...hier.pelaksanaan.flatMap((t) => t.risiko.flatMap((r) => r.prosedur.flatMap((p) => p.rincian))),
    ];
    const total = allItems.length;
    const selesai = allItems.filter((i) => i.status === 'selesai').length;
    const dalamProses = allItems.filter((i) => i.status === 'dalam_proses').length;
    const belumMulai = total - selesai - dalamProses;
    const persen = total > 0 ? Math.round((selesai / total) * 100) : 0;
    return { total, selesai, dalamProses, belumMulai, persen };
  }, [hier]);

  return (
    <div className="space-y-4">
      {/* Header card — UI selaras Modul 2 */}
      <div className="card p-4 sm:p-6">
        <div className="flex items-start gap-3 mb-3">
          <button
            onClick={onBack}
            className="btn-icon hover:bg-slate-100 text-slate-500 -ml-1"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="h-6 w-2/3 bg-slate-100 animate-pulse rounded" />
            ) : overview ? (
              <>
                <h2 className="font-bold text-slate-800 text-base sm:text-lg leading-snug">
                  {overview.judul_program}
                </h2>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {overview.jenis_program && (
                    <span className="badge bg-blue-100 text-blue-700 border border-blue-200">{overview.jenis_program}</span>
                  )}
                  {overview.kategori_program && (
                    <span className="badge bg-emerald-100 text-emerald-700 border border-emerald-200">{overview.kategori_program}</span>
                  )}
                  {overview.status_program && (
                    <span className="badge bg-purple-100 text-purple-700 border border-purple-200">{overview.status_program}</span>
                  )}
                </div>
                {/* Date range */}
                <div className="flex flex-col gap-1 mt-2">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {fmtDate(overview.tanggal_mulai)} — {fmtDate(overview.tanggal_selesai)}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">Program tidak ditemukan.</p>
            )}
          </div>
        </div>

      </div>

      {/* Stat strip — gaya StatCard Modul 1 Man-Days */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            Icon={List}
            value={progressStats?.total ?? 0}
            label="Total Item"
            sub="kegiatan & langkah"
            tone="slate"
          />
          <StatCard
            Icon={Circle}
            value={progressStats?.belumMulai ?? 0}
            label="Belum Mulai"
            sub="item"
            tone="blue"
          />
          <StatCard
            Icon={Clock}
            value={progressStats?.dalamProses ?? 0}
            label="Dalam Proses"
            sub="item"
            tone="amber"
          />
          <StatCard
            Icon={CheckCircle2}
            value={progressStats?.selesai ?? 0}
            label="Selesai"
            sub="item"
            tone="green"
          />
          <StatCard
            Icon={Users}
            value={overview.total_anggota_tim ?? 0}
            label="Anggota Tim"
            sub="auditor terlibat"
            tone="slate"
          />
          <StatCard
            Icon={TrendingUp}
            value={`${progressStats?.persen ?? 0}%`}
            label="Progress"
            sub={`${progressStats?.selesai ?? 0}/${progressStats?.total ?? 0} item selesai`}
            tone="primary"
          />
        </div>
      )}

      {/* Tab bar — gaya Modul 1 (underline + icon-box) */}
      <div className="bg-white px-5 sm:px-8 pt-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-4 sm:gap-8 border-b border-slate-200 overflow-x-auto no-scrollbar -mx-5 px-5 sm:mx-0 sm:px-0">
          {TABS.map((t) => {
            const isActive = tab === t.key;
            const Icon = t.Icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`group relative flex items-center gap-2.5 pb-3.5 px-1 border-b-2 text-sm font-bold transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <div className={`p-1.5 rounded-lg transition-colors duration-300 ${
                  isActive ? 'bg-primary-100/50' : 'bg-slate-50 group-hover:bg-slate-100'
                }`}>
                  <Icon className={`w-4 h-4 ${
                    isActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`} />
                </div>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab body */}
      <div>
        {tab === 'pm' && <Tab1ProjectMgmt programId={programId} />}
      </div>
    </div>
  );
}

/** StatCard selaras Modul 1 ManDaysTab — icon di kiri, value besar, label berwarna tone, sub abu-abu */
function StatCard({ label, value, sub, Icon, tone }: {
  label: string;
  value: string | number;
  sub?: string;
  Icon: React.ElementType;
  tone: 'slate' | 'amber' | 'green' | 'primary' | 'blue';
}) {
  const toneClass = {
    slate:   { icon: 'bg-slate-100 text-slate-600',    label: 'text-slate-600'   },
    amber:   { icon: 'bg-amber-50 text-amber-700',     label: 'text-amber-700'   },
    green:   { icon: 'bg-green-50 text-green-700',     label: 'text-green-700'   },
    blue:    { icon: 'bg-blue-50 text-blue-700',       label: 'text-blue-700'    },
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
