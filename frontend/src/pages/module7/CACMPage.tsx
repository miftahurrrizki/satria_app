import { LayoutDashboard } from 'lucide-react';
import ExternalEmbed from '../../components/shared/ExternalEmbed';

const CACM_URL =
  'https://app.powerbi.com/links/vASg8kKBnc?ctid=7b9e7be0-e1aa-4614-834b-5a4fdcfafa12&pbi_source=linkShare&bookmarkGuid=2c2f624d-5ef3-4015-b4a2-fc8ba934c758';

export default function CACMPage() {
  return (
    <ExternalEmbed
      title="Dashboard CA-CM"
      url={CACM_URL}
      icon={<LayoutDashboard className="w-4 h-4" />}
    />
  );
}
