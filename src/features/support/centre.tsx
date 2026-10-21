// Wi-Fi & staff contacts (web: SupportView "Support Centre" tab) — read-only for employees:
//   Wi-Fi: pick a branch (picked for you when there is only one), see its networks; passwords stay
//   hidden until the eye is tapped.
//   Staff: everyone is listed; narrow by branch and/or designation, tap to call. Temporary staff
//   (which expire on their own) are listed alongside permanent staff, marked "Temporary", as on the web.
// Adding/editing entries is an IT Admin task and stays on the website.
// Kit pieces: each network is a frosted account-style row (Wi-Fi badge, name, the password masked
// "••••••••" and a "Show" / "Hide" pill); the people are one frosted ActivityList with a call button.

import { Phone, Users, Wifi, X } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { type StaffEntry, useSupportStaff, useSupportTempStaff, useSupportWifi, type WifiEntry } from '@/api/support';
import { normKey, uniqueLabels } from '@/features/support/format';
import { nameWords, phoneLabel } from '@/features/visitors/format';
import { font, palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  ModuleBadge,
  PillButton,
  type Segment,
  Segmented,
  SelectField,
  Skeleton,
  SkeletonList,
  Text,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
// API rows are guarded once here: a non-array becomes [], and null / non-object rows are dropped.
const rowsOf = <T extends object>(x: unknown): T[] => (Array.isArray(x) ? (x.filter((v) => !!v && typeof v === 'object') as T[]) : []);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** Loading placeholder: labelled field(s), then optionally a list. */
function FilterSkeleton({ fields, rows = 0 }: { fields: number; rows?: number }) {
  return (
    <View style={{ gap: space.md }}>
      {Array.from({ length: fields }).map((_, i) => (
        <View key={i} style={{ gap: 6 }}>
          <Skeleton width={84} height={14} radius={6} />
          <Skeleton height={52} radius={radius.md} />
        </View>
      ))}
      {rows ? <SkeletonList rows={rows} avatar /> : null}
    </View>
  );
}

// A Payno account-style row: the Wi-Fi badge, the network name, the password (masked until "Show";
// selectable once shown, so it can be copied into the phone's Wi-Fi settings) and a frosted pill.
function WifiCard({ w }: { w: WifiEntry }) {
  const [show, setShow] = useState(false);
  const name = str(w.wifiName) || 'Wi-Fi network';
  const pwd = str(w.password);
  return (
    <Card tone="frost" style={styles.wifi}>
      <ModuleBadge module="support" icon={Wifi} />
      <View style={styles.wifiText}>
        <Text variant="body" color={palette.ink} numberOfLines={2} style={styles.medium}>
          {name}
        </Text>
        <Text
          variant="label"
          tabular
          selectable={show}
          muted={!show}
          maxFontSizeMultiplier={1.4}
          style={!show && styles.pwdHidden}
          accessibilityLabel={show ? `Password: ${pwd || 'none'}` : 'Password hidden'}>
          {show ? pwd || '—' : '••••••••'}
        </Text>
      </View>
      <PillButton
        label={show ? 'Hide' : 'Show'}
        chevron={false}
        onPress={() => setShow((v) => !v)}
        accessibilityLabel={show ? `Hide password for ${name}` : `Show password for ${name}`}
      />
    </Card>
  );
}

function WifiSection() {
  const wifi = useSupportWifi();
  const { gap } = useLayout();
  const [picked, setPicked] = useState<string | null>(null);
  const entries = rowsOf<WifiEntry>(wifi.data);
  const branches = uniqueLabels(entries.map((w) => w.branch));
  // With a single branch there is nothing to choose.
  const branch = picked ?? (branches.length === 1 ? branches[0]! : null);
  const results = branch ? entries.filter((w) => normKey(w.branch) === normKey(branch)) : [];

  if (wifi.isLoading) return <FilterSkeleton fields={1} />;
  if (wifi.isError && !wifi.data) return <ErrorState message={wifi.error?.message ?? ''} onRetry={() => void wifi.refetch()} />;
  if (!branches.length) return <EmptyState icon={<Wifi color={palette.textMuted} />} title="No Wi-Fi details yet" message="Ask IT Admin to add your branch." />;

  return (
    <View style={{ gap }}>
      <SelectField
        label="Branch"
        value={branch}
        placeholder="Choose your branch"
        options={branches.map((b) => ({ value: b, label: b }))}
        onChange={setPicked}
      />
      {branch && !results.length ? (
        <EmptyState icon={<Wifi color={palette.textMuted} />} title="No Wi-Fi for this branch" message="Ask IT Admin to add it." />
      ) : null}
      {results.map((w, i) => (
        <WifiCard key={w.id ?? i} w={w} />
      ))}
    </View>
  );
}

function StaffRow({ s }: { s: StaffEntry }) {
  const name = str(s.name) || 'Unnamed';
  const phone = str(s.mobile);
  const dial = phone.replace(/[^\d+]/g, '');
  const role = [str(s.designation), s.isTemp ? 'Temporary' : ''].filter(Boolean).join(' · ');
  const where = [str(s.branch), phoneLabel(phone)].filter(Boolean).join(' · ');
  return (
    <ActivityRow
      person={{ name: nameWords(name).join(' ') }}
      title={name}
      subtitle={role || null}
      note={where || null}
      right={
        dial ? (
          <IconButton tone="surface" accessibilityLabel={`Call ${name}`} onPress={() => void Linking.openURL(`tel:${dial}`).catch(() => {})}>
            <Phone size={20} color={palette.primaryText} strokeWidth={1.8} />
          </IconButton>
        ) : undefined
      }
    />
  );
}

function StaffSection() {
  const staff = useSupportStaff();
  const temp = useSupportTempStaff();
  const { gap } = useLayout();
  const [branch, setBranch] = useState<string | null>(null);
  const [desig, setDesig] = useState<string | null>(null);
  const all: StaffEntry[] = [...rowsOf<StaffEntry>(staff.data), ...rowsOf<StaffEntry>(temp.data).map((s) => ({ ...s, isTemp: true }))];
  const active = all.filter((s) => s.active !== false);
  const branches = uniqueLabels(active.map((s) => s.branch));
  const desigs = uniqueLabels(active.filter((s) => !branch || normKey(s.branch) === normKey(branch)).map((s) => s.designation));
  const results = active.filter((s) => (!branch || normKey(s.branch) === normKey(branch)) && (!desig || normKey(s.designation) === normKey(desig)));
  const filtered = !!(branch || desig);
  const clear = () => {
    setBranch(null);
    setDesig(null);
  };

  if (staff.isLoading) return <FilterSkeleton fields={2} rows={4} />;
  if (staff.isError && !staff.data) return <ErrorState message={staff.error?.message ?? ''} onRetry={() => void staff.refetch()} />;
  if (!branches.length) return <EmptyState icon={<Users color={palette.textMuted} />} title="No staff contacts yet" message="Ask IT Admin to add them." />;

  return (
    <View style={{ gap }}>
      <View style={{ gap: space.md }}>
        <SelectField
          label="Branch"
          value={branch}
          placeholder="Any branch"
          options={branches.map((b) => ({ value: b, label: b }))}
          onChange={(v) => {
            setBranch(v);
            setDesig(null);
          }}
        />
        <SelectField label="Designation" value={desig} placeholder="Any designation" options={desigs.map((d) => ({ value: d, label: d }))} onChange={setDesig} />
        {/* With no matches the EmptyState below carries the one "Clear filters" action. */}
        {filtered && results.length ? <Button variant="text" size="sm" title="Clear filters" icon={<X />} onPress={clear} /> : null}
      </View>
      {/* Like the web, everyone active is listed until a filter narrows it. */}
      {results.length ? (
        <View style={styles.results}>
          <Text variant="caption" muted>
            {results.length === 1 ? '1 person' : `${results.length.toLocaleString('en-IN')} people`}
          </Text>
          <ActivityList>
            {results.map((s, i) => (
              <StaffRow key={`${s.isTemp ? 't' : 's'}-${s.id ?? i}`} s={s} />
            ))}
          </ActivityList>
        </View>
      ) : (
        <EmptyState
          icon={<Users color={palette.textMuted} />}
          title="No one matches"
          action={filtered ? <Button title="Clear filters" variant="accent" size="md" onPress={clear} /> : undefined}
        />
      )}
    </View>
  );
}

const VIEWS: Segment<'wifi' | 'staff'>[] = [
  { key: 'wifi', label: 'Wi-Fi' },
  { key: 'staff', label: 'Contacts' },
];

export function SupportCentre() {
  const [tab, setTab] = useState<'wifi' | 'staff'>('wifi');
  const { gap } = useLayout();
  return (
    <View style={{ gap }}>
      {/* Two views of one screen: the kit's segmented switch, as everywhere else in the app. */}
      <Segmented options={VIEWS} value={tab} onChange={setTab} />
      {tab === 'wifi' ? <WifiSection /> : <StaffSection />}
    </View>
  );
}

const styles = themedStyles(() => ({
  results: { gap: space.xs },
  wifi: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  wifiText: { flex: 1, minWidth: 0, gap: 2 },
  medium: { fontFamily: font.medium },
  pwdHidden: { letterSpacing: 2 },
}));
