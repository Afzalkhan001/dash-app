// Support centre, admin side (web: SupportView "Support Centre" and "Admin Requests" managers,
// dash.html:29187–29700). What everyone reads in Help & support › Contacts, kept up to date here:
//   Wi-Fi        branch, network name, password (IT Admin, Super Admin, CEO, COO)
//   Staff        office contacts by branch: add, edit, show / hide, delete (same roles)
//   Temp staff   contacts that expire after N days (same roles)
//   Lists        office request items and complaint types (Admin, Super Admin, CEO, COO, App Manager)
// The website posts these rows without the company id, and routes/support.js doesn't add it, so such a
// row would be invisible to everyone; the app sends the company id with every new row (spec §2.6).
// Deleting is swiped (it can't be undone). No one is messaged by anything here.

import { Redirect } from 'expo-router';
import { Eye, EyeOff, KeyRound, ListPlus, Phone, Plus, Share2, Trash2, UserRound, Wifi } from 'lucide-react-native';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { useSupportWrites } from '@/api/itdesk';
import { type ConfigItem, type StaffEntry, type TempStaffEntry, useSupportConfig, useSupportStaff, useSupportTempStaff, useSupportWifi, type WifiEntry } from '@/api/support';
import { useNow } from '@/features/attendance/use-now';
import { canManageSupport, isSupportItAdmin, isSupportListAdmin } from '@/features/itdesk/access';
import { StatusRow, ToggleRow } from '@/features/itdesk/ui';
import { phoneLabel } from '@/features/visitors/format';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { type ModuleKey, palette, space } from '@/theme/tokens';
import type { LucideIcon } from 'lucide-react-native';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  IconButton,
  ListCard,
  ListRow,
  MenuSheet,
  NavHeader,
  Screen,
  Segmented,
  Sheet,
  SkeletonList,
  Text,
  TextField,
  toast,
  useLayout,
} from '@/ui';

type Tab = 'wifi' | 'staff' | 'temp' | 'lists';
type Confirm = { title: string; what: string; sub?: string; icon: LucideIcon; run: () => Promise<unknown> };
const norm = (v: string) => String(v || '').trim().toLowerCase();

