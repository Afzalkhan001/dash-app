// "Needs you" on Home: at most three things waiting on the signed-in person —
//   1. task start / end codes they have to read out (a code lives 10 minutes), soonest to expire first;
//   2. then the Inbox's own list, in the Inbox's own order (visitors at reception first, then requests
//      newest first), so these rows are the first ones "See all" shows;
//   3. then, if there is room, the Inbox's "N policies to read" row (same words, opens Policies).
// The Inbox rows come straight from useInboxSummary().items: same queries, same gates, same links,
// and the same words (the Inbox's own itemRow(), so a request reads identically in both places). A
// queue the summary counts but cannot list still counts: it becomes one "N more waiting" row. Rows
// carry no buttons — tapping opens the item's own screen (Approve / Reject, or Let in / Turn away, live
// there in a sticky bar); a code row is the thing itself, so it is not a link.
// Drawn as the Payno "recent transactions" list (kit ActivityList / ActivityRow, docs/REFERENCE-
// COMPONENTS.md item 8): the kit SectionHeader "Needs you" with a muted "See all" link (→ Inbox) over
// one frosted card with hairlines;
// rows of a 40 dp avatar or badge, the title over a muted line, and the figure over how long ago on
// the right. Below 360 dp or with large text the code moves under its words, so neither is squeezed.
// Colour: every row carries its module's colour (theme/tokens moduleTone) — a tinted badge for codes
// and policies, and a small kind badge on a request's avatar (leave green, money gold / coral,
// visitors teal…), so the kind of each row reads at a glance. In dark mode those tints are the dark
// ones from theme/dark (read at render time), and brand-coloured icons use primaryText.
//
// Home renders the card only when useNeedsYou().rows has something in it.

import { type Href, useIsFocused, useRouter } from 'expo-router';
import { Inbox, KeyRound, ScrollText } from 'lucide-react-native';
import { View } from 'react-native';

import { type PendingOtp, usePendingOtps } from '@/api/tasks';
import { type InboxItem, itemRow, type LeaveNames } from '@/features/inbox/format';
import { itemLook } from '@/features/inbox/kind-look';
import { useLeaveNames } from '@/features/inbox/leave-names';
import { useInboxSummary } from '@/features/inbox/use-inbox';
import { usePolicyPendingCount } from '@/features/policies/use-policy-actions';
import { useNow } from '@/features/tasks/live-timer';
import { nameWords } from '@/features/visitors/format';
import { istParts } from '@/lib/dates';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { font, moduleTone, palette, space } from '@/theme/tokens';
import { ActivityList, ActivityRow, Avatar, ModuleBadge, shouldStack, Text, useLayout } from '@/ui';

const MAX_ROWS = 3;

export type NeedsYouRow =
  | { type: 'code'; key: string; otp: PendingOtp }
  | { type: 'item'; key: string; item: InboxItem }
  | { type: 'policies'; key: string; count: number }
  | { type: 'more'; key: string; count: number };

export type NeedsYou = {
  /** At most 3 rows, most urgent first. Empty means "render nothing". */
  rows: NeedsYouRow[];
  /** Everything waiting in the Inbox (approvals + visitors). "See all" shows only when > 0. */
  inboxTotal: number;
  /** The clock the rows were built with (code expiry, "2h ago"). */
  now: number;
};

