// More — the website's sidebar for this person, then the account settings (owner request: "flow the
// drop" like the DASH website, every section opening into its sub-sections).
//   header  TabRootHeader: the company as a small overline over the centred "More";
//   1. my profile card (→ My profile) on the light warm wash;
//   2. the navigation card (features/more/nav.ts + nav-list.tsx): the website's sections in the
//      website's order and with its names, only those this person has. A section with one page opens
//      it; a section with more pages opens like a folder (remembered on this phone);
//   3. "Account": Change password, App lock, Appearance, Notifications (when push is on), Show me
//      around, and Switch demo role in the demo account (development builds only);
//   4. Sign out in a card of its own, so it is never one slip away from a link;
//   5. the app version.
// The rows under the navigation card move with it as a folder opens or closes (DESIGN §13).

import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { KeyRound, LogOut, Shuffle } from 'lucide-react-native';
import { Alert, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useHrMe, useMyProfile } from '@/api/me';
import { useSession } from '@/auth/session';
import { isDemoToken } from '@/demo/config';
import { personaFromToken } from '@/demo/personas';
import { useDemoRolePicker } from '@/features/demo/role-picker';
import { AppearanceRow } from '@/features/more/appearance';
import { ProfileCard } from '@/features/more/menu-grid';
import { buildMoreNav } from '@/features/more/nav';
import { MORE_LAYOUT, MoreNavList, MoreNavSkeleton } from '@/features/more/nav-list';
import { AppLockRow, useAppLock } from '@/features/more/security-card';
import { personTitle } from '@/features/people/directory';
import { usePolicyPendingCount } from '@/features/policies/use-policy-actions';
import { ShowMeAroundRow } from '@/features/tour/replay-row';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { ListCard, ListRow, ModuleBadge, Screen, SectionHeader, TabRootHeader, Text, TourTarget, useLayout } from '@/ui';

// Sign out's badge: the same tinted disc as a ModuleBadge, in the danger tones.
function SignOutBadge() {
  return (
    <View style={styles.signOut}>
      <LogOut size={20} color={palette.dangerInk} strokeWidth={2} />
    </View>
  );
}

export default function MoreTab() {
  const router = useRouter();
  const qc = useQueryClient();
  const { gap } = useLayout();
  const user = useSession((s) => s.user);
  const access = useAccess();
  const profile = useMyProfile();
  const policiesToRead = usePolicyPendingCount();
  const lock = useAppLock();
  // isPending also covers the restore of the saved cache on a cold start (access.loading misses it),
  // so HR's pages don't pop into a list that is already showing.
  const hrPending = useHrMe().isPending;
  const accessPending = access.loading || hrPending;
  // The demo's role switcher (isDemoToken is false in store builds).
  const demoToken = useSession((s) => (isDemoToken(s.token) ? s.token : null));
  const demoPersona = personaFromToken(demoToken);
  const rolePicker = useDemoRolePicker({ onPicked: (_id, kind) => kind === 'staff' && router.navigate('/') });

  const nav = accessPending ? null : buildMoreNav(access, { policiesToRead });
  const me = profile.data ?? user;
  const avatar = profile.data?.avatar;
  const photo = typeof avatar === 'string' && avatar ? avatar : null;
  const company = String(access.tenant?.name ?? '').trim() || 'DASH';
  const version = Constants.expoConfig?.version;

  const refresh = () =>
    Promise.all([
      profile.refetch(),
      access.refetch(),
      access.sections.policies ? qc.invalidateQueries({ queryKey: ['policies', 'list'] }) : null,
    ]);

  const confirmSignOut = () =>
    Alert.alert('Sign out of DASH?', 'You will need to sign in again on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void useSession.getState().signOut() },
    ]);

  return (
    <Screen withTabBar onRefresh={refresh} header={<TabRootHeader title="More" overline={company} />}>
      <ProfileCard key="profile" name={me?.name || 'My profile'} photo={photo} title={personTitle(me)} onPress={() => router.push('/profile')} />

      <View key="body" style={{ gap }}>
        {nav ? <MoreNavList sections={nav.sections} /> : <MoreNavSkeleton />}

        <Animated.View layout={MORE_LAYOUT} style={styles.section}>
          <SectionHeader title="Account" />
          <ListCard tone="surface">
            <ListRow
              left={<ModuleBadge module="security" icon={KeyRound} />}
              title="Change password"
              subtitle="For signing in with email"
              subtitleLines={2}
              chevron
              onPress={() => router.push('/profile/password')}
            />
            <TourTarget id="more.appLock">
              <AppLockRow lock={lock} />
            </TourTarget>
            <TourTarget id="more.appearance">
              <AppearanceRow />
            </TourTarget>
            {(nav?.account ?? []).map((r) => (
              <TourTarget key={r.key} id={r.tourId ?? `more.${r.key}`}>
                <ListRow
                  left={<ModuleBadge module={r.module} icon={r.icon} />}
                  title={r.label}
                  subtitle={r.subtitle}
                  subtitleLines={2}
                  chevron
                  onPress={() => router.push(r.href)}
                />
              </TourTarget>
            ))}
            <ShowMeAroundRow kind="staff" />
            {demoToken ? (
              <TourTarget id="more.switchDemo">
                <ListRow
                  left={<ModuleBadge module="bounty" icon={Shuffle} />}
                  title="Switch demo role"
                  subtitle={demoPersona ? `Now ${demoPersona.label} · sample data only` : 'Sample data only'}
                  subtitleLines={2}
                  chevron
                  onPress={rolePicker.open}
                  accessibilityHint="Opens the list of demo roles"
                />
              </TourTarget>
            ) : null}
          </ListCard>
          {demoToken ? rolePicker.element : null}
        </Animated.View>

        <Animated.View layout={MORE_LAYOUT}>
          <ListCard tone="surface">
            <ListRow left={<SignOutBadge />} title="Sign out" titleColor={palette.dangerInk} onPress={confirmSignOut} accessibilityHint="Asks before signing you out" />
          </ListCard>
        </Animated.View>

        <Animated.View layout={MORE_LAYOUT}>
          <Text variant="caption" muted align="center" style={styles.version}>
            DASH{version ? ` · version ${version}` : ''}
          </Text>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.xxs },
  signOut: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  version: { paddingTop: space.xxs },
}));
