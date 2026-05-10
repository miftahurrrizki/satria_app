/**
 * NAS Connection Indicator — Modul 3
 *
 * Strategy (per kesepakatan):
 *   1. Passive polling tiap 60 detik → badge kecil di header
 *   2. Active recheck dipicu via prop refetchKey (dipanggil sebelum upload)
 *   3. Tab "Auditor's Copy" pre-check 1x saat dibuka
 */
import { useQuery } from '@tanstack/react-query';
import { module3Api } from '../../../services/api';
import { Server, ServerOff, Loader2, RefreshCw } from 'lucide-react';

export default function NasIndicator() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['nas-health'],
    queryFn: () => module3Api.nasHealth().then((r) => r.data.data),
    refetchInterval: 60_000,        // poll tiap 60s
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const connected = data?.connected ?? false;
  const isProd    = data?.isProduction ?? false;

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 border border-slate-200 text-slate-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        Memeriksa NAS…
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => refetch()}
      title={data?.message ?? `NAS path: ${data?.basePath ?? '-'}`}
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
        connected
          ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
          : 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100',
      ].join(' ')}
    >
      {connected ? <Server className="w-3 h-3" /> : <ServerOff className="w-3 h-3" />}
      <span>NAS: {connected ? 'Terhubung' : 'Terputus'}</span>
      {!isProd && connected && (
        <span className="text-[10px] px-1 py-0.5 bg-amber-100 text-amber-700 rounded">DEV</span>
      )}
      <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : 'opacity-40'}`} />
    </button>
  );
}

/** Modal blocking saat NAS terputus & user mau upload. */
export function NasOfflineModal({ open, onClose, onRetry, message }: {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
  message?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <ServerOff className="w-6 h-6 text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-slate-800">NAS Tidak Terhubung</h3>
            <p className="text-sm text-slate-500 mt-1">
              {message ?? 'Jaringan belum terhubung ke NAS SATRIA. Pastikan Anda terhubung ke jaringan kantor & drive Z: termount, lalu coba lagi.'}
            </p>
          </div>
        </div>
        <div className="mt-6 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Batal
          </button>
          <button
            onClick={onRetry}
            className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Coba Lagi
          </button>
        </div>
      </div>
    </div>
  );
}
