// Clock in / out with the phone's GPS — the same request body as the website's ClockCard
// ({ lat, lng, accuracy, mode }). The server is the only judge: it decides office/remote/outside from
// the geofence, rejects fixes that are not precise enough (settings.maxAccuracyM, 422) and holds
// clock-in while a weekly timesheet is owed (403). Its message is shown to the person verbatim.
//
// Clock-out is never called straight from a button: like the web, the clock card first opens the
// timesheet sheet, and submitting that is what punches out (see clock-card.tsx / timesheet-sheet.tsx).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';

import { isApiError } from '@/api/client';
import { clockIn, type ClockFix, clockOut } from '@/api/hr';

export class ClockError extends Error {
  status?: number;
  // 'permission': DASH may not read the location — the clock card then offers "Open settings".
  code?: 'permission';
  constructor(message: string, status?: number, code?: 'permission') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type Fix = { lat: number; lng: number; accuracy: number };

function withTimeout<T>(p: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ClockError(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// One fresh, high-accuracy fix (the web asks for enableHighAccuracy, maximumAge 0, 20 s timeout).
export async function getPosition(): Promise<Fix> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new ClockError('Location is off for DASH. Turn it on in Settings, then try again.', undefined, 'permission');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new ClockError('Location is turned off on this phone. Turn it on and try again.');
  }
  let pos: Location.LocationObject;
  try {
    pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
      20000,
      'Getting your location timed out. Try again near a window.',
    );
  } catch (e) {
    if (e instanceof ClockError) throw e;
    throw new ClockError('Could not determine your location. Try again.');
  }
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy ?? 9999) };
}

export type PunchKind = 'in' | 'out';
// `fix`: a position already taken (the clock-out sheet gets it BEFORE saving the timesheet, so a bad
// fix never leaves a saved timesheet behind); without it the punch takes its own.
export type PunchVars = { kind: PunchKind; mode: ClockFix['mode']; onFix?: (f: Fix) => void; fix?: Fix };

function refreshAfterPunch(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['att-today'] });
  void qc.invalidateQueries({ queryKey: ['att-month'] });
  void qc.invalidateQueries({ queryKey: ['att-ts-week'] });
  void qc.invalidateQueries({ queryKey: ['att-team'] });
}

export function usePunch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, mode, onFix, fix: given }: PunchVars) => {
      const fix = given ?? (await getPosition());
      onFix?.(fix);
      const r = await (kind === 'in' ? clockIn : clockOut)({ ...fix, mode });
      if (isApiError(r)) throw new ClockError(r.error, r.status);
      return r.record;
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshAfterPunch(qc);
    },
    onError: (e) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // 409: already clocked in / out (another phone or tab) — reload today so the card shows the truth.
      if (e instanceof ClockError && e.status === 409) refreshAfterPunch(qc);
    },
  });
}
