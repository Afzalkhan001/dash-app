// Hold the picked time while the form is filled in (web: useSlotHold, dash.html:27841).
//   - claim: POST /holds whenever the picked window changes (the previous hold is released first, so
//     widening a selection never collides with your own hold); a 409 says who is booking it;
//   - renew: POST /holds/:id/renew every 60 s; a 410 means it lapsed ("pick your time again");
//   - others: GET /holds every 10 s, without your own;
//   - release: on change, when the screen loses focus, when the app goes to the background and on
//     unmount. A phone has no sendBeacon, so a hold stranded by a killed app lapses on the server's
//     5-minute TTL (PLAN §5).
// `consume()` after a successful booking: the hold has become a real lock and must not be released.

import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { type Hold, type HoldResource, postHold, releaseHold, renewHold, useHolds } from '@/api/booking';

type Payload = Record<string, number> | null;
type Held = { holdId: string; expiresAt: string };

const RENEW_MS = 60_000;

export function useSlotHold({
  type,
  resourceId,
  date,
  payload,
  me,
  enabled,
}: {
  type: HoldResource;
  resourceId: string;
  date: string;
  payload: Payload;
  me: { id?: string; name?: string } | null | undefined;
  enabled: boolean;
}) {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s !== 'background'));
    return () => sub.remove();
  }, []);
  const live = enabled && focused && foreground && !!resourceId && !!date;

  const [hold, setHold] = useState<Held | null>(null);
  const [holdErr, setHoldErr] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const holdRef = useRef<string | null>(null);
  const reqRef = useRef(0);
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  });

  const key = live && payload ? JSON.stringify({ type, resourceId, date, payload }) : '';

  // Claim (or let go) whenever the window changes.
  useEffect(() => {
    const prev = holdRef.current;
    holdRef.current = null;
    const mine = ++reqRef.current;
    let cancelled = false;
    const run = async () => {
      if (prev) await releaseHold(prev).catch(() => {});
      if (!key) {
        if (!cancelled) {
          setHold(null);
          setHoldErr('');
        }
        return;
      }
      const { payload: body } = JSON.parse(key) as { payload: Record<string, number> };
      try {
        const r = await postHold({ resourceType: type, resourceId, date, userId: meRef.current?.id, userName: meRef.current?.name, ...body });
        if (mine !== reqRef.current) {
          void releaseHold(r.holdId);
          return;
        }
        holdRef.current = r.holdId;
        setHold({ holdId: r.holdId, expiresAt: r.expiresAt });
        setHoldErr('');
        setNow(Date.now());
      } catch (e) {
        if (mine !== reqRef.current) return;
        setHold(null);
        setHoldErr(e instanceof Error && e.message ? e.message : 'Couldn’t hold this time. Try again.');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // Only the window itself decides a new claim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Heartbeat.
  const holdId = hold?.holdId ?? '';
  useEffect(() => {
    if (!holdId) return;
    const t = setInterval(() => {
      const id = holdRef.current;
      if (!id) return;
      renewHold(id)
        .then((r) => {
          if (holdRef.current === id) setHold({ holdId: id, expiresAt: r.expiresAt });
        })
        .catch((e) => {
          if (holdRef.current !== id) return;
          if (e instanceof ApiRequestError && e.status === 410) {
            holdRef.current = null;
            setHold(null);
            setHoldErr('Your hold on this time ran out. Pick your time again.');
          }
        });
    }, RENEW_MS);
    return () => clearInterval(t);
  }, [holdId]);

  // The countdown.
  useEffect(() => {
    if (!holdId) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [holdId]);

  // Let it go when the screen goes away.
  useEffect(
    () => () => {
      reqRef.current += 1;
      const id = holdRef.current;
      holdRef.current = null;
      if (id) void releaseHold(id);
    },
    [],
  );

  const othersQ = useHolds(type, resourceId, date, live);
  const myId = me?.id;
  const others: Hold[] = (othersQ.data ?? []).filter((h) => h.holdId !== holdId && !(myId && h.userId === myId));
  const secsLeft = hold ? Math.max(0, Math.round((Date.parse(hold.expiresAt) - now) / 1000)) : 0;

  const consume = () => {
    reqRef.current += 1;
    holdRef.current = null;
    setHold(null);
  };

  return { holdId: hold?.holdId ?? null, secsLeft, holdErr, setHoldErr, others, consume };
}

/** "4:31" for the countdown. */
export const holdClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
