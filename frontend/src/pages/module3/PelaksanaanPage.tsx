/**
 * Modul 3 — Pelaksanaan Audit & Kertas Kerja
 *
 * Flow:
 *   Level 1: Daftar program kerja yang siap dilaksanakan (dari Modul 2)
 *   Level 2: Detail program → 4 tab:
 *     - Project Management (list + Gantt)
 *     - Pelaksanaan Pengujian (workspace harian)
 *     - Auditor's Copy (NAS browser + upload evidence)
 *     - KKA & Simpulan (tulis simpulan per prosedur)
 */
import { useSearchParams } from 'react-router-dom';
import ProgramList from './components/ProgramList';
import ProgramDetail from './components/ProgramDetail';

export default function PelaksanaanPage() {
  // Simpan selected program di URL (?program=xxx) agar tetap setelah refresh
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProgram = searchParams.get('program');

  const handleSelect = (id: string) => {
    setSearchParams({ program: id }, { replace: false });
  };
  const handleBack = () => {
    setSearchParams({}, { replace: false });
  };

  return selectedProgram
    ? <ProgramDetail programId={selectedProgram} onBack={handleBack} />
    : <ProgramList onSelect={handleSelect} />;
}
