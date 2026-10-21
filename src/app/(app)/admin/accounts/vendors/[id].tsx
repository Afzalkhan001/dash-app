// One vendor for Accounts: /admin/accounts/vendors/<id> (features/accounts/vendor-detail).

import { useLocalSearchParams } from 'expo-router';

import { VendorDetailScreen } from '@/features/accounts/vendor-detail';

export default function VendorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VendorDetailScreen id={String(id ?? '')} />;
}