export function useNeedsYou(): NeedsYou {
  const focused = useIsFocused();
  const summary = useInboxSummary();
  // Already gated, filtered and sorted exactly as the Inbox lists them.
  const items = (Array.isArray(summary.items) ? summary.items : []).filter((it) => !!it && !!it.key);

  // Codes poll every 20 s while Home is in front.
  const otpQ = usePendingOtps({ poll: focused });
  const otpList = Array.isArray(otpQ.data) ? otpQ.data : [];

  // Waiting in a queue the Inbox counts but has no row for: one row that says so.
  const inboxTotal = Number.isFinite(summary.total) ? summary.total : 0;
  const unknown = inboxTotal - items.length;

  // Policies waiting for my acknowledgement (0 when Policies is off) — the Inbox shows them as one row.
  const toRead = usePolicyPendingCount();

  // The clock only ticks while Home is in front and something is shown: every 15 s while a code is
  // counting down (so an expired one drops off), otherwise once a minute for the "2h ago" labels.
  const hasCodes = otpList.length > 0;
  const now = useNow(focused && (hasCodes || items.length > 0), hasCodes ? 15_000 : 60_000);

  const codes: NeedsYouRow[] = otpList
    .filter((p) => !!p && !!p.otp && Number(p.otp.expiresAt) > now)
    .sort((a, b) => Number(a.otp.expiresAt) - Number(b.otp.expiresAt))
    .map((p, i) => ({ type: 'code', key: `code-${p.key ?? i}`, otp: p }));
  const waiting: NeedsYouRow[] = items.map((item) => ({ type: 'item', key: `item-${item.key}`, item }));

  const rows: NeedsYouRow[] = [...codes, ...waiting].slice(0, MAX_ROWS);
  if (toRead > 0 && rows.length < MAX_ROWS) rows.push({ type: 'policies', key: 'policies', count: toRead });
  if (unknown > 0 && rows.length < MAX_ROWS) rows.push({ type: 'more', key: 'more', count: unknown });

  return { rows, inboxTotal, now };
}

// ── Rows ─────────────────────────────────────────────────────────────────────
function CodeRow({ p, now }: { p: PendingOtp; now: number }) {
  // With large text, or below 360 dp, the code goes under its words (like ActivityRow's right
  // column), so the 6 big digits never squeeze "Start code for …" into a sliver: at 120 % text on a
  // 360 dp phone the side-by-side code leaves the words about 120 dp.
  const stacked = shouldStack(useLayout(), { below: 'narrow' });
  const code = String(p.otp?.code ?? '');
  const minsLeft = Math.max(1, Math.round((Number(p.otp?.expiresAt) - now) / 60000));
  const who = p.assignee && p.assignee !== '—' ? p.assignee : 'them';
  const what = p.otp?.type === 'start' ? 'Start code' : 'End code';
  // Minutes as the rest of the app writes them ("8m", like the Inbox's "5m ago"); spoken in full.
  const left = `${minsLeft}m left`;
  const spoken = `${plural(minsLeft, 'minute')} left`;
  const figure = (
    <View style={stacked ? styles.codeBelow : styles.codeRight}>
      <Text style={[styles.code, stacked && styles.shrink]} tabular numberOfLines={1} maxFontSizeMultiplier={1.15} selectable>
        {code}
      </Text>
      <Text variant="caption" color={palette.warningInk} numberOfLines={1} style={stacked ? styles.shrink : undefined}>
        {left}
      </Text>
    </View>
  );
  return (
    <View
      style={styles.codeRow}
      accessible
      accessibilityLabel={`${what} for ${who}${p.title ? `, ${p.title}` : ''}: ${code.split('').join(' ')}. ${spoken}. Read it out to them.`}>
      <ModuleBadge module="tasks" icon={KeyRound} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.shrink}>
          {what} for {who}
        </Text>
        <Text variant="label" muted numberOfLines={2} style={styles.shrink}>
          {p.title || 'Read it out to them'}
        </Text>
        {stacked ? figure : null}
      </View>
      {stacked ? null : figure}
    </View>
  );
}

