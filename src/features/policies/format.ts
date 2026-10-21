// Dates on the policy screens are ISO timestamps (published_at, acked_at); show them as the India
// calendar date in the app's one date style (lib/dates dateLabel): 'Mon, 5 Oct', with the year only
// when it isn't this year. `today` (YYYY-MM-DD, from useTodayIst() during render) decides that.

import { dateLabel } from '@/lib/dates';

export const istDate = (iso: string | null | undefined, today: string) => dateLabel(iso, today);
