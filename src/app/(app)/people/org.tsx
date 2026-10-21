// Org chart — the web's Organization Tree (OrgTreeView, dash.html ~L9613) as a collapsible list:
// "From top" starts closed on the heads of the company and you walk down by tapping the number on
// a card; "From me" (or from a person opened from their profile) shows the reporting line above
// them and their own team under them. People with no manager on file and nobody under them are
// listed separately as "Not on the chart yet", as on the web.
//
// Payno chrome (docs/REFERENCE-COMPONENTS.md): NavHeader with the "•••" as a round frosted action,
// frosted person cards (the stronger frost, bright rim, soft wide shadow), the person a view is about
// on the brand fill, and an open team's count in the brand fill too.
//
// Fit: indentation is capped (4 levels × 12 dp on compact screens, 5 × 16 otherwise) so a deep
// branch never squeezes a card's name below ~120 dp at 360 dp; the count toggle never shrinks.
// "Expand all" and "Collapse all" live in the header's "•••" menu, each enabled only when it would
// change a card on screen.
// Targets: the count toggles are 48 dp boxes holding a smaller pill, so the whole 48 dp is the
// layout box.

import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, ChevronUp, MoreHorizontal, Network } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { personTitle, useOrgTree } from '@/features/people/directory';
import { chainTo, type OrgNode, type OrgTree } from '@/features/people/org-tree';
import { PersonAvatar } from '@/features/people/person-ui';
import { firstName } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space, statusTone } from '@/theme/tokens';
import {
  EmptyState,
  ErrorState,
  frostSurface,
  haptic,
  type MenuItem,
  MenuSheet,
  NavHeader,
  PressableScale,
  Screen,
  Segmented,
  Skeleton,
  Text,
  useLayout,
  withAlpha,
} from '@/ui';
type Mode = 'top' | 'me' | 'focus';

type NodeRow = { kind: 'node'; key: string; node: OrgNode; depth: number; count: number; open: boolean; toggleable: boolean; highlight: boolean };
type HeadRow = { kind: 'head'; key: string; title: string; count: number; sub: string; open: boolean };
type Row = NodeRow | HeadRow;

const kidsOf = (tree: OrgTree, id: string): OrgNode[] => {
  const k = tree.kids.get(id);
  return Array.isArray(k) ? k : [];
};

function pushBranch(out: Row[], tree: OrgTree, nodes: OrgNode[], depth: number, expanded: Set<string>) {
  for (const n of nodes) {
    const kids = kidsOf(tree, n.id);
    const open = expanded.has(n.id);
    out.push({ kind: 'node', key: n.id, node: n, depth, count: kids.length, open, toggleable: kids.length > 0, highlight: false });
    if (open && kids.length) pushBranch(out, tree, kids, depth + 1, expanded);
  }
}

function buildRows(tree: OrgTree, mode: Mode, target: string | null, expanded: Set<string>, lonersOpen: boolean): Row[] {
  const out: Row[] = [];
  const roots = Array.isArray(tree.roots) ? tree.roots : [];
  if (mode === 'top' || !target) {
    const top = roots.filter((r) => kidsOf(tree, r.id).length > 0);
    const loners = roots.filter((r) => kidsOf(tree, r.id).length === 0);
    pushBranch(out, tree, top, 0, expanded);
    if (loners.length) {
      out.push({
        kind: 'head',
        key: 'loners',
        title: 'Not on the chart yet',
        count: loners.length,
        sub: 'No manager on file',
        open: lonersOpen,
      });
      if (lonersOpen) pushBranch(out, tree, loners, 0, expanded);
    }
    return out;
  }
  const chain = chainTo(tree, target);
  chain.forEach((n, i) => {
    const kids = kidsOf(tree, n.id);
    const last = i === chain.length - 1;
    const open = last ? expanded.has(n.id) : true;
    out.push({ kind: 'node', key: n.id, node: n, depth: i, count: kids.length, open, toggleable: last && kids.length > 0, highlight: last });
    if (last && open && kids.length) pushBranch(out, tree, kids, i + 1, expanded);
  });
  return out;
}

