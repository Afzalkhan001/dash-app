// "Now" as state that ticks on an interval, so render stays pure: the React Compiler would flag a
// Date.now() read in render, and would memoize an argument-less todayIst() call for the life of a
// screen — a tab that stays mounted past midnight would keep yesterday's date.

import { useEffect, useState } from 'react';

import { istParts } from '@/lib/dates';

export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// Today's IST date (YYYY-MM-DD), re-evaluated every minute.
export function useTodayIst() {
  const now = useNow();
  return istParts(new Date(now)).date;
}
