// Decisions made in this app since it opened — the Inbox summary's "Done today" card counts them
// together with the decided lists already in the cache (features/inbox/summary). Past decisions only
// reads those lists when it is opened, so without this a request approved a minute ago would not be
// counted until then. Kept in memory only (nothing is fetched or stored), per signed-in person.

import { useSyncExternalStore } from 'react';

import type { Decision } from '@/api/inbox';

export type SessionDecision = {
  /** The Inbox item key ('leave:<id>', 'keka:<id>', …), so a cached copy of the same request isn't counted twice. */
  key: string;
  userId: string;
  decision: Decision;
  /** When it was decided (ISO). */
  at: string;
};

let decisions: SessionDecision[] = [];
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const read = () => decisions;

/** Call from a decision's onSuccess (an event handler, never during render). */
export function noteDecision(key: string, userId: string | undefined, decision: Decision) {
  if (!key || !userId) return;
  decisions = [...decisions.filter((d) => d.key !== key || d.userId !== userId), { key, userId, decision, at: new Date().toISOString() }];
  listeners.forEach((fn) => fn());
}

/** This person's decisions made in the app since it opened. */
export function useSessionDecisions(userId: string | undefined): SessionDecision[] {
  const all = useSyncExternalStore(subscribe, read, read);
  return userId ? all.filter((d) => d.userId === userId) : [];
}
