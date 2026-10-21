// Bounty building blocks: the coins hero (Payno SummaryHero), a task row and list (ActivityRow /
// ActivityList), my bounty tasks as Lendora MetricRows, the "not started" and "monthly limit" notices,
// the leaderboard (RankSlider hero, podium, rows) and coin-history rows. Screens in app/(app)/bounty
// compose these. Rows follow the kit's fit rules (docs/DESIGN.md §9): one flex text column with
// minWidth 0, trailing items that never shrink, and figures that shrink instead of wrapping.

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Coins, Crown, FileText, Image as ImageIcon, Link2, type LucideIcon, Timer, Trophy, Video } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { BountyCapStatus, BountyClaimReminder, BountyLeaderRow, BountySubmissionType, BountyTask, BountyTxn } from '@/api/bounty';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { firstName } from '@/lib/format';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Avatar,
  Banner,
  Card,
  IconBadge,
  MetricRow,
  RankSlider,
  Skeleton,
  SkeletonList,
  SummaryHero,
  type SummaryHeroInfo,
  Text,
  useLayout,
} from '@/ui';

import { CoinStats } from './atoms';
import {
  asArray,
  claimReward,
  claimsOf,
  claimStatusMeta,
  claimTimeLeft,
  coins,
  dateTimeLabel,
  headlineReward,
  myClaimOf,
  num,
  shortDayLabel,
  submissionTypeOf,
  taskExpired,
  taskStatusMeta,
  txnBalance,
  txnDirection,
  txnLabel,
} from './logic';
import { useLazyAvatar } from './use-avatar';

import { themedStyles } from '@/theme/themed';
export const SUBMISSION_ICON: Record<BountySubmissionType, LucideIcon> = {
  text: FileText,
  link: Link2,
  image: ImageIcon,
  video: Video,
  document: FileText,
};

