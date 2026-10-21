// Home card for the people who start payments (Accounts; Super Admin for vendor bills): how many approved
// items wait for their payment to be started, and how many people said the money didn't arrive. The
// approvals themselves are in the Inbox ("Needs you" already counts them).

import { useRouter } from 'expo-router';
import { Landmark } from 'lucide-react-native';

import { canStartPayment } from '@/features/accounts/model';
import { mayAct, useAccountsItems } from '@/features/accounts/use-items';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { ListCard, ListRow, ModuleBadge, SkeletonList } from '@/ui';

export function PaymentsHomeCard() {
  const router = useRouter();
  const access = useAccess();
  const desk = useAccountsItems(access);
  if (desk.loading && !desk.items.length) return <SkeletonList rows={1} />;
  const startable = desk.items.filter((i) => canStartPayment(i) && mayAct(desk.gates, i.type) && !i.own);
  const again = startable.filter((i) => i.stage === 'not_received').length;
  const ready = startable.length - again;
  const line = startable.length
    ? [ready ? `${plural(ready, 'payment')} to start` : null, again ? `${again} not received` : null].filter(Boolean).join(' · ')
    : 'No payments to start right now.';
  return (
    <ListCard>
      <ListRow
        size="lg"
        left={<ModuleBadge module="expenses" icon={Landmark} />}
        title="Payments"
        subtitle={line}
        subtitleLines={2}
        value={startable.length ? String(startable.length) : undefined}
        chevron
        onPress={() => router.push('/admin/accounts/payments')}
      />
    </ListCard>
  );
}
