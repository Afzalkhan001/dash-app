// The signed copy of a vendor agreement: /admin/docs/agreement/<id> (features/docs/signed-copy).

import { useLocalSearchParams } from 'expo-router';

import { SignedCopyScreen } from '@/features/docs/signed-copy';

export default function SignedCopyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SignedCopyScreen id={String(id ?? '')} />;
}
