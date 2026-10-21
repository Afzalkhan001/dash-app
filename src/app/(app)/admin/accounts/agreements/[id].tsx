// One vendor agreement: /admin/accounts/agreements/<id> (features/accounts/agreement-detail).

import { useLocalSearchParams } from 'expo-router';

import { AgreementDetailScreen } from '@/features/accounts/agreement-detail';

export default function AgreementRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AgreementDetailScreen id={String(id ?? '')} />;
}
