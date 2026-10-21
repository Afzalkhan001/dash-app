// Payno quick actions (docs/REFERENCE-COMPONENTS.md item 9): QuickActions is the Payno "Bill Pay"
// CategoryGrid (src/ui/tiles.tsx) — frosted circles with a thin line icon in the module's own colour
// (moduleTone fg) over a one- or two-word label (up to 2 lines, centred). Up to `columns` (4) share one
// row evenly; more wrap onto further rows. Home's shortcut row, the More module grid and the
// CreateSheet all draw through it, so they share one look.
//
// Fit (docs/DESIGN.md §8–9, done in CategoryGrid): the row is kept only while every label fits its
// tile without breaking a word and in at most 2 lines at the person's text size (capped at 130 %):
//   default text on a very narrow phone  labels drop to 11 px (the type floor) and stay in the row;
//   a little larger text                 labels grow only as far as they still fit;
//   still too tight (a 320 dp sheet)     3 across, then 2 per row (2×2) — and 2 per row with large
//                                        text (> 115 %), where labels have room to grow.
// The width is measured (onLayout), so the row also fits inside a card (pass `surface="card"` there).

import type { LucideIcon } from 'lucide-react-native';
import { type StyleProp, type ViewStyle } from 'react-native';

import type { ModuleKey } from '@/theme/tokens';
import { CategoryGrid, type CategorySurface } from '@/ui/tiles';

export type QuickAction = {
  key: string;
  /** One or two words, a verb first where it starts something ("Apply leave", "Payslips"). */
  label: string;
  icon: LucideIcon;
  /** The module whose colour the icon carries (theme/tokens moduleTone). */
  module: ModuleKey;
  onPress: () => void;
  /** A neutral count bubble on the circle (hidden at 0, "99+" cap), or `true` for a small brand dot. */
  badge?: number | boolean;
  /** Screen-reader hint, e.g. "Opens a new expense claim". */
  hint?: string;
  /** Overrides the spoken label (defaults to the label, plus the count). */
  accessibilityLabel?: string;
  disabled?: boolean;
};

/**
 * Row of up to 4 equal frosted round action buttons (Payno), drawn by CategoryGrid. Fewer than
 * `columns` share the row evenly; more wrap into rows of `columns` (3 for a module grid). Hide an
 * action the person can't use rather than disabling it.
 *   <QuickActions items={[
 *     { key: 'leave', label: 'Apply leave', icon: CalendarPlus, module: 'leave', onPress: () => router.push('/leave/apply') },
 *     { key: 'slips', label: 'Payslips', icon: ReceiptText, module: 'pay', onPress: … },
 *   ]} />
 */
export function QuickActions({
  items,
  columns = 4,
  size = 56,
  surface = 'auto',
  style,
}: {
  items: QuickAction[];
  /** Most tiles in one row (default 4). */
  columns?: 3 | 4;
  /** Circle diameter (default 56; 48–60 reads best). */
  size?: number;
  /** 'auto': frosted on the canvas (solid white in a Sheet); 'card': soft filled circles inside a card. */
  surface?: CategorySurface;
  style?: StyleProp<ViewStyle>;
}) {
  return <CategoryGrid items={items} columns={columns} size={size} surface={surface} style={style} />;
}
