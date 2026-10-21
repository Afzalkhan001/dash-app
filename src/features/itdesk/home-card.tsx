// Home card for the IT Admin, whose website landing page is Assets (DEFAULT_VIEW.it_admin, dash.html:30257):
// what is waiting on the equipment side — acknowledgements not yet given, warranties ending within 60
// days — and a way in. Reads the same GET /assets as the Assets screen (never on disk).

import { useRouter } from 'expo-router';
import { Package } from 'lucide-react-native';

import { useAssets } from '@/api/itdesk';
import { useTodayIst } from '@/features/attendance/use-now';
import { assetKpis } from '@/features/itdesk/format';
import { plural } from '@/lib/format';
import { ListCard, ListRow, ModuleBadge, SkeletonList } from '@/ui';

export function EquipmentCard() {
  const router = useRouter();
  const today = useTodayIst();
  const assets = useAssets(true);
  if (!assets.data && !assets.isError) return <SkeletonList rows={1} />;
  const k = assets.data ? assetKpis(assets.data, today) : null;
  const bits = k ? [k.ackWaiting ? `${plural(k.ackWaiting, 'acknowledgement')} waiting` : '', k.soon ? `${plural(k.soon, 'warranty', 'warranties')} end in 60 days` : ''].filter(Boolean) : [];
  return (
    <ListCard>
      <ListRow
        size="lg"
        left={<ModuleBadge module="support" icon={Package} />}
        title="Equipment"
        subtitle={!k ? 'Couldn’t load the assets. Open to try again.' : bits.length ? bits.join(' · ') : `${plural(k.assigned, 'asset')} with people, ${k.available} in stock`}
        subtitleLines={2}
        value={k && k.ackWaiting ? String(k.ackWaiting) : undefined}
        chevron
        onPress={() => router.push(k && k.ackWaiting ? '/admin/it-desk/assets?view=ackWaiting' : '/admin/it-desk/assets')}
      />
    </ListCard>
  );
}
