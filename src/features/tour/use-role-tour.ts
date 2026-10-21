// When the role tour starts, and replaying it (docs/TOUR.md §2). Shared by the staff and vendor hosts
// (features/tour/hosts.tsx):
//
//   • Once per person: the first time they land on Home with nothing in the way — access loaded, no
//     pushed screen, no sheet, no keyboard, no app lock, the app in front — and then 700 ms more. "Seen"
//     is kept on this phone per person (staff:<user id>, vendor:<vendor id>) with the tour and its
//     version, so each demo persona ("Afzal Manager", …) gets its own tour the first time it is picked.
//   • Done, Skip and a tapped-through control all count as seen. A tour cut off (app killed, a link
//     opening a screen, a sign-out or role switch) is offered once more, then never again. A light /
//     dark switch rebuilds the app but not the tour: it carries on where it was.
//   • Afterwards the person is taken back to the tab where the tour started (not after a tap-through:
//     they asked for that screen).
//   • Replay ("Show me around" in More / vendor Profile) starts at step 1 without the welcome card and
//     never changes the stored record.

import { type Href, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Keyboard } from 'react-native';

import { isAppLockShowing } from '@/auth/app-lock';
import { useSession } from '@/auth/session';
import { TOUR_VERSION, type BuiltTour, type PreviousTour } from '@/features/tour/role-tours';
import { hasSeenTour, markTourSeen, markTourStarted, readTourRecord, tour } from '@/ui';
import { isAnySheetOpen } from '@/ui/sheet';

export type TourKind = 'staff' | 'vendor';

/** Home's entrance settles within ~520 ms; wait this long on a calm screen before starting. */
const CALM_MS = 700;
const POLL_MS = 120;

// Asked once per person and tour in this app session (written from effects and async work only).
const asked = new Set<string>();

// The live replay starter per kind, registered by its host (from an effect).
const replayers: Record<TourKind, (() => boolean) | null> = { staff: null, vendor: null };

/** Replay the signed-in person's tour from step 1 (More / vendor Profile → Show me around). */
export function replayRoleTour(kind: TourKind): boolean {
  const fn = replayers[kind];
  return fn ? fn() : false;
}

function keyboardUp() {
  try {
    return typeof Keyboard.isVisible === 'function' ? Keyboard.isVisible() : false;
  } catch {
    return false;
  }
}

/** Nothing on top of the app and the app in front. */
function calmNow(blocked: boolean) {
  return !blocked && !tour.isActive() && !isAnySheetOpen() && !isAppLockShowing() && !keyboardUp() && (AppState.currentState ?? 'active') === 'active';
}

function launch(userKey: string, built: BuiltTour, replay: boolean, returnTo: string, skipToast: string) {
  tour.start(built.tourId, built.steps, {
    intro: replay ? undefined : built.intro,
    skipToast,
    onEnd: (r) => {
      // Cut off (sign-out, a link, a role switch): left as "started", so it is offered once more.
      if (!replay && r.reason !== 'stopped') void markTourSeen(userKey, r.tourId, TOUR_VERSION, r.reason === 'skipped' ? 'skipped' : 'done');
      if (r.reason === 'done' || r.reason === 'skipped') {
        try {
          router.navigate(returnTo as Href);
        } catch {
          // stay where the tour ended
        }
      }
    },
  });
}

export type RoleTourOptions = {
  kind: TourKind;
  /** 'staff:<id>' / 'vendor:<id>', or null while unknown. */
  userKey: string | null;
  /** The tour this person gets now, or null (none, or not known yet). */
  tourId: string | null;
  /** Access and data loaded (the gates are decided). */
  loaded: boolean;
  /** The current path (usePathname) and the tab roots of this area. */
  pathname: string;
  home: string;
  tabRoots: string[];
  /** Something of the host's own is in the way (the + sheet). */
  blocked?: boolean;
  /** Builds the tour from the latest context. */
  build: (prev: PreviousTour) => BuiltTour | null;
  skipToast: string;
};

/** Starts the role tour on first sign-in, registers its replay, and closes it when the app moves on. */
export function useRoleTour({ kind, userKey, tourId, loaded, pathname, home, tabRoots, blocked = false, build, skipToast }: RoleTourOptions) {
  // The latest values, for timers and the replay starter (written after render, never during it).
  const latest = useRef({ build, blocked, pathname, skipToast });
  useEffect(() => {
    latest.current = { build, blocked, pathname, skipToast };
  });

  // Replay from "Show me around": step 1 on its own screen, no welcome card, record untouched.
  useEffect(() => {
    if (!userKey) return;
    const fn = () => {
      const built = latest.current.build(null);
      if (!built || !built.steps.length) return false;
      launch(userKey, built, true, latest.current.pathname, latest.current.skipToast);
      return true;
    };
    replayers[kind] = fn;
    return () => {
      if (replayers[kind] === fn) replayers[kind] = null;
    };
  }, [kind, userKey]);

  // A sign-out (or an expired session) and a demo role switch close the tour at once. Not a remount:
  // switching light / dark rebuilds the app, and the tour carries on where it was.
  useEffect(
    () =>
      useSession.subscribe((now, before) => {
        if ((now.kind !== before.kind || now.user?.id !== before.user?.id) && tour.isActive()) tour.stop();
      }),
    [],
  );

  // A link or notification that opens a screen over the tabs closes it too.
  const onTabRoot = tabRoots.includes(pathname);
  useEffect(() => {
    if (!onTabRoot && tour.isActive()) tour.stop();
  }, [onTabRoot, pathname]);

  // First sign-in: wait for a calm Home, then start (once per person, tour and version). It keeps
  // polling until the tour has started or turns out to be seen already: a sheet or a screen change in
  // the middle only puts it off.
  const ready = loaded && !!userKey && !!tourId && pathname === home;
  useEffect(() => {
    if (!ready || !userKey || !tourId) return;
    const askKey = `${userKey}|${tourId}|${TOUR_VERSION}`;
    if (asked.has(askKey)) return;
    let alive = true;
    let busy = false;
    let calmSince = 0;
    const settleAsked = () => {
      asked.add(askKey);
      clearInterval(timer);
    };
    const attempt = async () => {
      if (await hasSeenTour(userKey, tourId, TOUR_VERSION)) {
        settleAsked();
        return;
      }
      const prev = await readTourRecord(userKey);
      if (!alive || asked.has(askKey)) return;
      if (!calmNow(latest.current.blocked)) {
        calmSince = 0;
        return;
      }
      const built = latest.current.build(prev ? { tour: prev.tour } : null);
      if (!built || built.tourId !== tourId) return; // the context is still catching up: next tick
      settleAsked();
      if (!built.steps.length) {
        await markTourSeen(userKey, tourId, TOUR_VERSION, 'done');
        return;
      }
      await markTourStarted(userKey, tourId, TOUR_VERSION);
      launch(userKey, built, false, home, latest.current.skipToast);
    };
    const timer = setInterval(() => {
      if (!alive || busy) return;
      if (!calmNow(latest.current.blocked)) {
        calmSince = 0;
        return;
      }
      const now = Date.now();
      if (!calmSince) calmSince = now;
      if (now - calmSince < CALM_MS) return;
      busy = true;
      void attempt().finally(() => {
        busy = false;
      });
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [ready, userKey, tourId, home]);
}
