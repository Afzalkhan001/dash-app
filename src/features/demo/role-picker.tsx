// "Explore DASH as…" — the demo account's role picker (development builds only, demo/config.ts).
//
// One bottom sheet with two sections: Staff (the twelve "Afzal <Role>" personas, demo/personas.ts —
// no CEO or COO) and Vendor portal (demo/vendor/personas.ts). Each row is a ModuleBadge, the persona's
// name and one plain line of what that role sees; the role being explored is marked "Now". Picking a
// row signs straight in as that persona: staff go to the staff app, vendors to the vendor portal (the
// root layout's protected routes do the switch). Opened from:
//   - the code screen, after 123456 (phone or email sign-in)             scope 'all'
//   - the vendor sign-in screen (demo number or email + 123456)          scope 'vendor'
//   - More → "Switch demo role" and the vendor Profile tab, in the app   scope 'all'
// Switching while signed in clears the query cache first, so no role ever sees another's data.
// None of these people exist in the DASH database; everything they see is answered on the phone.

import { Store } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { queryClient } from '@/api/query';
import { useSession } from '@/auth/session';
import { DEMO_ENABLED, VENDOR_DEMO_TOKEN_PREFIX } from '@/demo/config';
import { personaFromToken, personaToken, personaUser, STAFF_PERSONAS, type StaffPersona, staffPersona } from '@/demo/personas';
import { startVendorDemo, VENDOR_DEMO_PERSONAS, type VendorDemoPersona } from '@/demo/vendor/personas';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { ActivityList, ActivityRow, haptic, Sheet, Text, toast } from '@/ui';

export type DemoPickerScope = 'all' | 'staff' | 'vendor';

const FIFTEEN_DAYS = 15 * 86400000;
// The sheet closes first, then the sign-in runs (the screen behind it may unmount).
const AFTER_CLOSE_MS = 280;

/** Sign in — or switch, if someone is signed in — as a staff persona. */
export async function startStaffDemo(id: string) {
  const p = staffPersona(id);
  if (!p || !DEMO_ENABLED) return;
  const s = useSession.getState();
  const switching = !!s.kind;
  if (switching) queryClient.clear();
  await s.signIn({ kind: 'staff', token: personaToken(p), tokenExpiresAt: Date.now() + FIFTEEN_DAYS, user: personaUser(p) });
  // Screens still mounted for the old role can refetch between the clear and the sign-in, with the old
  // token, and store the old role's answer under a key both roles share (['tenants']: one company for
  // staff, every company for Master Admin). Drop those answers (cancel stops one still on its way, which
  // would otherwise land after the invalidation and count as fresh), then ask again as the new role.
  if (switching) {
    await queryClient.cancelQueries();
    void queryClient.invalidateQueries();
  }
}

/** Sign in — or switch — as a vendor persona (the vendor side of the demo does the signing in). */
export async function startVendorPersona(id: string) {
  if (!DEMO_ENABLED) return;
  if (useSession.getState().kind) queryClient.clear();
  await startVendorDemo(id);
}

/** Which persona the current session is, as `staff:<id>` / `vendor:<id>` (null outside the demo). */
function currentKey(token: string | null) {
  const staff = personaFromToken(token);
  if (staff) return `staff:${staff.id}`;
  if (token && token.startsWith(VENDOR_DEMO_TOKEN_PREFIX)) return `vendor:${token.slice(VENDOR_DEMO_TOKEN_PREFIX.length)}`;
  return null;
}

