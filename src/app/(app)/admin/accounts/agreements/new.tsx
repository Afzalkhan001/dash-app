// Draft a vendor agreement: /admin/accounts/agreements/new?vendorId= (features/docs/agreement-new;
// owned by the docs domain per features/accounts/HANDOFF.md).

import { useLocalSearchParams } from 'expo-router';

import { NewAgreementScreen } from '@/features/docs/agreement-new';

export default function NewAgreementRoute() {
  const { vendorId } = useLocalSearchParams<{ vendorId?: string }>();
  return <NewAgreementScreen vendorId={vendorId ? String(vendorId) : undefined} />;
}
