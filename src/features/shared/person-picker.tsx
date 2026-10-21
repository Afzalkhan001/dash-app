// Person picker (Wave 0 shared helper, integrator-owned; any domain may import it). One sheet for every
// "choose someone" in the admin screens — assign a task, book a professional, raise a ticket for
// someone, add a creator, pick a host:
//
//   const people = usePickablePeople();                       // GET /users, slimmed (no photos, no bank)
//   <PersonPicker
//     visible={open} onClose={() => setOpen(false)}
//     title="Assign to" people={people.data} loading={people.isPending}
//     filter={(p) => p.role !== 'master_admin'}                // the web's own candidate rule
//     date={dueDate}                                          // shows "On leave" that day (IST)
//     recentKey="work.assign"                                 // remembers the last picks (this session)
//     selectedId={value?.id} onPick={(p) => setValue(p)} />
//
// The sheet: a search field (name, employee number, job title, department), the recent picks as
// round tiles before anything is typed, then up to 60 matching people as rows — photo or initials,
// name, "job title · department", and an "On leave" pill on people who are off on `date`. Someone on
// leave can't be picked unless `allowOnLeave` (their row says why). Names are shown exactly as the
// server has them: several web rules match people by display name.

import { useQuery } from '@tanstack/react-query';
import { Check, Search, SearchX } from 'lucide-react-native';
import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { api, unwrap } from '@/api/client';
import { useLeaveDays, usePersonPhoto } from '@/api/people';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { palette, space } from '@/theme/tokens';
import { Avatar, type AvatarTileItem, AvatarTiles, ListCard, ListRow, Sheet, StatusPill, Text, TextField } from '@/ui';

import { themedStyles } from '@/theme/themed';

/** One person as the picker shows them (from GET /users, slimmed). `extra` holds the fields asked for by `keep`. */
export type PickPerson = {
  id: string;
  name: string;
  role?: string;
  jobTitle?: string;
  dept?: string;
  departmentId?: string | null;
  employeeNumber?: string;
  reportingTo?: string;
  reportingManager?: string;
  hasAvatar?: boolean;
  resigned?: boolean;
  status?: string;
  extra?: Record<string, unknown>;
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function slim(raw: Record<string, unknown>, keep: readonly string[]): PickPerson {
  const extra: Record<string, unknown> = {};
  for (const k of keep) {
    const v = raw[k];
    // Never a long string (an embedded file) and never bank details, whatever is asked for.
    if (v === undefined || /bank/i.test(k) || (typeof v === 'string' && v.length > 500)) continue;
    extra[k] = v;
  }
  return {
    id: String(raw.id ?? ''),
    name: str(raw.name) || 'Unnamed',
    role: str(raw.role) || undefined,
    jobTitle: str(raw.jobTitle) || str(raw.designation) || undefined,
    dept: str(raw.deptName) || str(raw.dept) || undefined,
    departmentId: typeof raw.departmentId === 'string' ? raw.departmentId : null,
    employeeNumber: str(raw.employeeNumber) || str(raw.kekaCode) || undefined,
    reportingTo: str(raw.reportingTo) || undefined,
    reportingManager: str(raw.reportingManager) || undefined,
    hasAvatar: !!raw.hasAvatar,
    resigned: raw.resigned === true || raw.resigned === 'true',
    status: str(raw.status) || undefined,
    ...(keep.length ? { extra } : null),
  };
}

/**
 * The company's people for a picker: GET /users (routes/users.js:108, tenant-scoped, avatars already
 * stripped), slimmed to PickPerson and without people who resigned or are inactive. `keep` adds named
 * raw fields under `extra` (e.g. ['professionalType', 'professionalAvailable', 'location']); with
 * `keep` the result is kept off the phone's disk.
 */
export function usePickablePeople(opts: { enabled?: boolean; keep?: readonly string[]; includeLeft?: boolean } = {}) {
  const userId = useSession((s) => s.user?.id);
  const keep = Array.isArray(opts.keep) ? [...opts.keep].sort() : [];
  return useQuery({
    queryKey: ['shared', 'people', userId ?? '', keep.join(','), opts.includeLeft ? 'all' : 'active'],
    enabled: (opts.enabled ?? true) && !!userId,
    ...(keep.length ? { meta: { persist: false } } : null),
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<Record<string, unknown>[]>('/users', signal));
      if (!Array.isArray(r)) throw new Error('The people list could not be loaded.');
      return r
        .filter((u) => !!u && typeof u === 'object' && u.id != null)
        .map((u) => slim(u, keep))
        .filter((p) => opts.includeLeft || (!p.resigned && (!p.status || p.status === 'active')))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 10 * 60_000,
  });
}

// ── Recent picks (this session only, per recentKey) ──────────────────────────
let recent: Record<string, string[]> = {};
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const readRecent = () => recent;
function remember(key: string | undefined, id: string) {
  if (!key || !id) return;
  recent = { ...recent, [key]: [id, ...(recent[key] ?? []).filter((x) => x !== id)].slice(0, 6) };
  listeners.forEach((fn) => fn());
}