export function DemoRolePicker({
  visible,
  onClose,
  scope = 'all',
  onPicked,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  /** 'vendor' on the vendor sign-in screen; 'all' everywhere else. */
  scope?: DemoPickerScope;
  /** Runs after the sign-in, with the persona id (e.g. to go to Home after a switch in the app). */
  onPicked?: (id: string, kind: 'staff' | 'vendor') => void;
  /**
   * Choose-only mode (the login screen's "Try a demo role", before signing in): report the pick and
   * close — no sign-in happens here; the code screen signs in as it after 123456.
   */
  onChoose?: (id: string, kind: 'staff' | 'vendor') => void;
}) {
  const token = useSession((s) => s.token);
  const now = currentKey(token);
  const [working, setWorking] = useState(false);

  if (!DEMO_ENABLED) return null;

  const run = (kind: 'staff' | 'vendor', id: string) => {
    if (working) return;
    if (onChoose) {
      haptic.select();
      onClose();
      setTimeout(() => onChoose(id, kind), AFTER_CLOSE_MS);
      return;
    }
    if (now === `${kind}:${id}`) return onClose();
    haptic.select();
    setWorking(true);
    onClose();
    setTimeout(() => {
      void (async () => {
        try {
          await (kind === 'staff' ? startStaffDemo(id) : startVendorPersona(id));
          onPicked?.(id, kind);
        } catch {
          toast.show('Could not open that demo role. Try again.', 'danger');
        } finally {
          setWorking(false);
        }
      })();
    }, AFTER_CLOSE_MS);
  };

  const staffRow = (p: StaffPersona) => {
    const isNow = now === `staff:${p.id}`;
    return (
      <ActivityRow
        key={p.id}
        module={p.module}
        icon={p.icon}
        title={p.label}
        subtitle={p.note}
        status={isNow ? { label: 'Now', tone: 'info' } : null}
        chevron={!isNow}
        disabled={working}
        accessibilityHint={isNow ? 'The role you are exploring now' : `Opens DASH as ${p.label}`}
        onPress={() => run('staff', p.id)}
      />
    );
  };

  const vendorRow = (p: VendorDemoPersona) => {
    const isNow = now === `vendor:${p.id}`;
    return (
      <ActivityRow
        key={p.id}
        module="vendor"
        icon={p.icon ?? Store}
        title={p.label}
        subtitle={p.note}
        status={isNow ? { label: 'Now', tone: 'info' } : null}
        chevron={!isNow}
        disabled={working}
        accessibilityHint={isNow ? 'The vendor you are exploring now' : `Opens the vendor portal as ${p.label}`}
        onPress={() => run('vendor', p.id)}
      />
    );
  };

  const showStaff = scope !== 'vendor';
  const showVendor = scope !== 'staff';
  const vendors = Array.isArray(VENDOR_DEMO_PERSONAS) ? VENDOR_DEMO_PERSONAS : [];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Explore DASH as…"
      subtitle={
        scope === 'vendor'
          ? 'Pick which vendor to see. Sample data only.'
          : // The vendor portal has no More tab: its switch row is on Profile.
            `Pick whose view to see. Sample data only — switch any time from ${now?.startsWith('vendor:') ? 'Profile' : 'More'}.`
      }>
      {showStaff ? (
        <ActivityList title="Staff" tone="glass">
          {STAFF_PERSONAS.map(staffRow)}
        </ActivityList>
      ) : null}
      {showVendor ? (
        <ActivityList title="Vendor portal" tone="glass" empty={scope === 'vendor' ? 'The vendor demo is not set up yet.' : undefined}>
          {vendors.map(vendorRow)}
        </ActivityList>
      ) : null}
      <View style={styles.foot}>
        <Text variant="caption" muted align="center">
          {'These Afzal accounts live only in this demo on your phone — they are not in the DASH database. Every code is 123456.'}
        </Text>
      </View>
    </Sheet>
  );
}

/** A picker you can open from a button: `const picker = useDemoRolePicker(); … picker.open(); {picker.element}` */
export function useDemoRolePicker(opts: { scope?: DemoPickerScope; onPicked?: (id: string, kind: 'staff' | 'vendor') => void } = {}) {
  const [visible, setVisible] = useState(false);
  const element = <DemoRolePicker visible={visible} onClose={() => setVisible(false)} scope={opts.scope} onPicked={opts.onPicked} />;
  return { open: () => setVisible(true), close: () => setVisible(false), visible, element };
}

const styles = themedStyles(() => ({
  foot: { paddingHorizontal: space.sm, paddingTop: space.xxs },
}));
