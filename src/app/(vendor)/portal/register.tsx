// /portal/register — continue (or fix and send again) the vendor registration. The wizard itself
// lives in features/vendor/register-wizard.tsx and opens on the first unfinished step; this route only
// waits for /vendor/me and refuses statuses the server will not accept edits for (submitted, under
// verification, approved, deactivated).

import { useRouter } from 'expo-router';
import { ClipboardCheck } from 'lucide-react-native';
import { View } from 'react-native';

import { useVendorMe } from '@/api/vendor';
import { EDITABLE_STATUSES } from '@/features/vendor/constants';
import { RegistrationWizard } from '@/features/vendor/register-wizard';
import { palette, radius } from '@/theme/tokens';
import { Button, EmptyState, ErrorState, NavHeader, Screen, Skeleton, useLayout } from '@/ui';

export default function VendorRegister() {
  const router = useRouter();
  const { gap } = useLayout();
  const me = useVendorMe();
  const v = me.data;

  if (v && EDITABLE_STATUSES.includes(v.status)) return <RegistrationWizard vendor={v} />;

  return (
    <Screen header={<NavHeader title="Registration" />}>
      {me.isPending ? (
        <View style={{ gap }}>
          <Skeleton height={6} radius={3} />
          <Skeleton height={18} width="30%" radius={6} />
          <Skeleton height={420} radius={radius.xl} />
        </View>
      ) : !v ? (
        <ErrorState message={me.error?.message ?? 'Could not load your registration.'} onRetry={() => void me.refetch()} />
      ) : (
        <EmptyState
          icon={<ClipboardCheck color={palette.textMuted} />}
          title={v.status === 'approved' ? 'You’re approved' : v.status === 'inactive' ? 'Account deactivated' : 'Nothing to change right now'}
          message={
            v.status === 'approved'
              ? 'To change a detail, open it in Profile and tap Request a change.'
              : v.status === 'inactive'
                ? 'Your account is deactivated. Contact our Accounts team.'
                : 'We’re checking your registration, so it can’t be changed now.'
          }
          action={<Button title="Back to home" variant="ghost" size="md" onPress={() => (router.canGoBack() ? router.back() : router.replace('/portal'))} />}
        />
      )}
    </Screen>
  );
}
