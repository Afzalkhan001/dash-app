// One document: /admin/docs/<kind>?… (features/docs/kinds).

import { useLocalSearchParams } from 'expo-router';

import { DocKindScreen } from '@/features/docs/kinds';

export default function DocKindRoute() {
  const { kind, ...rest } = useLocalSearchParams<{ kind: string; id?: string; person?: string; batchId?: string; request?: string }>();
  const params: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(rest)) params[k] = Array.isArray(v) ? v[0] : v;
  return <DocKindScreen kind={String(kind ?? '')} params={params} />;
}
