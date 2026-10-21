// "Has this person seen the tour?" — kept on the phone (AsyncStorage), because the server can't change
// (docs/TOUR.md §2.1). One record per person, under `dash.tour:<userKey>`; pass a userKey such as
// `staff:${user.id}` or `vendor:${vendor.id}`. Signing out does not clear it.
//
//   if (!(await hasSeenTour(key, 'manager', TOUR_VERSION))) { await markTourStarted(key, 'manager', TOUR_VERSION); start(…) }
//   onEnd: (r) => markTourSeen(key, r.tourId, TOUR_VERSION, r.reason === 'skipped' ? 'skipped' : 'done')
//
// Every helper catches its own errors and never throws. Timestamps are taken when a helper is called
// (from a handler or an effect), never during render.

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'dash.tour:';

export type TourRecordState = 'done' | 'skipped' | 'started';

export type TourRecord = {
  /** The tour id that was shown ('manager', 'vendor.approved'…). */
  tour: string;
  /** The tour version it was shown at. */
  v: number;
  state: TourRecordState;
  /** ISO time of the last change. */
  at: string;
  /** How many times it was started without finishing (an interrupted tour shows once more, then never). */
  tries?: number;
};

const keyFor = (userKey: string) => `${PREFIX}${userKey}`;

function parse(raw: string | null): TourRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<TourRecord> | null;
    if (!r || typeof r.tour !== 'string' || typeof r.v !== 'number') return null;
    const state: TourRecordState = r.state === 'done' || r.state === 'skipped' || r.state === 'started' ? r.state : 'done';
    return { tour: r.tour, v: r.v, state, at: typeof r.at === 'string' ? r.at : '', tries: typeof r.tries === 'number' ? r.tries : undefined };
  } catch {
    return null;
  }
}

async function write(userKey: string, record: TourRecord) {
  try {
    await AsyncStorage.setItem(keyFor(userKey), JSON.stringify(record));
  } catch {
    // keep going: at worst the tour is offered once more
  }
}

/** The person's stored record, or null (none yet, or storage unreadable). */
export async function readTourRecord(userKey: string): Promise<TourRecord | null> {
  try {
    return parse(await AsyncStorage.getItem(keyFor(userKey)));
  } catch {
    return null;
  }
}

/**
 * True when this person has finished or skipped `tourId` at `version` or later, or was interrupted
 * twice. False when there is no record, the record is for another tour (a role change) or an older
 * version, or the tour was interrupted once. When storage can't be read it answers true, so a broken
 * store never nags.
 */
export async function hasSeenTour(userKey: string, tourId: string, version: number): Promise<boolean> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(keyFor(userKey));
  } catch {
    return true;
  }
  const r = parse(raw);
  if (!r || r.tour !== tourId || r.v < version) return false;
  if (r.state === 'started') return (r.tries ?? 1) >= 2;
  return true;
}

/** Save that the tour ended ('done' or 'skipped'). */
export async function markTourSeen(userKey: string, tourId: string, version: number, state: 'done' | 'skipped' = 'done'): Promise<void> {
  await write(userKey, { tour: tourId, v: version, state, at: new Date().toISOString() });
}

/** Save that the tour began (call just before start). An unfinished start shows the tour once more. */
export async function markTourStarted(userKey: string, tourId: string, version: number): Promise<void> {
  const prev = await readTourRecord(userKey);
  const tries = prev && prev.tour === tourId && prev.v === version && prev.state === 'started' ? (prev.tries ?? 1) + 1 : 1;
  await write(userKey, { tour: tourId, v: version, state: 'started', at: new Date().toISOString(), tries });
}

/** Forget the record for one person, or (no key) for everyone on this phone. */
export async function resetTours(userKey?: string): Promise<void> {
  try {
    if (userKey) {
      await AsyncStorage.removeItem(keyFor(userKey));
      return;
    }
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // nothing to undo
  }
}
