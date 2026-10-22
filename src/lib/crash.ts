// Crash reporting without a server: an error that would close the app is written to a small file
// (synchronously, before the app goes down); the next launch shows it once with a Share button, so
// the person can send the exact message to whoever supports the app. Screen render errors are caught
// by the root ErrorBoundary (src/app/_layout.tsx) instead and shown in place.

import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsShape = { getGlobalHandler: () => GlobalHandler; setGlobalHandler: (h: GlobalHandler) => void };

const FILE_NAME = 'dash-last-crash.txt';

function crashFile() {
  return new File(Paths.document, FILE_NAME);
}

/** A plain-text report: what happened, where, and on which build. */
export function describeError(error: unknown, where: string) {
  const e = error instanceof Error ? error : new Error(String(error));
  const stack = (e.stack || '').split('\n').slice(0, 12).join('\n');
  return [
    `DASH ${Constants.expoConfig?.version ?? '?'} · ${Platform.OS} ${String(Platform.Version)} · ${where}`,
    new Date().toISOString(),
    `${e.name}: ${e.message}`,
    stack,
  ].join('\n');
}

export function saveCrash(report: string) {
  if (Platform.OS === 'web') return;
  try {
    crashFile().write(report);
  } catch {
    // nothing more we can do while the app is going down
  }
}

/** The report left by the last crash, once (it is deleted when read). */
export function takeLastCrash(): string | null {
  if (Platform.OS === 'web') return null;
  try {
    const f = crashFile();
    if (!f.exists) return null;
    const text = f.textSync();
    f.delete();
    return text || null;
  } catch {
    return null;
  }
}

let installed = false;

/** Install once at startup: records fatal JS errors before React Native's default handler runs. */
export function installCrashReporter() {
  if (installed) return;
  installed = true;
  const EU = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (!EU) return;
  const previous = EU.getGlobalHandler();
  EU.setGlobalHandler((error, isFatal) => {
    if (isFatal) saveCrash(describeError(error, 'fatal'));
    previous(error, isFatal);
  });
}
