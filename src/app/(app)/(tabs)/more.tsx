// More — everything that is not on Home, Me or Inbox, in one short page (docs/REFERENCE-COMPONENTS.md
// §3 More, Payno):
//   header  TabRootHeader: the company as a small overline over the centred "More";
//   1. my profile card (→ My profile) on the light warm wash: photo or initials, name, job title and
//      "View profile ›";
//   2. "Apps": ONE CategoryGrid of the secondary modules (at most 9), frosted round tiles on the canvas,
//      each shown only when the website would show it to this person (features/more/menu.ts); the only
//      badge is "policies to read";
//   3. "Attendance": Holidays and Timesheets as plain rows (only for people without Me › Attendance);
//   4. "Account": Change password, App lock and Appearance in one frosted list, then Sign out in a card
//      of its own, so Sign out is never one slip away from a link (this is the only place for password,
//      app lock and appearance);
//   5. the app version.
// In the demo account (development builds only) a "Demo" row under the profile card opens the role
// picker, so every Afzal role can be explored without signing out (features/demo/role-picker.tsx).
// "Show me around" (Account, under Appearance) replays the role's first-sign-in tour (docs/TOUR.md);
// App lock, Appearance and that row are tour targets too. Switching demo role resets nothing else.

import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { KeyRound, LogOut, Shuffle } from 'lucide-react-native';
import { Alert, View } from 'react-native';

import { useHrMe, useMyProfile } from '@/api/me';
import { useSession } from '@/auth/session';
import { isDemoToken } from '@/demo/config';
import { personaFromToken } from '@/demo/personas';
import { useDemoRolePicker } from '@/features/demo/role-picker';
import { AppearanceRow } from '@/features/more/appearance';
import { buildMoreMenu } from '@/features/more/menu';
import { MenuGrid, MenuGridSkeleton, ProfileCard } from '@/features/more/menu-grid';
import { AppLockRow, useAppLock } from '@/features/more/security-card';
import { personTitle } from '@/features/people/directory';
import { usePolicyPendingCount } from '@/features/policies/use-policy-actions';
import { ShowMeAroundRow } from '@/features/tour/replay-row';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { ListCard, ListRow, ModuleBadge, Screen, SectionHeader, TabRootHeader, Text, TourTarget } from '@/ui';

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
  const user = useSession((s) => s.user);
  const access = useAccess();
  const profile = useMyProfile();
  const policiesToRead = usePolicyPendingCount();
  const lock = useAppLock();
  // isPending also covers the restore of the saved cache on a cold start (access.loading misses it),
  // so Policies / Holidays / Timesheets don't pop into a grid that is already showing.
  const hrPending = useHrMe().isPending;
  const accessPending = access.loading || hrPending;
  // The demo's role switcher (isDemoToken is false in store builds).
  const demoToken = useSession((s) => (isDemoToken(s.token) ? s.token : null));
  const demoPersona = personaFromToken(demoToken);
  const rolePicker = useDemoRolePicker({ onPicked: (_id, kind) => kind === 'staff' && router.navigate('/') });

  const menu = buildMoreMenu(access, { policiesToRead });
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

      {demoToken ? (
        <View key="demo" style={styles.section}>
          <SectionHeader title="Demo" />
          <ListCard tone="surface">
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
          </ListCard>
          {rolePicker.element}
        </View>
      ) : null}

      {/* Same key for the placeholder and the grid, so the grid swaps in place when /hr/me arrives. */}
      {accessPending || menu.tiles.length ? (
        <View key="grid" style={styles.section}>
          <SectionHeader title="Apps" />
          {accessPending ? <MenuGridSkeleton /> : <MenuGrid items={menu.tiles} />}
        </View>
      ) : null}

      {menu.links.length ? (
        <View key="links" style={styles.section}>
          <SectionHeader title="Attendance" />
          <ListCard tone="surface">
            {menu.links.map((link) => (
              <ListRow key={link.key} left={<ModuleBadge module={link.module} icon={link.icon} />} title={link.label} chevron onPress={() => router.push(link.href)} />
            ))}
          </ListCard>
        </View>
      ) : null}

      <View key="account" style={styles.section}>
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
          <ShowMeAroundRow kind="staff" />
        </ListCard>
      </View>

      <ListCard key="signout" tone="surface">
        <ListRow left={<SignOutBadge />} title="Sign out" titleColor={palette.dangerInk} onPress={confirmSignOut} accessibilityHint="Asks before signing you out" />
      </ListCard>

      <Text key="version" variant="caption" muted align="center" style={styles.version}>
        DASH{version ? ` · version ${version}` : ''}
      </Text>
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