// ── Coin amount pill ─────────────────────────────────────────────────────────
// Green ink on a soft green fill (never white on green). Never shrinks: it sits at the end of a row.
export function CoinBadge({ amount, large }: { amount: number; large?: boolean }) {
  const label = coins(amount);
  return (
    <View style={[styles.coin, large && styles.coinLarge]} accessible accessibilityLabel={`${label} coins`}>
      <Coins size={large ? 16 : 14} color={palette.successInk} strokeWidth={2.2} />
      <Text variant={large ? 'bodyStrong' : 'labelStrong'} color={palette.successInk} tabular numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

// ── Coins hero ───────────────────────────────────────────────────────────────
/**
 * The light Payno hero: coins I can use as the big figure, an info chip (earned this month), one muted
 * line, the round corner arrow (→ My coins) and, on My coins, the earned / used figures under it.
 */
export function BountyCoinsHero({
  redeemable,
  caption,
  info,
  stats,
  onArrowPress,
  arrowLabel,
  action,
}: {
  redeemable: number;
  caption?: string;
  info?: SummaryHeroInfo;
  stats?: { label: string; value: string }[];
  onArrowPress?: () => void;
  arrowLabel?: string;
  action?: ReactNode;
}) {
  const list = asArray<{ label: string; value: string }>(stats);
  return (
    <SummaryHero
      icon={Coins}
      module="bounty"
      label="Coins you can use"
      value={Math.max(0, num(redeemable))}
      unit="coins"
      info={info}
      sub={caption}
      onArrowPress={onArrowPress}
      arrowLabel={arrowLabel}>
      {list.length || action ? (
        <View style={styles.heroFoot}>
          {list.length ? <CoinStats items={list} /> : null}
          {action}
        </View>
      ) : null}
    </SummaryHero>
  );
}

/** Loading placeholder with the coins hero's shape. */
export function BountyCoinsHeroSkeleton() {
  return <Skeleton height={196} radius={radius.xxl} />;
}

// ── Task row ─────────────────────────────────────────────────────────────────
/** What a task row says: its title, status, the deadline / spots line and the reward. */
function taskFacts(task: BountyTask, userId: string | null | undefined, today: string) {
  const mine = myClaimOf(task, userId);
  const expired = taskExpired(task, today);
  const open = task.status === 'open' && !task.cancelledAt && !expired;
  const reward = num(mine ? claimReward(task, mine) : headlineReward(task));
  const cap = num(task.maxAccepts);
  const left = cap ? Math.max(0, cap - claimsOf(task).length) : null;
  const due = task.deadline ? `${expired ? 'Closed' : 'Due'} ${shortDayLabel(task.deadline, today)}` : 'No deadline';
  const spots = open && !mine && left != null ? (left ? `${left} ${left === 1 ? 'spot' : 'spots'} left` : 'Full') : null;
  // Plain open tasks need no pill: the green reward already says "you can earn this".
  const status = mine ? claimStatusMeta(task, mine) : open ? null : taskStatusMeta(task, today);
  return { mine, reward, status, line: [due, spots].filter(Boolean).join(' · '), title: task.title || 'Untitled task', icon: SUBMISSION_ICON[submissionTypeOf(task)] ?? FileText };
}

/**
 * One task in a list (Payno transaction row): what it is (2 lines), the deadline / spots left, and on
 * the right the reward in green over my status or why it is closed. Put rows in a <BountyTaskList>.
 */
export function BountyTaskRow({
  task,
  userId,
  today,
  onPress,
}: {
  task: BountyTask;
  userId?: string | null;
  /** Today's IST date (useTodayIst()); keeps render pure and flips "Closed" at midnight. */
  today: string;
  onPress?: () => void;
}) {
  const f = taskFacts(task, userId, today);
  return (
    <ActivityRow
      module="bounty"
      icon={f.icon}
      title={f.title}
      subtitle={f.line}
      value={coins(f.reward)}
      valueColor={palette.successInk}
      meta="coins"
      status={f.status}
      onPress={onPress}
      accessibilityLabel={[f.title, `${coins(f.reward)} coins`, f.status?.label, f.line].filter(Boolean).join(', ')}
    />
  );
}

/** Tasks in one ActivityList (an optional title with "See all" or one control on the right). */
export function BountyTaskList({
  tasks,
  userId,
  today,
  onOpen,
  title,
  onSeeAll,
  right,
}: {
  tasks: BountyTask[];
  userId?: string | null;
  today: string;
  onOpen: (t: BountyTask) => void;
  title?: string;
  onSeeAll?: () => void;
  right?: ReactNode;
}) {
  return (
    <ActivityList title={title} onSeeAll={onSeeAll} seeAllAccessibilityLabel={title ? `See all, ${title}` : undefined} right={right}>
      {asArray<BountyTask>(tasks).map((t) => (
        <BountyTaskRow key={t.id} task={t} userId={userId} today={today} onPress={() => onOpen(t)} />
      ))}
    </ActivityList>
  );
}

export function BountyTaskListSkeleton({ count = 3 }: { count?: number }) {
  return <SkeletonList rows={count} avatar />;
}

/**
 * A task I joined as a Lendora MetricRow: the title, my reward as the light figure ("500 coins"), my
 * status as a soft pill, and the deadline (or what comes next) under the title.
 */
export function BountyClaimMetricRow({ task, userId, today, onPress }: { task: BountyTask; userId?: string | null; today: string; onPress?: () => void }) {
  const f = taskFacts(task, userId, today);
  return (
    <MetricRow
      module="bounty"
      label={f.title}
      value={f.reward}
      unit="coins"
      sub={f.line}
      status={f.status}
      onPress={onPress}
      hint="Opens the task"
    />
  );
}

// ── "You accepted a task and haven't started it" (GET /bounty_tasks/my_claims) ──
/**
 * One warning notice. With one task it opens that task; with several it carries no button, because
 * the way to them ("My bounty tasks") is already on the screen. Hidden when there is nothing to remind
 * about.
 */
export function BountyClaimReminderCard({ items }: { items: BountyClaimReminder[] }) {
  const router = useRouter();
  // Ticks every minute, so the countdown stays current without impure renders.
  const now = useNow();
  const list = asArray<BountyClaimReminder>(items).filter((t) => !!t && !!t.id);
  if (!list.length) return null;
  const one = list.length === 1 ? list[0]! : null;
  const soonest = list
    .map((t) => (typeof t.claimExpiresAt === 'string' ? t.claimExpiresAt : ''))
    .filter(Boolean)
    .sort()[0];
  const left = claimTimeLeft(soonest, now);
  const action = one ? { label: 'Open task', onPress: () => router.push(`/bounty/${encodeURIComponent(one.id)}`) } : undefined;
  return (
    <Banner
      tone="warning"
      icon={Timer}
      title={one ? 'You haven’t started this task' : `${list.length} tasks not started`}
      message={one ? [one.title || 'Bounty task', left].filter(Boolean).join(' · ') : left ? `First one: ${left}` : 'Send your work within 24 hours of accepting.'}
      action={action}
    />
  );
}

export function BountyCapBanner({ cap }: { cap: BountyCapStatus | undefined }) {
  if (!cap || typeof cap !== 'object' || !cap.capped) return null;
  return (
    <Banner
      tone="warning"
      icon={Trophy}
      title="Monthly limit reached"
      message={`You earned ${coins(cap.earned)} of ${coins(cap.cap)} coins this month. New tasks come back next month.`}
    />
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
/**
 * My place on the board (Lendora "Your Rank"): a light hero with my coins in its info chip and the
 * RankSlider under it — my rank centred big, a track from last place to No. 1 with a marker at me.
 */
export function BountyRankHero({ me, ranked }: { me: BountyLeaderRow; ranked: number }) {
  const rank = num(me.rank);
  const worst = Math.max(ranked, rank, 2);
  return (
    <SummaryHero icon={Trophy} module="bounty" label="Your rank · all time" info={{ label: 'Your coins', value: coins(me.total) }}>
      {rank ? (
        <RankSlider rank={rank} worst={worst} caption={`Out of ${worst.toLocaleString('en-IN')} on the board`} />
      ) : (
        <Text variant="label" muted>
          Finish a task to get a rank.
        </Text>
      )}
    </SummaryHero>
  );
}

// Gold, silver and bronze: the Bounty gold gradient for first (white figure), a cool slate tint for
// second and a warm bronze tint for third (their own inks). Read at render time, so it follows the theme.
function podiumLook(place: 1 | 2 | 3) {
  if (place === 1) return { h: 96, bg: moduleTone.bounty.fg, fg: palette.onPrimary, gradient: moduleTone.bounty.gradient };
  if (place === 2) return { h: 72, bg: moduleTone.policies.bg, fg: moduleTone.policies.fg, gradient: null };
  return { h: 56, bg: moduleTone.pettyCash.bg, fg: moduleTone.pettyCash.fg, gradient: null };
}

function PodiumSlot({ row, place, meId, avatar }: { row?: BountyLeaderRow; place: 1 | 2 | 3; meId?: string | null; avatar: number }) {
  const p = podiumLook(place);
  const uri = useLazyAvatar(row?.source, row?.employeeId, !!row?.hasAvatar);
  const isMe = !!row && row.employeeId === meId;
  const name = row ? (isMe ? 'You' : firstName(row.name) || row.name || '—') : '';
  const ringColor = isMe ? palette.success : place === 1 ? palette.gold : palette.surface;
  return (
    <View
      style={styles.podiumSlot}
      accessible={!!row}
      accessibilityLabel={row ? `${place === 1 ? 'First' : place === 2 ? 'Second' : 'Third'} place: ${isMe ? 'you' : row.name}, ${coins(row.total)} coins` : undefined}>
      {row ? (
        <>
          <View style={{ alignItems: 'center' }}>
            {place === 1 ? <Crown size={20} color={palette.gold} fill={palette.gold} style={{ marginBottom: -2 }} /> : null}
            <View style={[styles.podiumRing, { borderColor: ringColor }]}>
              <Avatar name={row.name} uri={uri} size={avatar} ring={false} />
            </View>
          </View>
          <View style={styles.podiumText}>
            <Text variant="labelStrong" numberOfLines={1} align="center" style={{ maxWidth: '100%' }}>
              {name}
            </Text>
            <View style={styles.podiumCoins}>
              <Coins size={12} color={palette.successInk} strokeWidth={2.2} style={{ flexShrink: 0 }} />
              <Text variant="caption" muted tabular numberOfLines={1} style={styles.shrink}>
                {coins(row.total)}
              </Text>
            </View>
          </View>
        </>
      ) : (
        <View style={{ height: avatar + 8 }} />
      )}
      <View style={[styles.pedestal, { height: p.h, backgroundColor: row ? p.bg : palette.surfaceMuted }]}>
        {row && p.gradient ? (
          <LinearGradient
            colors={p.gradient}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.pedestalFill]}
            pointerEvents="none"
          />
        ) : null}
        <Text variant="hero" color={row ? p.fg : palette.textFaint} maxFontSizeMultiplier={1}>
          {place}
        </Text>
      </View>
    </View>
  );
}

export function BountyPodium({ rows, meId }: { rows: BountyLeaderRow[]; meId?: string | null }) {
  const list = asArray<BountyLeaderRow>(rows).filter(Boolean);
  const { width, gutter, cardPad } = useLayout();
  // Three slots share the card's inner width; the avatars scale with it so nothing overlaps at 320.
  const slot = (width - 2 * gutter - 2 * cardPad - 2 * space.sm) / 3;
  const first = Math.round(Math.max(44, Math.min(64, slot - 24)));
  const rest = Math.max(40, first - 12);
  return (
    <Card tone="frostStrong" style={{ paddingBottom: 0, paddingTop: space.xl, overflow: 'hidden' }}>
      <View style={styles.podiumRow}>
        <PodiumSlot row={list[1]} place={2} meId={meId} avatar={rest} />
        <PodiumSlot row={list[0]} place={1} meId={meId} avatar={first} />
        <PodiumSlot row={list[2]} place={3} meId={meId} avatar={rest} />
      </View>
    </Card>
  );
}

/** Separator inset for leaderboard rows: 16 padding + rank 24 + 8 + avatar 40 + 12. */
export const LEADER_ROW_INSET = space.md + 24 + space.xs + 40 + space.sm;

export function BountyLeaderListRow({ row, isMe }: { row: BountyLeaderRow; isMe?: boolean }) {
  const uri = useLazyAvatar(row.source, row.employeeId, !!row.hasAvatar);
  const name = isMe ? `${row.name || 'You'} (you)` : row.name || '—';
  return (
    <View style={isMe ? styles.meRow : undefined}>
      <ActivityRow
        left={
          <View style={styles.rankLeft}>
            <Text variant="labelStrong" muted tabular numberOfLines={1} align="center" style={styles.rank}>
              {row.rank}
            </Text>
            <Avatar name={row.name} uri={uri} size={40} ring={false} />
          </View>
        }
        title={name}
        value={coins(row.total)}
        meta="coins"
        accessibilityLabel={`Rank ${row.rank}, ${name}, ${coins(row.total)} coins`}
      />
    </View>
  );
}

// ── Coin history row ─────────────────────────────────────────────────────────
export function BountyTxnRow({ txn, userId }: { txn: BountyTxn; userId: string }) {
  const today = useTodayIst();
  const { credit, debit } = txnDirection(txn, userId);
  // My balance right after this movement, as the website's My Wallet table shows it.
  const bal = txnBalance(txn, userId);
  const reversed = !!txn.reversedAt;
  const amountColor = reversed ? palette.textMuted : credit ? palette.successInk : debit ? palette.dangerInk : palette.text;
  const figure = `${credit ? '+' : debit ? '−' : ''}${coins(txn.amount)}`;
  const when = `${dateTimeLabel(txn.createdAt, today)}${reversed ? ' · Cancelled' : ''}`;
  return (
    <ActivityRow
      left={
        <IconBadge bg={credit ? palette.successSoft : debit ? palette.dangerSoft : moduleTone.bounty.bg}>
          {credit ? (
            <ArrowDownLeft size={18} color={palette.successInk} strokeWidth={2} />
          ) : (
            <ArrowUpRight size={18} color={debit ? palette.dangerInk : moduleTone.bounty.fg} strokeWidth={2} />
          )}
        </IconBadge>
      }
      title={txnLabel(txn.type)}
      subtitle={txn.taskName || txn.reason || null}
      note={when}
      value={figure}
      valueColor={amountColor}
      meta={bal != null ? `Balance ${coins(bal)}` : null}
      accessibilityLabel={[
        txnLabel(txn.type),
        txn.taskName || txn.reason,
        `${credit ? 'Plus' : debit ? 'Minus' : ''} ${coins(txn.amount)} coins${reversed ? ', cancelled' : ''}`,
        dateTimeLabel(txn.createdAt, today),
        bal != null ? `Balance ${coins(bal)} coins` : null,
      ]
        .filter(Boolean)
        .join(', ')}
    />
  );
}

const styles = themedStyles(() => ({
  shrink: { flexShrink: 1 },
  coin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.successSoft,
    flexShrink: 0,
  },
  coinLarge: { minHeight: 36, paddingHorizontal: 14, gap: 6 },
  heroFoot: { gap: space.md },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  podiumSlot: { flex: 1, minWidth: 0, alignItems: 'center', gap: space.xs },
  podiumRing: { borderWidth: 2, borderRadius: 999, padding: 2 },
  podiumText: { alignItems: 'center', gap: 2, maxWidth: '100%', paddingHorizontal: space.xxs },
  podiumCoins: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, maxWidth: '100%' },
  pedestal: {
    alignSelf: 'stretch',
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    alignItems: 'center',
    paddingTop: space.xs,
  },
  pedestalFill: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  meRow: { backgroundColor: palette.successSoft, borderRadius: radius.md },
  rankLeft: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rank: { minWidth: 24 },
}));
