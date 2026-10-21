// Agreements I countersigned, kept on this phone. A colleague named only as the countersigner (neither
// the drafter nor an Accounts / Super Admin overseer) is in neither list the server offers once it is
// signed: /vendor-agreements/mine is scoped to the drafter or overseer, and /pending-my-signature only
// lists what still waits for them. The server still lets them read the draft and both signatures
// (vendor_agreements.js canSeeAgreement names the signer), so the app remembers the agreement's details
// (never its files) at the moment of signing, and the signed copy and the agreement page read it back.
//
// One record per person under `dash.countersigned:<userId>`, newest first, at most 50. Every helper
// catches its own errors and never throws. Signing out does not clear it; it holds no file data.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { AccountsAgreement } from '@/api/accounts';
import { useSession } from '@/auth/session';

const PREFIX = 'dash.countersigned:';
const MAX = 50;
const key = (uid: string) => `${PREFIX}${uid}`;
const queryKey = (uid: string | undefined) => ['docs', 'countersigned', uid ?? ''] as const;

async function read(uid: string): Promise<AccountsAgreement[]> {
  try {
    const raw = await AsyncStorage.getItem(key(uid));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((a): a is AccountsAgreement => !!a && typeof a === 'object' && typeof (a as AccountsAgreement).id === 'string') : [];
  } catch {
    return [];
  }
}

/** Remembers an agreement I just countersigned (its details only), replacing an older copy. */
export async function rememberCountersigned(uid: string, row: AccountsAgreement) {
  try {
    // Only the details the lists carry: never a file, even if a caller passed one.
    const { draft_file_data: _d, signature_file_data: _s, internal_signature_file_data: _i, ...rest } = row as AccountsAgreement & Record<string, unknown>;
    const list = (await read(uid)).filter((a) => a.id !== row.id);
    await AsyncStorage.setItem(key(uid), JSON.stringify([rest, ...list].slice(0, MAX)));
  } catch {
    // Nothing to do: the agreement just won't reopen from this phone.
  }
}

/** The agreements I countersigned on this phone (empty until loaded, or for someone else's session). */
export function useCountersigned(enabled = true) {
  const uid = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: queryKey(uid),
    enabled: enabled && !!uid,
    meta: { persist: false },
    queryFn: () => read(uid!),
  });
}

/** Save + refresh the hook, for the countersign success path. */
export function useRememberCountersigned() {
  const uid = useSession((s) => s.user?.id);
  const qc = useQueryClient();
  return async (row: AccountsAgreement) => {
    if (!uid) return;
    await rememberCountersigned(uid, row);
    await qc.invalidateQueries({ queryKey: queryKey(uid) });
  };
}

/** The lists' copy wins (it is fresher); a remembered one fills in what the lists leave out. */
export function withCountersigned(lists: AccountsAgreement[], mine: AccountsAgreement[] | undefined) {
  const seen = new Set(lists.map((a) => a.id));
  return [...lists, ...(mine ?? []).filter((a) => !seen.has(a.id))];
}