// A short status line, for the roles that manage the roster; nothing for everyone else.
function noteFor(row: NodeRow, tree: OrgTree, full: boolean) {
  const u = row.node;
  if (!full) return '';
  if (u.ghost) return 'Not on the roster yet';
  if (tree.assumed.has(u.id)) return 'No manager on file';
  if (u.pending) return 'Not signed up yet';
  return '';
}

// Segment labels stay ≤ 10 characters so the control stays a segmented track (docs/DESIGN.md §7.7).
function shortName(name?: string) {
  const f = firstName(name) || 'Person';
  return f.length > 10 ? `${f.slice(0, 9)}…` : f;
}

export default function OrgChartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { compact } = useLayout();
  const params = useLocalSearchParams<{ focus?: string }>();
  const focus = String(Array.isArray(params.focus) ? params.focus[0] : params.focus || '') || null;
  const me = useSession((s) => s.user?.id) ?? null;
  const org = useOrgTree();
  const tree = org.tree;

  const meOnChart = !!me && tree.byId.has(me);
  const focusNode = focus ? tree.byId.get(focus) : undefined;
  const [mode, setMode] = useState<Mode>(focus ? (focus === me ? 'me' : 'focus') : 'top');
  // Everything starts closed, as on the web — except the person a "from me / from them" view is about.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(focus ? [focus] : []));
  const [lonersOpen, setLonersOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const indentStep = compact ? 12 : 16;
  const maxLevels = compact ? 4 : 5;

  // A mode whose person is not on the chart (yet — e.g. still loading) shows the chart from the top.
  const view: Mode = (mode === 'focus' && !focusNode) || (mode === 'me' && !meOnChart) ? 'top' : mode;
  const target = view === 'me' ? me : view === 'focus' ? focus : null;
  const rows = buildRows(tree, view, target, expanded, lonersOpen);
  // Worked out from the cards on screen (not the whole `expanded` set, which keeps branches opened in
  // another mode): "Expand all" while any card on screen is still closed, "Collapse all" while any card
  // other than the person the view is about is open.
  const canExpand = rows.some((r) => r.kind === 'node' && r.toggleable && !r.open);
  const canCollapse = rows.some((r) => r.kind === 'node' && r.toggleable && r.open && r.node.id !== target);

  const changeMode = (m: Mode) => {
    setMode(m);
    const who = m === 'me' ? me : m === 'focus' ? focus : null;
    if (who) setExpanded((s) => new Set(s).add(who));
  };
  const toggle = (id: string) => {
    haptic.select();
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const expandAll = () => setExpanded(new Set([...tree.kids.keys()].filter((k) => kidsOf(tree, k).length > 0)));
  const collapseAll = () => setExpanded(new Set(target ? [target] : []));
  const menu: MenuItem[] = [
    { key: 'expand', label: 'Expand all', icon: ChevronsUpDown, disabled: !canExpand, onPress: expandAll },
    { key: 'collapse', label: 'Collapse all', icon: ChevronsDownUp, disabled: !canCollapse, onPress: collapseAll },
  ];

  const refresh = async () => {
    setRefreshing(true);
    try {
      await org.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const segments = [
    { key: 'top' as Mode, label: 'From top' },
    ...(meOnChart ? [{ key: 'me' as Mode, label: 'From me' }] : []),
    ...(focusNode && focus !== me ? [{ key: 'focus' as Mode, label: shortName(focusNode.name) }] : []),
  ];

  const openPerson = (u: OrgNode) => {
    if (u.ghost) return;
    if (u.id === me) router.push('/profile');
    else router.push(`/people/${encodeURIComponent(u.id)}`);
  };

  const renderRow = (row: Row) => {
    if (row.kind === 'head') {
      return (
        <Pressable
          onPress={() => setLonersOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: row.open }}
          accessibilityLabel={`${row.title}: ${row.count} ${row.count === 1 ? 'person' : 'people'}. ${row.open ? 'Hide' : 'Show'} them`}
          style={({ pressed }) => [styles.head, pressed && { backgroundColor: palette.pressedTint }]}>
          <View style={styles.textCol}>
            <Text variant="bodyStrong" numberOfLines={2} style={styles.shrink}>
              {row.title}
            </Text>
            <Text variant="caption" muted style={styles.shrink}>
              {row.sub}
            </Text>
          </View>
          {/* The count is its own badge, so a long title can never truncate it away. */}
          <View style={styles.headCount}>
            <Text variant="micro" tabular maxFontSizeMultiplier={1.2} color={palette.text}>
              {row.count}
            </Text>
          </View>
          {row.open ? <ChevronUp size={18} color={palette.textMuted} style={styles.fixed} /> : <ChevronDown size={18} color={palette.textMuted} style={styles.fixed} />}
        </Pressable>
      );
    }
    const u = row.node;
    const level = Math.min(row.depth, maxLevels);
    const indent = level * indentStep;
    const note = noteFor(row, tree, org.full);
    const isMe = u.id === me;
    const on = row.highlight;
    // The name stays clean; "You" leads the second line, so truncation never hides the marker.
    const name = u.name || 'Unnamed';
    const jobTitle = personTitle(u);
    const title = isMe ? ['You', jobTitle].filter(Boolean).join(' · ') : jobTitle || '—';
    const noteColor = on ? palette.onPrimaryMuted : u.ghost || u.pending ? palette.warningInk : palette.textMuted;
    const countLabel = row.open ? `Hide ${row.count === 1 ? 'report' : 'reports'}` : `Show ${row.count} ${row.count === 1 ? 'report' : 'reports'}`;
    return (
      <View style={[styles.rowWrap, { paddingLeft: indent }]}>
        {row.depth > 0 ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.guide, { left: Math.max(0, indent - indentStep / 2) }]}
          />
        ) : null}
        <View style={[styles.card, compact && styles.cardCompact, on && styles.cardOn, u.ghost && org.full && styles.cardGhost]}>
          {/* The person and the count toggle are two separate buttons side by side (never one inside
              the other), so a screen reader reaches both and the web never nests <button>s. */}
          <PressableScale
            onPress={() => openPerson(u)}
            disabled={!!u.ghost}
            scaleTo={0.985}
            accessibilityRole={u.ghost ? undefined : 'button'}
            accessibilityLabel={[isMe ? `${name} (you)` : name, jobTitle, note].filter(Boolean).join(', ')}
            style={styles.cardMain}>
            <PersonAvatar person={u} size={40} />
            <View style={styles.textCol}>
              <Text variant="bodyStrong" numberOfLines={1} color={on ? palette.onPrimary : palette.text} style={styles.shrink}>
                {name}
              </Text>
              <Text variant="label" numberOfLines={1} color={on ? palette.onPrimaryMuted : palette.textMuted} style={styles.shrink}>
                {title}
              </Text>
              {note ? (
                <Text variant="caption" numberOfLines={1} color={noteColor} style={styles.shrink}>
                  {note}
                </Text>
              ) : null}
            </View>
          </PressableScale>
          {row.count > 0 ? (
            <Pressable
              onPress={row.toggleable ? () => toggle(u.id) : undefined}
              disabled={!row.toggleable}
              accessibilityRole="button"
              accessibilityState={{ expanded: row.open, disabled: !row.toggleable }}
              accessibilityLabel={row.toggleable ? countLabel : `${row.count} ${row.count === 1 ? 'report' : 'reports'}`}
              style={styles.countHit}>
              {({ pressed }) => (
                <View style={[styles.count, row.open && styles.countOpen, on && styles.countOnPrimary, pressed && row.toggleable && styles.countPressed]}>
                  <Text variant="labelStrong" tabular maxFontSizeMultiplier={1.2} color={row.open || on ? palette.onPrimary : palette.text}>
                    {row.count}
                  </Text>
                  {row.toggleable ? (
                    row.open ? (
                      <ChevronUp size={14} strokeWidth={2.2} color={palette.onPrimary} />
                    ) : (
                      <ChevronDown size={14} strokeWidth={2.2} color={on ? palette.onPrimary : palette.text} />
                    )
                  ) : null}
                </View>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  const header = (
    <NavHeader
      title="Org chart"
      actions={org.data && (canExpand || canCollapse) ? [{ key: 'more', icon: MoreHorizontal, label: 'More options', onPress: () => setMenuOpen(true) }] : undefined}
    />
  );

  return (
    <>
      <Screen scroll={false} header={header}>
        <View style={styles.tools}>
          {segments.length > 1 ? <Segmented options={segments} value={view} onChange={changeMode} /> : null}
          {org.data && tree.size ? (
            <Text variant="caption" muted tabular numberOfLines={2}>
              {tree.size} {tree.size === 1 ? 'person' : 'people'} · tap a number to see the team
            </Text>
          ) : null}
        </View>

        {/* isPending also covers restoring the saved cache on a cold start. */}
        {org.isPending ? (
          <View style={{ gap: space.xs }} accessibilityLabel="Loading" accessibilityRole="progressbar">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={64} radius={radius.lg} style={{ marginLeft: (i % 3) * indentStep, width: 'auto' }} />
            ))}
          </View>
        ) : org.isError && !org.data ? (
          <ErrorState message={org.error?.message ?? 'The org chart could not be loaded.'} onRetry={() => void org.refetch()} />
        ) : (
          <View style={{ flex: 1 }}>
            <FlashList
              data={rows}
              keyExtractor={(r) => r.key}
              getItemType={(r) => r.kind}
              extraData={expanded}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: space.xl + insets.bottom }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={palette.primaryText}
                  colors={[palette.primaryText]}
                  progressBackgroundColor={palette.surface}
                />
              }
              ListEmptyComponent={
                <EmptyState
                  icon={<Network color={palette.textMuted} strokeWidth={1.8} />}
                  title={view === 'top' ? 'No one on the chart yet' : 'Not on the org chart'}
                  message={view === 'top' ? 'It fills in once HR sets who reports to whom.' : 'No manager on file for this person.'}
                />
              }
              renderItem={({ item }) => renderRow(item)}
            />
          </View>
        )}
      </Screen>
      <MenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Org chart" items={menu} />
    </>
  );
}