export default function SupportCentreScreen() {
  const access = useAccess();
  const role = access.user?.role;
  const allowed = canManageSupport(access);
  const it = isSupportItAdmin(role);
  const lists = isSupportListAdmin(role);
  const tabs: { key: Tab; label: string }[] = [
    ...(it
      ? [
          { key: 'wifi' as const, label: 'Wi-Fi' },
          { key: 'staff' as const, label: 'Staff' },
          { key: 'temp' as const, label: 'Temp staff' },
        ]
      : []),
    ...(lists ? [{ key: 'lists' as const, label: 'Lists' }] : []),
  ];
  const [tabPick, setTab] = useState<Tab | null>(null);
  const tab: Tab = tabPick && tabs.some((t) => t.key === tabPick) ? tabPick : (tabs[0]?.key ?? 'wifi');
  const wifi = useSupportWifi(allowed && it && tab === 'wifi');
  const staff = useSupportStaff(allowed && it && tab === 'staff');
  const temp = useSupportTempStaff(allowed && it && tab === 'temp');
  const config = useSupportConfig(allowed && lists && tab === 'lists');
  const w = useSupportWrites();
  const now = useNow();
  const { compact } = useLayout();

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [wifiMenu, setWifiMenu] = useState<WifiEntry | null>(null);
  const [tempMenu, setTempMenu] = useState<TempStaffEntry | null>(null);
  const [adding, setAdding] = useState<Tab | null>(null);
  const [editStaff, setEditStaff] = useState<StaffEntry | null>(null);

  if (access.user && !allowed) return <Redirect href="/" />;

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      await confirm.run();
      toast.show(`${confirm.what} deleted`, 'success');
      setConfirm(null);
    } catch (e) {
      toast.show(`Couldn’t delete: ${e instanceof Error ? e.message : 'try again'}`, 'danger');
    } finally {
      setConfirmBusy(false);
    }
  };

  const loadingOr = (q: { isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown; data?: unknown }) =>
    q.isPending ? <SkeletonList rows={5} avatar /> : q.isError && !q.data ? <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} /> : null;

  // Wi-Fi grouped by branch (case and spaces ignored, as the website matches them).
  const wifiRows = wifi.data ?? [];
  const branches = [...new Map(wifiRows.map((x) => [norm(x.branch), x.branch.trim() || 'No branch'])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  // dash.html:29295 daysLeft — rounded up, so "3 days" on the day they are added.
  const daysLeft = (s: TempStaffEntry) => (s.expiresAt ? Math.max(0, Math.ceil((Date.parse(s.expiresAt) - now) / 86_400_000)) : null);

  const addLabel = tab === 'wifi' ? 'Add a Wi-Fi network' : tab === 'staff' ? 'Add a contact' : tab === 'temp' ? 'Add temp staff' : '';

  return (
    <Screen
      header={<NavHeader title="Support centre" actions={tab === 'lists' ? [] : [{ key: 'add', icon: Plus, label: addLabel, onPress: () => setAdding(tab) }]} />}
      onRefresh={() => (tab === 'wifi' ? wifi.refetch() : tab === 'staff' ? staff.refetch() : tab === 'temp' ? temp.refetch() : config.refetch())}>
      {/* Four tabs (Super Admin) cut "Temp s…" in a segmented control on a narrow phone; chips scroll instead. */}
      {tabs.length > 1 ? (
        compact && tabs.length > 3 ? (
          <ChipRow>
            {tabs.map((t) => (
              <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />
            ))}
          </ChipRow>
        ) : (
          <Segmented<Tab> options={tabs} value={tab} onChange={setTab} />
        )
      ) : null}

      {tab === 'wifi' ? (
        loadingOr(wifi) ??
        (wifiRows.length ? (
          <View style={styles.block}>
            <ChipRow>
              <Chip label={showPw ? 'Hide passwords' : 'Show passwords'} icon={showPw ? <EyeOff /> : <Eye />} selected={showPw} onPress={() => setShowPw(!showPw)} />
            </ChipRow>
            {branches.map(([key, label]) => (
              <ActivityList key={key} title={label}>
                {wifiRows
                  .filter((x) => norm(x.branch) === key)
                  .map((x) => (
                    <ActivityRow
                      key={x.id}
                      module="support"
                      icon={Wifi}
                      title={x.wifiName || 'Network'}
                      subtitle={showPw ? x.password || '—' : 'Password hidden'}
                      chevron
                      onPress={() => setWifiMenu(x)}
                    />
                  ))}
              </ActivityList>
            ))}
          </View>
        ) : (
          <EmptyState icon={<Wifi color={palette.textMuted} />} title="No Wi-Fi networks yet" message="Add each branch’s network so people can find it in Help & support." action={<Button title="Add a network" variant="accent" size="md" icon={<Plus />} onPress={() => setAdding('wifi')} />} />
        ))
      ) : null}

      {tab === 'staff' ? (
        loadingOr(staff) ??
        ((staff.data ?? []).length ? (
          <ActivityList title={plural((staff.data ?? []).length, 'office contact')}>
            {[...(staff.data ?? [])]
              .sort((a, b) => a.branch.localeCompare(b.branch) || a.designation.localeCompare(b.designation))
              .map((s) => (
                <StatusRow
                  key={s.id}
                  person={{ name: s.name }}
                  title={s.name}
                  subtitle={[s.designation, s.branch].filter(Boolean).join(' · ')}
                  note={s.mobile ? phoneLabel(s.mobile) : undefined}
                  // Shown is the usual state; only a hidden contact carries a pill.
                  status={s.active === false ? { label: 'Hidden', tone: 'neutral' } : null}
                  chevron
                  onPress={() => setEditStaff(s)}
                />
              ))}
          </ActivityList>
        ) : (
          <EmptyState icon={<UserRound color={palette.textMuted} />} title="No office contacts yet" message="Add the front desk, drivers, security and others by branch." action={<Button title="Add a contact" variant="accent" size="md" icon={<Plus />} onPress={() => setAdding('staff')} />} />
        ))
      ) : null}

      {tab === 'temp' ? (
        loadingOr(temp) ??
        ((temp.data ?? []).length ? (
          <View style={styles.block}>
            <Text variant="caption" muted>
              Temp staff show next to the office contacts and drop off by themselves when their days run out.
            </Text>
            <ActivityList>
              {(temp.data ?? []).map((s) => {
                const left = daysLeft(s);
                return (
                  <StatusRow
                    key={s.id}
                    person={{ name: s.name }}
                    title={s.name}
                    subtitle={[s.designation, s.branch].filter(Boolean).join(' · ')}
                    note={s.mobile ? phoneLabel(s.mobile) : undefined}
                    // Amber only when they are about to drop off; otherwise a calm grey count.
                    status={left == null ? undefined : { label: left === 0 ? 'Ends today' : `${plural(left, 'day')} left`, tone: left <= 1 ? 'pending' : 'neutral' }}
                    chevron
                    onPress={() => setTempMenu(s)}
                  />
                );
              })}
            </ActivityList>
          </View>
        ) : (
          <EmptyState icon={<UserRound color={palette.textMuted} />} title="No temp staff" message="Add a driver or helper for a shoot; they disappear after the days you set." action={<Button title="Add temp staff" variant="accent" size="md" icon={<Plus />} onPress={() => setAdding('temp')} />} />
        ))
      ) : null}

      {tab === 'lists' ? (
        loadingOr(config) ?? (
          <View style={styles.block}>
            <ListManager
              title="Office request items"
              hint="What people can ask the office for (Help & support › Office request)."
              placeholder="e.g. Notebook, stapler"
              items={(config.data ?? []).filter((c) => c.listType === 'admin_item')}
              busy={w.addListItem.isPending}
              onAdd={(label) => w.addListItem.mutateAsync({ listType: 'admin_item', label })}
              onRemove={(c) => setConfirm({ title: `Remove ${c.label}?`, what: c.label, sub: 'Office request item', icon: ListPlus, run: () => w.removeListItem.mutateAsync(c.id) })}
            />
            <ListManager
              title="Complaint types"
              hint="The types people choose from when they raise a complaint."
              placeholder="e.g. Facilities, Behaviour & work"
              items={(config.data ?? []).filter((c) => c.listType === 'complaint_type')}
              busy={w.addListItem.isPending}
              onAdd={(label) => w.addListItem.mutateAsync({ listType: 'complaint_type', label })}
              onRemove={(c) => setConfirm({ title: `Remove ${c.label}?`, what: c.label, sub: 'Complaint type', icon: ListPlus, run: () => w.removeListItem.mutateAsync(c.id) })}
            />
          </View>
        )
      ) : null}

      <MenuSheet
        visible={!!wifiMenu}
        onClose={() => setWifiMenu(null)}
        title={wifiMenu?.wifiName}
        subtitle={wifiMenu?.branch}
        items={[
          {
            key: 'share',
            label: 'Share name and password',
            icon: Share2,
            onPress: () => {
              const x = wifiMenu;
              if (x) void Share.share({ message: `${x.branch} Wi-Fi\nNetwork: ${x.wifiName}\nPassword: ${x.password}` }).catch(() => {});
            },
          },
          {
            key: 'delete',
            label: 'Delete network',
            icon: Trash2,
            tone: 'danger',
            onPress: () => {
              const x = wifiMenu;
              if (x) setConfirm({ title: `Delete ${x.wifiName}?`, what: x.wifiName, sub: x.branch, icon: Wifi, run: () => w.removeWifi.mutateAsync(x.id) });
            },
          },
        ]}
      />

      <MenuSheet
        visible={!!tempMenu}
        onClose={() => setTempMenu(null)}
        title={tempMenu?.name}
        subtitle={[tempMenu?.designation, tempMenu?.branch].filter(Boolean).join(' · ')}
        items={[
          ...(tempMenu?.mobile ? [{ key: 'share', label: 'Share contact', icon: Phone, onPress: () => tempMenu && void Share.share({ message: `${tempMenu.name} (${tempMenu.designation}), ${tempMenu.mobile}` }).catch(() => {}) }] : []),
          {
            key: 'delete',
            label: 'Remove now',
            icon: Trash2,
            tone: 'danger' as const,
            onPress: () => {
              const x = tempMenu;
              if (x) setConfirm({ title: `Remove ${x.name}?`, what: x.name, sub: x.designation, icon: UserRound, run: () => w.removeTemp.mutateAsync(x.id) });
            },
          },
        ]}
      />

      {adding === 'wifi' ? <WifiSheet onClose={() => setAdding(null)} /> : null}
      {adding === 'staff' || editStaff ? (
        <StaffSheet
          key={editStaff?.id ?? 'new'}
          entry={editStaff}
          onClose={() => {
            setAdding(null);
            setEditStaff(null);
          }}
          onDelete={(s) => {
            setEditStaff(null);
            setConfirm({ title: `Delete ${s.name}?`, what: s.name, sub: s.designation, icon: UserRound, run: () => w.removeStaff.mutateAsync(s.id) });
          }}
        />
      ) : null}
      {adding === 'temp' ? <TempSheet onClose={() => setAdding(null)} /> : null}

      <ConfirmSheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        from={{ title: confirm?.what ?? '', subtitle: confirm?.sub, icon: confirm?.icon ?? Trash2, module: 'support' as ModuleKey }}
        to={{ title: 'Deleted', subtitle: 'Gone from Help & support', icon: Trash2, module: 'security' }}
        confirmLabel="Swipe to delete"
        loading={confirmBusy}
        onConfirm={() => void runConfirm()}
        note="This can’t be undone. No one is notified."
      />
    </Screen>
  );
}

/** One editable list (office request items / complaint types): add with a field, remove with a swipe. */
function ListManager({
  title,
  hint,
  placeholder,
  items,
  busy,
  onAdd,
  onRemove,
}: {
  title: string;
  hint: string;
  placeholder: string;
  items: ConfigItem[];
  busy: boolean;
  onAdd: (label: string) => Promise<unknown>;
  onRemove: (c: ConfigItem) => void;
}) {
  const [label, setLabel] = useState('');
  const add = async () => {
    const v = label.trim();
    if (!v) return;
    if (items.some((c) => norm(c.label) === norm(v))) return toast.show(`${v} is already on the list`, 'info');
    try {
      await onAdd(v);
      setLabel('');
      toast.show(`${v} added`, 'success');
    } catch (e) {
      toast.show(`Couldn’t add it: ${e instanceof Error ? e.message : 'try again'}`, 'danger');
    }
  };
  return (
    <View style={styles.block}>
      <Text variant="heading">{title}</Text>
      <Text variant="caption" muted>
        {hint}
      </Text>
      {/* The add button sits in the field (a full-width disabled button under it was most of the card). */}
      <Card>
        <TextField
          label="Add one"
          value={label}
          onChangeText={setLabel}
          placeholder={placeholder}
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={() => void add()}
          right={
            <IconButton accessibilityLabel={label.trim() ? `Add ${label.trim()}` : 'Add'} size={32} tone={label.trim() ? 'muted' : 'surface'} disabled={!label.trim() || busy} onPress={() => void add()}>
              <Plus size={18} color={label.trim() ? palette.primaryText : palette.textMuted} />
            </IconButton>
          }
        />
      </Card>
      {items.length ? (
        <ListCard separatorInset={16}>
          {items.map((c) => (
            <ListRow
              key={c.id}
              title={c.label}
              numberOfLines={2}
              right={
                <IconButton accessibilityLabel={`Remove ${c.label}`} tone="surface" onPress={() => onRemove(c)}>
                  <Trash2 size={18} color={palette.textMuted} />
                </IconButton>
              }
            />
          ))}
        </ListCard>
      ) : (
        <Text variant="body" muted>
          Nothing on this list yet.
        </Text>
      )}
    </View>
  );
}

function WifiSheet({ onClose }: { onClose: () => void }) {
  const w = useSupportWrites();
  const [f, setF] = useState({ branch: '', wifiName: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const ok = !!(f.branch.trim() && f.wifiName.trim() && f.password);
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add a Wi-Fi network"
      subtitle="Everyone sees it in Help & support › Contacts."
      dirty={!!(f.branch || f.wifiName || f.password)}
      footer={
        <Button
          title="Add network"
          icon={<Wifi />}
          disabled={!ok}
          loading={w.addWifi.isPending}
          onPress={() =>
            w.addWifi.mutate(
              { branch: f.branch.trim(), wifiName: f.wifiName.trim(), password: f.password },
              {
                onSuccess: () => {
                  toast.show('Network added', 'success');
                  onClose();
                },
                onError: (e) => setError(e.message),
              },
            )
          }
        />
      }>
      <View style={styles.group}>
        <TextField label="Branch" value={f.branch} onChangeText={(v) => setF((x) => ({ ...x, branch: v }))} placeholder="e.g. Jubilee Hills HQ" />
        <TextField label="Network name" value={f.wifiName} onChangeText={(v) => setF((x) => ({ ...x, wifiName: v }))} placeholder="As it shows on the phone" autoCapitalize="none" autoCorrect={false} />
        <TextField label="Password" value={f.password} onChangeText={(v) => setF((x) => ({ ...x, password: v }))} placeholder="Password" autoCapitalize="none" autoCorrect={false} left={<KeyRound size={18} color={palette.textMuted} />} />
        {error ? <Banner tone="danger" title="Couldn’t add it" message={error} /> : null}
      </View>
    </Sheet>
  );
}

function StaffSheet({ entry, onClose, onDelete }: { entry: StaffEntry | null; onClose: () => void; onDelete: (s: StaffEntry) => void }) {
  const w = useSupportWrites();
  const [f, setF] = useState({ branch: entry?.branch ?? '', designation: entry?.designation ?? '', name: entry?.name ?? '', mobile: entry?.mobile ?? '' });
  const [active, setActive] = useState(entry ? entry.active !== false : true);
  const [error, setError] = useState<string | null>(null);
  const ok = !!(f.branch.trim() && f.designation.trim() && f.name.trim() && f.mobile.trim());
  const body = { branch: f.branch.trim(), designation: f.designation.trim(), name: f.name.trim(), mobile: f.mobile.trim() };
  const save = () => {
    const done = {
      onSuccess: () => {
        toast.show(entry ? 'Contact saved' : 'Contact added', 'success');
        onClose();
      },
      onError: (e: Error) => setError(e.message),
    };
    if (entry) w.editStaff.mutate({ id: entry.id, changes: { ...body, active } }, done);
    else w.addStaff.mutate(body, done);
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title={entry ? 'Edit contact' : 'Add an office contact'}
      subtitle="Shown in Help & support › Contacts, by branch."
      dirty={!entry && !!(f.name || f.mobile)}
      footer={
        <View style={styles.buttons}>
          <Button title={entry ? 'Save contact' : 'Add contact'} disabled={!ok} loading={w.addStaff.isPending || w.editStaff.isPending} onPress={save} />
          {entry ? <Button title="Delete contact" variant="text" size="md" icon={<Trash2 />} onPress={() => onDelete(entry)} /> : null}
        </View>
      }>
      <View style={styles.group}>
        <TextField label="Name" value={f.name} onChangeText={(v) => setF((x) => ({ ...x, name: v }))} placeholder="Full name" />
        <TextField label="Role" value={f.designation} onChangeText={(v) => setF((x) => ({ ...x, designation: v }))} placeholder="e.g. Front desk, Driver" />
        <TextField label="Branch" value={f.branch} onChangeText={(v) => setF((x) => ({ ...x, branch: v }))} placeholder="e.g. Jubilee Hills HQ" />
        <TextField label="Mobile" value={f.mobile} onChangeText={(v) => setF((x) => ({ ...x, mobile: v }))} placeholder="+91 …" keyboardType="phone-pad" />
        {entry ? <ToggleRow bleed title="Show in the directory" subtitle="Off hides them without deleting." value={active} onChange={setActive} /> : null}
        {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
      </View>
    </Sheet>
  );
}

function TempSheet({ onClose }: { onClose: () => void }) {
  const w = useSupportWrites();
  const [f, setF] = useState({ branch: '', designation: '', name: '', mobile: '', days: '' });
  const [error, setError] = useState<string | null>(null);
  const days = Number(f.days) || 0;
  const ok = !!(f.branch.trim() && f.designation.trim() && f.name.trim() && f.mobile.trim() && days > 0);
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add temp staff"
      subtitle="They show with the office contacts until their days run out."
      dirty={!!(f.name || f.mobile)}
      footer={
        <Button
          title="Add temp staff"
          disabled={!ok}
          loading={w.addTemp.isPending}
          onPress={() =>
            w.addTemp.mutate(
              { branch: f.branch.trim(), designation: f.designation.trim(), name: f.name.trim(), mobile: f.mobile.trim(), days },
              {
                onSuccess: () => {
                  toast.show(`Added for ${plural(days, 'day')}`, 'success');
                  onClose();
                },
                onError: (e) => setError(e.message),
              },
            )
          }
        />
      }>
      <View style={styles.group}>
        <TextField label="Name" value={f.name} onChangeText={(v) => setF((x) => ({ ...x, name: v }))} placeholder="Full name" />
        <TextField label="Role" value={f.designation} onChangeText={(v) => setF((x) => ({ ...x, designation: v }))} placeholder="e.g. Helper, Driver" />
        <TextField label="Branch" value={f.branch} onChangeText={(v) => setF((x) => ({ ...x, branch: v }))} placeholder="e.g. Gachibowli Studio" />
        <TextField label="Contact number" value={f.mobile} onChangeText={(v) => setF((x) => ({ ...x, mobile: v }))} placeholder="+91 …" keyboardType="phone-pad" />
        <TextField
          label="For how many days"
          value={f.days}
          onChangeText={(v) => setF((x) => ({ ...x, days: v.replace(/\D/g, '').slice(0, 3) }))}
          placeholder="e.g. 15"
          keyboardType="number-pad"
          error={f.days && days < 1 ? 'Enter 1 or more' : null}
        />
        {error ? <Banner tone="danger" title="Couldn’t add them" message={error} /> : null}
      </View>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  block: { gap: space.sm },
  group: { gap: space.md },
  buttons: { gap: space.xs },
}));