// Anything from the Inbox, worded exactly as the Inbox list words it (itemRow): who, "when · what",
// the figure and how long ago, so "See all" opens on the very same rows.
function ItemRow({ item, now, today, names, open }: { item: InboxItem; now: number; today: string; names: LeaveNames; open: (href: Href) => void }) {
  const m = itemRow(item, today, now, names);
  // The right column is a figure, not a sentence: "Tue, 13 Oct" rather than the hero's "on Tue, 13 Oct".
  const age = m.age ? m.age.replace(/^on /, '') : '';
  // A visitor's name can carry a note ("Manoj (Blue Dart)"); the initials come from the name only.
  const avatar = item.kind === 'visitors' ? nameWords(item.who).join(' ') : item.who;
  // The kind's badge is the Inbox's own (kind-look: same icon and module colour as its row there); a
  // domain plug-in's item carries its own look (features/plugin-types).
  const badge = itemLook(item);
  return (
    <ActivityRow
      left={
        <View>
          <Avatar name={avatar} size={40} ring={false} />
          {badge ? <ModuleBadge module={badge.module} icon={badge.icon} size={22} style={styles.kindBadge} /> : null}
        </View>
      }
      title={m.title}
      subtitle={m.subtitle}
      value={m.value}
      meta={age || undefined}
      chevron
      onPress={() => open(item.href as Href)}
      accessibilityLabel={[m.title, m.subtitle, m.value, m.age].filter(Boolean).join(', ')}
    />
  );
}

function Row({ row, now, today, names, open }: { row: NeedsYouRow; now: number; today: string; names: LeaveNames; open: (href: Href) => void }) {
  switch (row.type) {
    case 'code':
      return <CodeRow p={row.otp} now={now} />;
    case 'item':
      return <ItemRow item={row.item} now={now} today={today} names={names} open={open} />;
    case 'policies': {
      const line = `${plural(row.count, 'policy', 'policies')} to read`;
      return (
        <ActivityRow
          module="policies"
          icon={ScrollText}
          title={line}
          subtitle="Read and confirm"
          chevron
          onPress={() => open('/policies')}
          accessibilityLabel={`${line}. Opens Policies`}
        />
      );
    }
    case 'more': {
      const line = `${plural(row.count, 'more request')} waiting`;
      return (
        <ActivityRow
          left={
            <View style={styles.inboxBadge}>
              <Inbox size={20} color={palette.primaryText} strokeWidth={2} />
            </View>
          }
          title={line}
          subtitle="In your inbox"
          chevron
          onPress={() => open('/inbox')}
        />
      );
    }
  }
}

/** The section itself. Pass useNeedsYou()'s result; render it only when `rows` is not empty. */
export function NeedsYouCard({ data }: { data: NeedsYou }) {
  const router = useRouter();
  const names = useLeaveNames();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (!rows.length) return null;
  const today = istParts(new Date(data.now)).date;
  const open = (href: Href) => router.push(href);
  return (
    <ActivityList
      title="Needs you"
      onSeeAll={data.inboxTotal > 0 ? () => open('/inbox') : undefined}
      seeAllAccessibilityLabel={`See all ${data.inboxTotal} waiting in your inbox`}>
      {rows.map((row) => (
        <Row key={row.key} row={row} now={data.now} today={today} names={names} open={open} />
      ))}
    </ActivityList>
  );
}

const styles = themedStyles(() => ({
  // Same frame as an ActivityRow (72 high, 16 / 12 padding), so the card's rows line up.
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 72, paddingVertical: space.sm, paddingHorizontal: space.md },
  text: { flex: 1, minWidth: 0, gap: 2 },
  shrink: { flexShrink: 1 },
  codeRight: { flexShrink: 0, alignItems: 'flex-end', gap: 2 },
  codeBelow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.xs, rowGap: 2, marginTop: space.xxs },
  // The code is what gets read out: big, tabular, spaced so the digits are easy to call out (in the
  // Tasks colour, like its badge).
  code: { fontFamily: font.medium, fontSize: 24, lineHeight: 30, letterSpacing: 2, color: moduleTone.tasks.fg },
  // The kind badge sits on the avatar's bottom-right edge, ringed in the card's white so it reads on any photo.
  kindBadge: { position: 'absolute', right: -5, bottom: -5, borderWidth: 2, borderColor: palette.surface },
  // "N more waiting": the Inbox's own brand tint (the same tinted disc as a ModuleBadge).
  inboxBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
}));
