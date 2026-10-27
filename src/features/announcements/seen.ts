// "Has this person seen the new posts?" — the Home bell's red dot (features/home/header). A post is new
// while it was posted in the last 2 days (not a birthday or work anniversary) and this person hasn't
// seen it yet. Seen means it was listed on the Announcements screen while that screen was open, or
// opened on its own (from Home's News section, say). Before this the dot stayed for the whole 2 days,
// however many times the posts had been read.
//
// The server keeps no read state for announcements, so this is kept on the phone (AsyncStorage
// `dash.news.seen`), one list per person — the way the website keeps its pop-up "seen" marks in the
// browser (dash.html annPopupSeen, localStorage dash_ann_popup_seen). Marks older than 30 days are
// dropped (a post is only new for 2), and at most 200 are kept per person. Signing out does not clear
// it. Until the saved marks are read the dot stays off, so it never flashes on and off at launch.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { type Announcement, isCelebration } from '@/api/announcements';
import { useSession } from '@/auth/session';
import { postedWithin } from '@/features/announcements/parts';

/** How long a post counts as new, in days. */
export const NEW_NEWS_DAYS = 2;
const KEEP_MS = 30 * 86400000;
const MAX_PER_PERSON = 200;

/** Seen marks per person: user id → announcement id → when it was seen (ms). */
type SeenMarks = Record<string, Record<string, number>>;

type NewsSeenState = {
  byUser: SeenMarks;
  ready: boolean;
  markSeen: (uid: string, ids: string[]) => void;
  markReady: () => void;
};

const useNewsSeen = create<NewsSeenState>()(
  persist(
    (set, get) => ({
      byUser: {},
      ready: false, // the saved marks have been read (or reading them failed)
      markSeen: (uid, ids) => {
        if (!uid || !ids.length) return;
        const all = get().byUser;
        const mine = all && typeof all[uid] === 'object' && all[uid] ? all[uid] : {};
        const fresh = ids.filter((id) => !!id && !(id in mine));
        if (!fresh.length) return;
        const at = Date.now();
        const kept = Object.entries(mine)
          .filter(([, t]) => typeof t === 'number' && at - t < KEEP_MS)
          .sort((a, b) => b[1] - a[1])
          .slice(0, Math.max(0, MAX_PER_PERSON - fresh.length));
        const next: Record<string, number> = Object.fromEntries(kept);
        for (const id of fresh) next[id] = at;
        set({ byUser: { ...all, [uid]: next } });
      },
      markReady: () => set({ ready: true }),
    }),
    {
      name: 'dash.news.seen',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ byUser: s.byUser }),
      // Whatever an older version stored, keep only a map of maps.
      merge: (saved, current) => {
        const raw = saved && typeof saved === 'object' ? (saved as Partial<NewsSeenState>).byUser : undefined;
        return { ...current, byUser: raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {} };
      },
      // Runs after hydration, on success and on failure alike.
      onRehydrateStorage: (initial) => () => initial.markReady(),
    },
  ),
);

// No storage at all would mean nothing to wait for (and no hydration callback): don't hide the dot forever.
if (!useNewsSeen.persist.getOptions().storage) useNewsSeen.getState().markReady();

/** A post that lights the bell while unseen: posted in the last 2 days, and not a celebration card. */
export function isNewPost(a: Announcement | null | undefined, now?: number): a is Announcement {
  return !!a && a.id != null && !isCelebration(a) && postedWithin(a, NEW_NEWS_DAYS, now);
}

/** The ids of the new posts in a feed, for marking them seen. */
export function newPostIds(feed: (Announcement | null | undefined)[] | null | undefined, now?: number): string[] {
  return (Array.isArray(feed) ? feed : []).filter((a) => isNewPost(a, now)).map((a) => String(a!.id));
}

/** True while the feed holds a new post this person hasn't seen (false until the saved marks are read). */
export function useUnseenNews(feed: (Announcement | null | undefined)[] | null | undefined, now: number): boolean {
  const uid = useSession((s) => s.user?.id);
  const ready = useNewsSeen((s) => s.ready);
  const mine = useNewsSeen((s) => (uid ? s.byUser?.[uid] : undefined));
  if (!uid || !ready) return false;
  const seen = mine && typeof mine === 'object' ? mine : {};
  return newPostIds(feed, now).some((id) => !(id in seen));
}

/**
 * Marks these posts seen for the signed-in person while the calling screen is the one on show (and again
 * when a refresh brings in another new post while it is). Waits for the saved marks to be read first,
 * so a mark made at launch is never overwritten by them.
 */
export function useMarkNewsSeen(ids: string[]) {
  const uid = useSession((s) => s.user?.id);
  const ready = useNewsSeen((s) => s.ready);
  const markSeen = useNewsSeen((s) => s.markSeen);
  // One string, so the effect re-runs only when the set of ids changes.
  const key = ids.filter(Boolean).join('\n');
  useFocusEffect(
    useCallback(() => {
      if (uid && ready && key) markSeen(uid, key.split('\n'));
    }, [uid, ready, key, markSeen]),
  );
}
