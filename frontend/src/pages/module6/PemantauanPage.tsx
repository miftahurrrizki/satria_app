import { CheckSquare } from 'lucide-react';
import ExternalEmbed from '../../components/shared/ExternalEmbed';

const MONITORING_URL = 'https://monitoringtl.vercel.app/';

export default function PemantauanPage() {
  return (
    <ExternalEmbed
      title="Pemantauan Tindak Lanjut Temuan"
      url={MONITORING_URL}
      icon={<CheckSquare className="w-4 h-4" />}
    />
  );
}
