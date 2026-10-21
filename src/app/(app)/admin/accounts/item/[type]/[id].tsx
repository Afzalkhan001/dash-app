// One item on the Accounts desk: /admin/accounts/item/<petty|pcbill|claim|bill>/<id>. The same screen the
// Inbox opens for its Accounts kinds (features/accounts/item-detail).

import { Redirect, useLocalSearchParams } from 'expo-router';

import { canSeeAccountsDesk } from '@/features/accounts/access';
import { AccountsItemScreen } from '@/features/accounts/item-detail';
import { isItemType } from '@/features/accounts/model';
import { MissingItem } from '@/features/inbox/detail';
import { useAccess } from '@/lib/use-access';

export default function AccountsItemRoute() {
  const access = useAccess();
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  if (!canSeeAccountsDesk(access)) return <Redirect href="/" />;
  if (!isItemType(type) || !id) return <MissingItem title="Item" />;
  return <AccountsItemScreen type={type} id={String(id)} />;
}
