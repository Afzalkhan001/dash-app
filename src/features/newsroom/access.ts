// Newsroom domain (wave 2) — the gates for the News studio and the office TVs, ported from dash.html.
// Spec: docs/port/hr-people.md §0, §1.G, §4.7–4.8.
//
//   News studio      the Announcements page (sidebar id `announcements`, navForRaw dash.html:1531 + the
//                    company switch) for a creator: isAnnouncementCreator (dash.html:11867 /
//                    server.js:7615) — hr, it_admin, super_admin, ceo, coo, or anyone on
//                    tenant.announcementCreators (employee number or exact name).
//   Edit / Delete    only a post I made, unless I am Super Admin (AnnouncementsPage :19523
//                    `user.role==='super_admin'||a.createdBy===user.name`). The server lets any creator
//                    change any post; the app follows the website, as PLAN §5 asks.
//   News settings    the birthday / work-anniversary switches and the HR WhatsApp number: hr and
//                    super_admin only (canToggleCelebrations :19405). "Send test" is
//                    POST /celebration/test-send (server.js:2831: master_admin, super_admin, hr).
//   Office TVs       TvDisplaysCard lives in Config (dash.html:3585), whose menu is super_admin's (ceo
//                    and coo share it). The server would let every USER_ADMIN role in; the app stays
//                    with the website.
//   Who can post     AnnouncementCreatorsCard (Config :3141) — the company domain's
//                    /admin/company/settings/access/news screen (web('config')).

import type { Announcement } from '@/api/announcements';
import type { Tenant } from '@/api/me';
import { isAnnouncementCreator, type NavUser, webNav } from '@/lib/access';

type U = NavUser | null | undefined;
type T = Tenant | null | undefined;

const role = (u: U) => String(u?.role ?? '');

/** The News studio: the website's Announcements page in Create Mode. */
export const canUseNewsStudio = (u: U, t: T) => !!u && webNav(u, 'announcements', t) && isAnnouncementCreator(u, t);

/** Edit / Delete on one post (dash.html:19523). */
export const canManagePost = (u: U, a: Pick<Announcement, 'createdBy'> | null | undefined) =>
  !!u && !!a && (role(u) === 'super_admin' || (!!u.name && a.createdBy === u.name));

/** Birthday / anniversary auto-posts and the HR WhatsApp number (dash.html:19405). */
export const canEditCelebrations = (u: U) => role(u) === 'hr' || role(u) === 'super_admin';

/** Office TVs (Config › TV Displays, dash.html:2864 / 3585). */
export const TV_ROLES = ['super_admin', 'ceo', 'coo'];
export const canSeeOfficeTvs = (u: U, t: T) => !!u && TV_ROLES.includes(role(u)) && webNav(u, 'config', t);

/** "Who can post news" — the Config list the company domain edits. */
export const canEditNewsCreators = (u: U, t: T) => !!u && webNav(u, 'config', t);