const styles = themedStyles(() => ({
  tools: { gap: space.sm, paddingBottom: space.sm },
  fixed: { flexShrink: 0 },
  shrink: { flexShrink: 1 },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  rowWrap: { paddingVertical: space.xxs },
  guide: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: palette.separator },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    // 8 dp top and bottom keeps a card with the 48 dp count toggle at 64 dp.
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    // The stronger Payno frost (translucent white, bright rim, soft wide shadow; a light veil in dark).
    ...frostSurface('strong'),
  },
  cardMain: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardCompact: { paddingHorizontal: space.sm },
  cardOn: { backgroundColor: palette.primary, borderColor: withAlpha(palette.onPrimary, 0.1) },
  cardGhost: { backgroundColor: palette.warningSoft, borderColor: statusTone.pending.border },
  // The touch box is 48 × 48 (wider when the count is); the pill inside it is the visual.
  countHit: { flexShrink: 0, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 44,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: palette.track,
  },
  // An open team: the brand fill under white text (a module fg is a text colour, light in dark mode).
  countOpen: { backgroundColor: palette.primary },
  countOnPrimary: { backgroundColor: withAlpha(palette.onPrimary, 0.16) },
  countPressed: { opacity: 0.75 },
  headCount: {
    flexShrink: 0,
    minWidth: 24,
    minHeight: 24,
    paddingHorizontal: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: palette.track,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    marginBottom: space.xxs,
    minHeight: 56,
    padding: space.md,
    borderRadius: radius.lg,
    // A quieter fill than the person cards, so the group header reads as a header.
    ...frostSurface('frost'),
  },
}));
