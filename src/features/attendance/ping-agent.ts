// Hourly location while clocked in REMOTELY — the app's version of the web's HrPingAgent
// (dash.html ~L4348). The server decides everything (which open row, which hourly slot, the 9-hour
// window); this only sends a fresh position when GET /attendance/today says the next one is due.
//
// Foreground only: a phone app cannot send it while closed, exactly as a closed browser tab cannot.
// Every mounted clock card registers here, but one shared timer runs, so Home and the Attendance tab
// together never send twice.

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import type { PingState } from '@/api/attendance';
import { sendPing } from '@/api/attendance';
import { isApiError } from '@/api/client';
import { queryClient } from '@/api/query';
import { plainServerText } from '@/features/attendance/format';
import { getPosition } from '@/features/attendance/use-clock';

type PingStatus = { active: boolean; nextDueAt: string | null; lastOkAt: string | null; lastError: string | null; recorded: number };
const IDLE: PingStatus = { active: false, nextDueAt: null, lastOkAt: null, lastError: null, recorded: 0 };

// Live status for the clock card's status line (the web's useHrPingStatus).
export const usePingStatus = create<PingStatus>(() => IDLE);

const RETRY_MS = 5 * 60_000;
const st = { active: false, next: null as number | null, busy: false };
let owners = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let appSub: { remove: () => void } | null = null;

function refreshToday() {
  void queryClient.invalidateQueries({ queryKey: ['att-today'] });
}

async function tick() {
  if (!st.active || st.busy || !st.next || Date.now() < st.next) return;
  if (AppState.currentState !== 'active') return; // foreground only; resuming the app re-syncs
  st.busy = true;
  try {
    const f = await getPosition();
    const r = await sendPing(f);
    if (isApiError(r)) {
      st.next = Date.now() + RETRY_MS; // backoff survives the refresh below (see sync)
      // Just the server's reason: the clock card already says "Hourly location not sent." before it.
      usePingStatus.setState({ lastError: plainServerText(r.error) || 'Try again later.' });
    } else {
      // Until the refresh brings the next hour's due time, wait at least the retry gap — a refresh
      // that fails must not turn into a ping every 30 seconds.
      st.next = Date.now() + RETRY_MS;
      usePingStatus.setState({ lastOkAt: new Date().toISOString(), lastError: null });
    }
    refreshToday();
  } catch (e: any) {
    // Permission off or no signal: retry in five minutes.
    st.next = Date.now() + RETRY_MS;
    usePingStatus.setState({ lastError: e?.message || 'Could not get your location.', nextDueAt: new Date(st.next).toISOString() });
  } finally {
    st.busy = false;
  }
}

// Called whenever /attendance/today changes. Keeps a failed attempt's backoff instead of letting the
// server's (already past) due time trigger an immediate retry loop.
function sync(ping: PingState | undefined) {
  st.active = !!ping?.active;
  const due = ping?.nextDueAt ? new Date(ping.nextDueAt).getTime() : null;
  st.next = st.next && due && st.next > due ? st.next : due;
  usePingStatus.setState({
    active: st.active,
    nextDueAt: st.next ? new Date(st.next).toISOString() : null,
    recorded: ping?.recorded ?? ping?.lastSlot ?? 0,
    ...(st.active ? null : { lastError: null }),
  });
  void tick(); // already due (the app was closed at the hour)? take it now, not in 30 s
}

function start() {
  owners += 1;
  if (owners > 1) return;
  timer = setInterval(() => void tick(), 30_000);
  // Coming back to the app: refresh today's state straight away (that also re-syncs and ticks).
  appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') refreshToday();
  });
}

function stop() {
  owners = Math.max(0, owners - 1);
  if (owners > 0) return;
  if (timer) clearInterval(timer);
  timer = null;
  appSub?.remove();
  appSub = null;
  st.active = false;
  st.next = null;
  usePingStatus.setState(IDLE);
}

export function useRemotePingAgent(ping: PingState | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    start();
    return stop;
  }, [enabled]);

  const active = !!ping?.active;
  const nextDueAt = ping?.nextDueAt ?? null;
  const recorded = ping?.recorded ?? ping?.lastSlot ?? 0;
  useEffect(() => {
    if (!enabled) return;
    sync({ active, nextDueAt, recorded, lastSlot: recorded, windowEndsAt: null });
  }, [enabled, active, nextDueAt, recorded]);
}
