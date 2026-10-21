// Project code picker (web: ProjectSearch; the web calls these Keka Codes). Only active codes are
// offered, and — as on the web — the full list is never shown unfiltered: there are hundreds of
// codes. Before anything is typed the sheet shows the caller's `recent` codes (e.g. the ones on the
// person's last claims), so the usual pick is one tap. Also used by Support's request forms.
//
// The field matches the kit's Select / Date fields (52 dp, radius 16, error and hint lines under it);
// inside a Sheet it switches to the solid fill like every other field. `variant="row"` shows the
// choice as a Payno AccountRow instead ("TM_INT_REEL26 · Reel shoot  [Change]"), for the money forms.

import { BriefcaseBusiness, Check, ChevronDown, Search, SearchX, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { activeProjects, type Project } from '@/api/reimbursements';
import { type ModuleKey, palette, radius, space, statusTone } from '@/theme/tokens';
import { AccountRow, FieldMessage, haptic, hitSlopFor, isDarkScheme, Sheet, Skeleton, Text, TextField, useSurface, withAlpha } from '@/ui';

import { themedStyles } from '@/theme/themed';
export const projectLabel = (p?: Project | null) => (p ? (p.kekaCode ? `${p.kekaCode} — ${p.name || ''}` : p.name || '') : '');

const CLEAR = 32;

export function ProjectPicker({
  label = 'Project code',
  value,
  onChange,
  projects,
  loading,
  error,
  hint,
  placeholder = 'Search project code or name',
  recent,
  variant = 'field',
  module = 'expenses',
}: {
  label?: string;
  value: Project | null;
  onChange: (p: Project | null) => void;
  projects: Project[] | undefined;
  loading?: boolean;
  error?: string | null;
  hint?: string | null;
  placeholder?: string;
  /** Codes to offer before anything is typed (newest first). Inactive ones are dropped. */
  recent?: Project[];
  /** 'field' (default): a select field. 'row': a frosted AccountRow with a "Change" pill. */
  variant?: 'field' | 'row';
  /** The module colour of the row's icon (variant 'row'). */
  module?: ModuleKey;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const surface = useSurface();
  const live = activeProjects(Array.isArray(projects) ? projects : []);
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? live
        .filter((p) => String(p.kekaCode || '').toLowerCase().includes(needle) || String(p.name || '').toLowerCase().includes(needle))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .slice(0, 60)
    : [];
  const recentLive = activeProjects(Array.isArray(recent) ? recent : []).slice(0, 5);
  const shown = value ? projectLabel(value) : '';
  const notLoaded = 'No project codes loaded. Reopen this screen to try again.';
  const openSheet = () => {
    setQ('');
    setOpen(true);
  };

  const option = (p: Project) => {
    const on = value?.id === p.id;
    return (
      <Pressable
        key={p.id}
        onPress={() => {
          if (!on) haptic.select();
          onChange(p);
          setOpen(false);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={projectLabel(p) || p.name || 'Project code'}
        style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { backgroundColor: palette.surfaceMuted }]}>
        <View style={styles.optionName}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {p.name || '—'}
          </Text>
          {p.kekaCode ? (
            <Text variant="caption" color={palette.primaryText} numberOfLines={1}>
              {p.kekaCode}
            </Text>
          ) : null}
        </View>
        {on ? <Check size={18} color={palette.primaryText} style={{ flexShrink: 0 }} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="labelStrong" muted numberOfLines={2}>
          {label}
        </Text>
      ) : null}
      {variant === 'row' ? (
        <AccountRow
          icon={BriefcaseBusiness}
          module={module}
          title={value ? value.kekaCode || value.name || 'Project code' : 'Choose a project code'}
          sub={value ? (value.kekaCode ? value.name || null : null) : 'Search by code or project name'}
          actionLabel={value ? 'Change' : 'Choose'}
          accessibilityLabel={`${label ? `${label}: ` : ''}${shown || 'none chosen'}`}
          hint={value ? 'Change the project code' : 'Choose a project code'}
          onPress={openSheet}
          style={!!error && styles.rowError}
        />
      ) : (
      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={`${label ? `${label}: ` : ''}${shown || placeholder}`}
        style={({ pressed }) => [
          styles.field,
          surface === 'sheet' && { backgroundColor: palette.surfaceMuted },
          pressed && { backgroundColor: palette.surface },
          !!error && styles.fieldError,
        ]}>
        <Text variant="body" color={value ? palette.text : palette.textFaint} numberOfLines={1} style={styles.value}>
          {shown || placeholder}
        </Text>
        {value ? (
          <Pressable
            hitSlop={hitSlopFor(CLEAR)}
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityLabel="Clear project code"
            style={({ pressed }) => [styles.clear, pressed && { backgroundColor: palette.surfaceMuted }]}>
            <X size={16} color={palette.textMuted} strokeWidth={2.2} />
          </Pressable>
        ) : (
          <ChevronDown size={18} color={palette.textMuted} />
        )}
      </Pressable>
      )}
      <FieldMessage error={error} hint={hint} />

      <Sheet visible={open} onClose={() => setOpen(false)} title="Project code" subtitle="Type a code or project name">
        <TextField
          value={q}
          onChangeText={setQ}
          placeholder={placeholder}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search project codes"
          left={<Search size={18} color={palette.textMuted} />}
        />
        {!needle ? (
          loading ? (
            <View style={{ gap: space.xs }} accessibilityLabel="Loading project codes" accessibilityRole="progressbar">
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={48} />
            </View>
          ) : (
            <>
              {recentLive.length ? (
                <View style={{ gap: 2 }}>
                  <Text variant="labelStrong" muted style={styles.recentLabel}>
                    Recent
                  </Text>
                  {recentLive.map(option)}
                </View>
              ) : null}
              <Text variant="label" muted>
                {live.length ? `Type to search ${live.length} project code${live.length === 1 ? '' : 's'}.` : notLoaded}
              </Text>
            </>
          )
        ) : !matches.length ? (
          <View style={styles.none}>
            <SearchX size={22} color={palette.textMuted} strokeWidth={1.8} />
            <Text variant="label" muted align="center">
              {live.length ? `Nothing matches “${q.trim()}”.` : notLoaded}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 2 }}>
            {matches.map(option)}
          </View>
        )}
      </Sheet>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 52,
    paddingLeft: space.md,
    paddingRight: space.sm,
    borderRadius: radius.md,
    backgroundColor: isDarkScheme() ? palette.frostStrong : withAlpha(palette.surface, 0.7),
    borderWidth: 1,
    borderColor: withAlpha(palette.ink, 0.07),
  },
  fieldError: { borderWidth: 1.5, borderColor: palette.dangerInk },
  rowError: { borderWidth: 1.5, borderColor: palette.dangerInk },
  value: { flex: 1, minWidth: 0 },
  clear: {
    width: CLEAR,
    height: CLEAR,
    borderRadius: CLEAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  none: { alignItems: 'center', gap: space.xs, paddingVertical: space.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 56,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
    marginBottom: space.xs,
  },
  optionOn: { backgroundColor: palette.primarySoft, borderColor: statusTone.info.border },
  optionName: { flex: 1, minWidth: 0 },
  recentLabel: { paddingHorizontal: space.sm, paddingBottom: space.xxs },
}));
