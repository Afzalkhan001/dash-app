// What happens once a vendor's phone is verified (web VendorAuth afterVerify): a brand-new vendor
// must set a password before going in; everyone else is signed straight into the portal.

import * as Haptics from 'expo-haptics';

import type { VendorSessionPayload } from '@/api/vendor';
import { useSession } from '@/auth/session';
import { useVendorAuthFlow } from '@/features/vendor/auth-flow';

export async function finishVendorVerification(r: VendorSessionPayload, phone: string): Promise<'set-password' | 'signed-in'> {
  if (r.isNew) {
    useVendorAuthFlow.getState().set({ pending: { token: r.token, expiresAt: r.expiresAt ?? null }, phone });
    return 'set-password';
  }
  await signInVendor(r.token, r.expiresAt ?? null, phone);
  return 'signed-in';
}

// The root layout's protected routes switch to the (vendor) group as soon as the session is stored.
// The in-progress flow is deliberately NOT reset here: the sign-in screens are still mounted for a
// moment and would read an empty flow as "start over". It is cleared on sign-out instead.
export async function signInVendor(token: string, expiresAt: string | null, phone: string) {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  const s = useSession.getState();
  if (phone) await s.rememberPhone(phone);
  await s.signIn({ kind: 'vendor', token, tokenExpiresAt: expiresAt });
}
