// The lobby board on the running kiosk (web: VisitKioskBoard, dash.html:36163). It is what lets the kiosk
// take the next visitor while an earlier one still waits for their host: the wizard frees itself 12 s after
// a check-in, and the board keeps their place.
//   pill     "2 waiting" in the kiosk's top bar; a tap lists who is waiting for whom, and for how long
//   notices  for 45 s after each answer, a banner telling that person what to do
//            ("Ravi K. — approved. Please go to reception.")
// GET /visitors/kiosk/board every 5 s (api/desk useKioskBoard, the desk's session). A public screen, so the
// server sends only "First L.", the host's first name, a status and a time — no photo, mobile or purpose.
// Times run on the server's clock (serverNow skew), like the web.

import { Users } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { type KioskBoardRecent, useKioskBoard } from '@/api/desk';
import { useNow } from '@/features/attendance/use-now';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { Banner, ListCard, ListRow, Sheet, Text, useLayout } from '@/ui';

const NEWS_MS = 45_000; // how long an answer stays on screen (dash.html:36186)

/** The verdict a waiting visitor reads, word for word from the web. */
function verdict(x: KioskBoardRecent) {
  if (x.status === 'approved') return { tone: 'success' as const, text: `${x.name} — approved. Please go to reception.` };
  if (x.status === 'rejected') return { tone: 'danger' as const, text: `${x.name} — ${x.host || 'your host'} cannot meet you now. Please see the security desk.` };
  return { tone: 'warning' as const, text: `${x.name} — no answer yet. Please see the security desk.` };
}

/** The board for the running kiosk: `pill` for its top bar, `notices` for under it, `sheet` once on screen. */
export function useKioskBoardView(enabled: boolean) {
  const board = useKioskBoard(enabled);
  const now = useNow(5_000) + (board.data?.skewMs ?? 0);
  const [open, setOpen] = useState(false);
  const { compact } = useLayout();

  const waiting = board.data?.waiting ?? [];
  const news = (board.data?.recent ?? []).filter((x) => now - Date.parse(x.at) < NEWS_MS).slice(0, 3);
  const mins = (iso: string) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  const n = waiting.length;

  const pill = board.data ? (
    <Pressable
      onPress={() => setOpen(true)}
      hitSlop={8}
      style={[styles.pill, n ? styles.pillOn : null]}
      accessibilityRole="button"
      accessibilityLabel={n === 1 ? '1 visitor waiting for their host' : `${n} visitors waiting for their host`}
      accessibilityHint="Shows who is waiting">
      <Users size={16} color={n ? palette.onPrimary : palette.textMuted} />
      <Text variant="labelStrong" color={n ? palette.onPrimary : palette.textMuted} tabular maxFontSizeMultiplier={1.4}>
        {/* At 320 dp (or large text) the number alone, so the company name keeps its room. */}
        {compact ? String(n) : `${n} waiting`}
      </Text>
    </Pressable>
  ) : null;

  const notices = news.length ? (
    <View style={styles.notices} accessibilityLiveRegion="polite">
      {news.map((x) => {
        const v = verdict(x);
        return <Banner key={x.id} tone={v.tone} message={v.text} />;
      })}
    </View>
  ) : null;

  const sheet = (
    <Sheet visible={open} onClose={() => setOpen(false)} title="Waiting for their host" subtitle={n ? undefined : 'Nobody is waiting.'}>
      {n ? (
        <ListCard>
          {waiting.map((x) => {
            const m = mins(x.createdAt);
            return (
              <ListRow
                key={x.id}
                title={x.name}
                subtitle={x.host ? `for ${x.host}` : undefined}
                right={
                  <Text variant="label" tabular color={m >= 5 ? palette.warningInk : palette.textMuted}>
                    {m < 1 ? 'just now' : `${m} min`}
                  </Text>
                }
              />
            );
          })}
        </ListCard>
      ) : null}
    </Sheet>
  );

  return { pill, notices, sheet };
}

const styles = themedStyles(() => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    minHeight: 36,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.track,
  },
  pillOn: { backgroundColor: palette.primary },
  notices: { gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.sm },
}));
