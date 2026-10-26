// Newsroom domain (wave 2) — what it adds to More, the + sheet and Home.
//   More › Workspace   "News studio" (Company) for people who can post news (canUseNewsStudio:
//                      the Announcements page + isAnnouncementCreator); "Office TVs" (IT & office) for
//                      Super Admin, CEO and COO (Config › TV Displays on the website).
//   + sheet            "Post announcement" for the same people as the studio.
//   Home               nothing (the News section and banner already show the posts).
// Pure: reads `access` only.

import { Megaphone, PenLine, Tv } from 'lucide-react-native';

import { canSeeOfficeTvs, canUseNewsStudio } from '@/features/newsroom/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const u = access.user;
  const t = access.tenant;
  if (!u) return [];
  const rows: WorkspaceRow[] = [];
  if (canUseNewsStudio(u, t)) {
    rows.push({
      key: 'newsroom.studio',
      section: 'company',
      label: 'News studio',
      subtitle: 'Post news, pop-ups and schedule them',
      href: '/admin/news',
      icon: Megaphone,
      module: 'news',
      order: 60,
      tourId: 'more.newsroom.studio',
    });
  }
  if (canSeeOfficeTvs(u, t)) {
    rows.push({
      key: 'newsroom.tvs',
      section: 'it',
      label: 'Office TVs',
      subtitle: 'Pair TVs and show posts on them',
      href: '/admin/news/tvs',
      icon: Tv,
      module: 'news',
      order: 70,
      tourId: 'more.newsroom.tvs',
    });
  }
  return rows;
}

export function createActions(access: Access): CreateAction[] {
  if (!canUseNewsStudio(access.user, access.tenant)) return [];
  return [{ key: 'newsroom.post', label: 'Post announcement', href: '/admin/news/compose', icon: PenLine, module: 'news', hint: 'Opens a new post for everyone', order: 60 }];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
