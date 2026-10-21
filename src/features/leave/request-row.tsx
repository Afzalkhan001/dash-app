// One request in a list (Me › Leave and the full history), as a Payno "transaction" row (the kit's
// ActivityRow, docs/REFERENCE-COMPONENTS.md item 8): the kind's round tinted badge (for leave, the leave
// type's own icon when the caller knows the type, the same icon as its tile on the form), the title (the
// leave type, "Work from home" or "Comp-off claim") over when it is ("12 – 14 Oct", "Worked 3 Oct"),
// and on the right how long it is ("3 days", medium; "1st half" for a half day) over its status pill.
// Tapping it opens the request sheet.
//
// A comp-off claim's figure is the day off it earns ("1 day off"; the pill says whether it was
// approved, and the full "1 day off earned" is read out). ActivityRow moves the pill under the text
// below 360 dp when there is also a figure, and the whole right column under the text at very large
// text, so nothing is ever cut.
//
// Also the icons the apply flow uses for each kind and each leave type (the SelectTiles, FromToCards).

import {
  Baby,
  CalendarPlus,
  CircleSlash,
  Coffee,
  House,
  type LucideIcon,
  Plane,
  Thermometer,
  TreePalm,
} from 'lucide-react-native';

import type { LeaveKind, LeaveRequest } from '@/api/leave';
import { useTodayIst } from '@/features/attendance/use-now';
import { HALF_LABEL, rangeLabel, requestDays, requestTitle, statusMeta } from '@/features/leave/rules';
import type { ModuleKey } from '@/theme/tokens';
import { ActivityRow, type ListTone, ModuleBadge, SkeletonList } from '@/ui';

// Each kind in its own module colour: leave blue, work from home teal, comp-off gold.
const KIND_STYLE: Record<LeaveKind, { Icon: LucideIcon; module: ModuleKey }> = {
  leave: { Icon: TreePalm, module: 'leave' },
  wfh: { Icon: House, module: 'visitors' },
  comp_off: { Icon: CalendarPlus, module: 'bounty' },
};

/** A kind's icon and module colour (badges, FromToCards). */
export function kindLook(kind: LeaveKind) {
  return KIND_STYLE[kind] ?? KIND_STYLE.leave;
}

export function KindBadge({ kind, size = 40 }: { kind: LeaveKind; size?: number }) {
  const k = kindLook(kind);
  return <ModuleBadge module={k.module} icon={k.Icon} size={size} />;
}

/** What `typeIcon` reads of a leave type (a LeaveType or a balance row). */
export type LeaveTypeLike = { name?: string | null; code?: string | null; paid?: boolean; is_comp_off?: boolean };

/**
 * A thin line icon for a leave type, guessed from its name or code (HR names them freely): sick →
 * thermometer, casual → coffee, earned / privilege / annual → plane, parental → baby, comp-off → the
 * comp-off calendar, unpaid → a slashed circle; anything else gets the leave palm.
 */
export function typeIcon(t: LeaveTypeLike): LucideIcon {
  if (t.is_comp_off) return CalendarPlus;
  if (t.paid === false) return CircleSlash;
  const s = `${t.name ?? ''} ${t.code ?? ''}`.toLowerCase();
  if (/sick|medical|\bsl\b/.test(s)) return Thermometer;
  if (/casual|\bcl\b/.test(s)) return Coffee;
  if (/earn|privilege|annual|vacation|\bel\b|\bpl\b/.test(s)) return Plane;
  if (/matern|patern|parent|\bml\b/.test(s)) return Baby;
  return TreePalm;
}

const isHalf = (r: LeaveRequest) => !!r.half_day && r.half_day !== 'none';

// Pass `today` (from useTodayIst) when calling during render, so the year logic never reads the clock.
export function requestWhen(r: LeaveRequest, today?: string) {
  const dates = rangeLabel(r.from_date, r.to_date, today);
  if (r.kind === 'comp_off') return `Worked ${dates}`;
  return isHalf(r) ? `${dates} · ${HALF_LABEL[r.half_day] ?? r.half_day}` : dates;
}

/** How much the request is: "3 days" ("Half a day", as on the form), or for a comp-off claim the day
 *  off it earns ("1 day off", "1 day off earned" once approved). Empty if unknown. */
export function requestAmount(r: LeaveRequest) {
  if (!Number.isFinite(Number(r.days))) return '';
  const days = requestDays(r.days);
  if (r.kind !== 'comp_off') return days;
  return r.status === 'approved' ? `${days} off earned` : `${days} off`;
}

export function LeaveRequestRow({
  request: r,
  typeName,
  type,
  onPress,
}: {
  request: LeaveRequest;
  typeName?: string | null;
  /** The request's leave type (a balance row), so a leave row wears that type's icon, as on the form. */
  type?: LeaveTypeLike | null;
  onPress?: () => void;
}) {
  const today = useTodayIst();
  const s = statusMeta(r.status);
  const title = requestTitle(r, typeName);
  const amount = requestAmount(r);
  const when = requestWhen(r, today);
  const half = r.kind !== 'comp_off' && isHalf(r);
  // The length is the row's figure, said once. A half day's figure is which half ("2nd half", the
  // form's words), so the date line under the title is just the date. For a comp-off claim it is the
  // day off it earns, kept short for the right column ("1 day off earned" once approved is too long
  // for a small phone; the pill says it).
  const figure = half
    ? (HALF_LABEL[r.half_day] ?? amount)
    : r.kind === 'comp_off' && Number.isFinite(Number(r.days))
      ? `${requestDays(r.days)} off`
      : amount;

  return (
    <ActivityRow
      left={r.kind === 'leave' && type ? <ModuleBadge module={kindLook('leave').module} icon={typeIcon(type)} size={40} /> : <KindBadge kind={r.kind} />}
      title={title}
      subtitle={half ? rangeLabel(r.from_date, r.to_date, today) : when}
      value={figure || null}
      status={{ label: s.label, tone: s.tone }}
      onPress={onPress}
      accessibilityLabel={[title, s.label, when, amount].filter(Boolean).join(', ')}
      accessibilityHint={onPress ? 'Opens the request' : undefined}
    />
  );
}

/** Loading placeholder shaped like a card of request rows. */
export function RequestRowsSkeleton({ rows = 3, tone = 'surface' }: { rows?: number; tone?: ListTone }) {
  return <SkeletonList rows={rows} avatar tone={tone} />;
}
