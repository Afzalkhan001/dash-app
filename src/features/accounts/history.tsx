// Past decisions for the Accounts Inbox kinds: what Accounts already approved (and where its payment
// stands) or rejected, newest first — the decided half of Bill Approvals. Rows open the desk's item
// screen, read-only unless a payment can be started there.

import { useRouter } from 'expo-router';
import { History } from 'lucide-react-native';
import { useState } from 'react';

import { useTodayIst } from '@/features/attendance/use-now';
import type { ItemType } from '@/features/accounts/model';
import { ItemRow } from '@/features/accounts/ui';
import { useAccountsItems } from '@/features/accounts/use-items';
import { useAccess } from '@/lib/use-access';
import { palette } from '@/theme/tokens';
import { ActivityList, Button, EmptyState, ErrorState, SkeletonList } from '@/ui';

const PAGE = 30;

function DecidedList({ types }: { types: ItemType[] }) {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const desk = useAccountsItems(access);
  const [shown, setShown] = useState(PAGE);
  const rows = desk.items.filter((i) => types.includes(i.type) && i.stage !== 'awaiting').sort((a, b) => b.movedAt.localeCompare(a.movedAt));

  if (desk.loading && !rows.length) return <SkeletonList rows={4} avatar />;
  if (desk.error && !rows.length) return <ErrorState message={desk.error} onRetry={() => void desk.refresh()} />;
  if (!rows.length) return <EmptyState icon={<History color={palette.textMuted} strokeWidth={1.8} />} title="Nothing decided yet" message="What Accounts approves or rejects shows up here." />;
  return (
    <>
      <ActivityList title="Decided by Accounts">
        {rows.slice(0, shown).map((it) => (
          <ItemRow key={it.key} item={it} today={today} onPress={() => router.push({ pathname: '/admin/accounts/item/[type]/[id]', params: { type: it.type, id: it.id } })} />
        ))}
      </ActivityList>
      {rows.length > shown ? <Button title={`Show ${Math.min(PAGE, rows.length - shown)} more`} variant="ghost" size="md" onPress={() => setShown((n) => n + PAGE)} /> : null}
    </>
  );
}

export const PettyAcctHistory = () => <DecidedList types={['petty', 'pcbill']} />;
export const ClaimAcctHistory = () => <DecidedList types={['claim']} />;
export const BillAcctHistory = () => <DecidedList types={['bill']} />;
