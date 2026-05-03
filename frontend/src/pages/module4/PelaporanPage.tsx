import { FileText, Lock, Wrench } from 'lucide-react';

const FEATURES = [
  'Penyusunan Laporan Hasil Audit (LHA) digital',
  'Template laporan sesuai standar SPI',
  'Distribusi laporan elektronik ke auditee',
  'Mekanisme tanggapan resmi auditee online',
  'Penomoran & pengarsipan laporan otomatis',
];

export default function PelaporanPage() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="max-w-md w-full">
        {/* Icon */}
        <div className="relative mx-auto mb-6 w-20 h-20">
          <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
            <FileText className="w-9 h-9 text-slate-300" strokeWidth={1.5} />
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center ring-2 ring-white">
            <Lock className="w-3.5 h-3.5 text-amber-500" />
          </div>
        </div>

        {/* Badge */}
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold mb-4">
          <Wrench className="w-3 h-3" />
          Modul 4 — Dalam Pengembangan
        </span>

        <h1 className="text-xl font-bold text-slate-800 mb-2">
          Pelaporan & Komunikasi Hasil
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-8">
          Modul ini akan menyusun laporan hasil audit hingga menyampaikannya secara digital kepada
          Auditee untuk mendapatkan tanggapan resmi. Seluruh proses pelaporan terintegrasi dalam
          satu alur kerja yang terstandarisasi.
        </p>

        {/* Feature list */}
        <div className="bg-slate-50 rounded-xl border border-slate-100 p-5 text-left space-y-2.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            Fitur yang akan hadir
          </p>
          {FEATURES.map((f) => (
            <div key={f} className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
              <span className="text-xs text-slate-500">{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
