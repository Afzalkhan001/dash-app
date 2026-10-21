// Vendor Home: the vendor's status and the ONE next step. Before approval it is the registration
// status ("Finish your registration · Step 3 of 7", "We're checking your details", what to fix) with
// one button; once approved it is the money summary, the agreements waiting for a signature and the
// latest bills. A deactivated account (403) says so and offers Sign out.
// Header in the Payno style (HomeHeader): the business's avatar (→ Profile) on the left, a small muted
// "Good morning" over the business's trade name (legal name when there is none), no bell (vendors
// have no inbox). The Vendor ID rides on the
// dues hero's info chip (Payno's light SummaryHero); before approval the hero carries the status.

import { useRouter } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { useVendorAgreements, useVendorBills, useVendorMe, vendorSignOut } from '@/api/vendor';
import { useNow } from '@/features/attendance/use-now';
import { ApprovedHome, RegistrationHome } from '@/features/vendor/home';
import { greeting } from '@/lib/dates';
import { radius } from '@/theme/tokens';
import { Button, ErrorState, HomeHeader, Screen, Skeleton, SkeletonList, useLayout } from '@/ui';

const str = (s: unknown) => (typeof s === 'string' ? s.trim() : '');

export default function VendorHome() {
  const router = useRouter();
  const now = useNow();
  const { gap } = useLayout();
  const me = useVendorMe();
  const v = me.data;
  const approved = v?.status === 'approved';
  const bills = useVendorBills(approved);
  const agreements = useVendorAgreements(approved);
  const [signingOut, setSigningOut] = useState(false);

  const refresh = () => Promise.all([me.refetch(), ...(approved ? [bills.refetch(), agreements.refetch()] : [])]);
  // The greeting uses the name the business goes by (trade name, usually short) and falls back to the
  // legal name, which Profile shows in full; a long legal name would be cut at 320 dp.
  const business = str(v?.business?.tradeName) || str(v?.business?.legalEntityName);
  const name = v ? business || 'Your registration' : 'Vendor portal';

  // A deactivated account is refused on every route (403) — say so, and offer the way out.
  const blocked = me.error instanceof ApiRequestError && me.error.status === 403;

  return (
    <Screen
      withTabBar
      onRefresh={refresh}
      header={
        <HomeHeader
          greeting={greeting(new Date(now))}
          name={name}
          avatarName={business || 'Vendor'}
          onAvatarPress={v ? () => router.push('/portal/profile') : undefined}
          avatarLabel="Open profile"
        />
      }>
      {me.isPending ? (
        <View style={{ gap }}>
          <Skeleton height={300} radius={radius.xxl} />
          <SkeletonList rows={3} avatar tone="surface" />
        </View>
      ) : !v ? (
        <View style={{ gap }}>
          <ErrorState
            title={blocked ? 'Account not available' : undefined}
            message={me.error?.message ?? 'Could not load your account.'}
            onRetry={blocked ? undefined : () => void me.refetch()}
          />
          {blocked ? (
            <Button
              title="Sign out"
              variant="danger"
              icon={<LogOut />}
              loading={signingOut}
              onPress={() => {
                setSigningOut(true);
                void vendorSignOut().finally(() => setSigningOut(false));
              }}
            />
          ) : null}
        </View>
      ) : approved ? (
        <ApprovedHome bills={bills} agreements={agreements} code={v.vendorCode} />
      ) : (
        <RegistrationHome vendor={v} />
      )}
    </Screen>
  );
}