// ── The sheet ────────────────────────────────────────────────────────────────
function PersonRow({ p, onLeave, selected, blocked, onPress }: { p: PickPerson; onLeave: boolean; selected: boolean; blocked: boolean; onPress: () => void }) {
  const photo = usePersonPhoto(p);
  const sub = [p.jobTitle, p.dept].filter(Boolean).join(' · ');
  return (
    <ListRow
      left={<Avatar name={p.name} uri={photo} size={40} ring={false} />}
      title={p.name}
      subtitle={sub || undefined}
      below={onLeave ? <StatusPill label="On leave" tone="pending" /> : undefined}
      right={selected ? <Check size={18} color={palette.primaryText} /> : undefined}
      onPress={blocked ? undefined : onPress}
      disabled={blocked}
      accessibilityLabel={[p.name, sub, onLeave ? 'on leave' : '', selected ? 'chosen' : ''].filter(Boolean).join(', ')}
      accessibilityHint={blocked ? 'On leave that day, so they can’t be chosen' : undefined}
    />
  );
}

export function PersonPicker({
  visible,
  onClose,
  onPick,
  people,
  loading,
  title = 'Choose a person',
  subtitle,
  selectedId,
  filter,
  date,
  allowOnLeave = false,
  recentKey,
  placeholder = 'Search name, employee number or team',
  emptyMessage = 'No one here matches.',
}: {
  visible: boolean;
  onClose: () => void;
  /** Called with the person; the sheet closes itself. */
  onPick: (p: PickPerson) => void;
  people: PickPerson[] | undefined;
  loading?: boolean;
  title?: string;
  subtitle?: string;
  selectedId?: string | null;
  /** Who may be picked at all (the web's own candidate rule). */
  filter?: (p: PickPerson) => boolean;
  /** 'YYYY-MM-DD' (IST): people off that day show "On leave". Default today. */
  date?: string;
  /** Let people on leave be picked anyway (their pill still shows). */
  allowOnLeave?: boolean;
  /** Remember picks under this key for the recent tiles (this session). */
  recentKey?: string;
  placeholder?: string;
  emptyMessage?: string;
}) {
  const [q, setQ] = useState('');
  const recentAll = useSyncExternalStore(subscribe, readRecent, readRecent);
  // GET /leaves holds this week to 60 days ahead (api/people useLeaveDays); only read while open.
  const leave = useLeaveDays(visible);
  const today = useTodayIst();
  const day = date || today;
  const offIds = new Set<string>();
  const offNames = new Set<string>();
  for (const l of Array.isArray(leave.data) ? leave.data : []) {
    if (l.date !== day || l.half) continue;
    if (l.employeeId) offIds.add(l.employeeId);
    else if (l.employee) offNames.add(l.employee.toLowerCase());
  }
  const isOff = (p: PickPerson) => offIds.has(p.id) || offNames.has(p.name.toLowerCase());

  const pool = (Array.isArray(people) ? people : []).filter((p) => !!p && !!p.id && (!filter || filter(p)));
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? pool
        .filter((p) => [p.name, p.employeeNumber, p.jobTitle, p.dept].some((v) => typeof v === 'string' && v.toLowerCase().includes(needle)))
        .slice(0, 60)
    : pool.slice(0, 60);
  const recentPeople = (recentKey ? recentAll[recentKey] ?? [] : []).map((id) => pool.find((p) => p.id === id)).filter((p): p is PickPerson => !!p);

  const pick = (p: PickPerson) => {
    remember(recentKey, p.id);
    onPick(p);
    setQ('');
    onClose();
  };
  const tiles: AvatarTileItem[] = recentPeople.map((p) => ({
    key: p.id,
    name: p.name,
    sub: isOff(p) ? 'On leave' : p.jobTitle,
    dot: isOff(p) ? 'pending' : null,
    onPress: isOff(p) && !allowOnLeave ? undefined : () => pick(p),
    accessibilityLabel: `${p.name}${isOff(p) ? ', on leave' : ''}`,
  }));

  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <TextField
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search people"
        left={<Search size={18} color={palette.textMuted} />}
      />
      {!needle && tiles.length ? (
        <View style={styles.recent}>
          <Text variant="labelStrong" muted>
            Recent
          </Text>
          <AvatarTiles items={tiles} bleed="none" accessibilityLabel="Recent picks" />
        </View>
      ) : null}
      {loading && !pool.length ? (
        <Text variant="label" muted>
          Loading people…
        </Text>
      ) : !matches.length ? (
        <View style={styles.none}>
          <SearchX size={22} color={palette.textMuted} strokeWidth={1.8} />
          <Text variant="label" muted align="center">
            {needle ? `Nothing matches “${q.trim()}”.` : emptyMessage}
          </Text>
        </View>
      ) : (
        <ListCard tone="surface">
          {matches.map((p) => {
            const off = isOff(p);
            return <PersonRow key={p.id} p={p} onLeave={off} selected={p.id === selectedId} blocked={off && !allowOnLeave} onPress={() => pick(p)} />;
          })}
        </ListCard>
      )}
      {!needle && pool.length > matches.length ? (
        <Text variant="caption" muted align="center">
          Type to search all {pool.length} people.
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  recent: { gap: space.xs },
  none: { alignItems: 'center', gap: space.xs, paddingVertical: space.md },
}));
