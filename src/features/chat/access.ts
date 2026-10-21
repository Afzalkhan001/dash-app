// Chat domain gates (Meets: text chat + attachments), ported from dash.html. Pure functions only.
// Spec: docs/port/meets.md §1.1. The server (meets.js) never checks a role: every /api/meets/* route is
// open to any signed-in staff session and decides by conversation membership, so the gates below are
// the website's own and nothing stricter — except the company switch (see canSeeMeets).

import type { Tenant } from '@/api/me';
import { tenantFeatureOn } from '@/lib/access';

type ChatUser = { id?: string | null; role?: string | null } | null | undefined;

/**
 * Meets is for everyone who is signed in — dash.html:7000 `canSeeMeetsNav(user){return !!user;}` —
 * in every role, master_admin included (the launcher is mounted for every signed-in user, :30525).
 *
 * The company switch "Meets (chat & calls)" (FEATURE_REGISTRY, dash.html:1394) hides nothing on the
 * website, because no sidebar item has id 'meets' (spec §1.1, risk R7). The spec (§4.1) has the app
 * honour it, which is stricter and harmless; owner decision D6 may flip this. Never for master_admin,
 * the same as the website's navFor filter (dash.html:1506).
 */
export const HONOUR_MEETS_SWITCH = true;

export function canSeeMeets(user: ChatUser, tenant: Tenant | null | undefined) {
  if (!user || !user.id) return false;
  if (!HONOUR_MEETS_SWITCH || user.role === 'master_admin') return true;
  return tenantFeatureOn(tenant, 'meets');
}

type MembershipLike = { myRole?: string | null; leftAt?: string | null; type?: string | null } | null | undefined;

/**
 * Manage a group (add people, remove someone, rename): MeetsMembersModal, dash.html:7240
 * `canManage = ['owner','admin'].includes(conversation.myRole) && !conversation.leftAt` — groups only
 * (the members button shows for groups only, and meets.js:968/1023/947 refuse a direct chat).
 */
export function canManageGroup(c: MembershipLike) {
  return !!c && c.type === 'group' && (c.myRole === 'owner' || c.myRole === 'admin') && !c.leftAt;
}

/** Remove a member: canManage and never the owner (dash.html:7269 `canManage && m.role !== 'owner'`). */
export function canRemoveMember(c: MembershipLike, member: { role?: string | null; leftAt?: string | null; id?: string } | null | undefined, meId?: string | null) {
  return canManageGroup(c) && !!member && member.role !== 'owner' && !member.leftAt && member.id !== meId;
}

/** Leave: a group, while I can still post (dash.html:10088, the Leave button shows for `group && canPost`). */
export function canLeaveGroup(c: (MembershipLike & { canPost?: boolean }) | null | undefined) {
  return !!c && c.type === 'group' && !c.leftAt && c.canPost !== false;
}

/** Delete a message: only my own, not already deleted, while I am a current member (meets.js:1475). */
export function canDeleteMessage(m: { senderId?: string | null; deleted?: boolean } | null | undefined, meId: string | null | undefined, canPost: boolean) {
  return !!m && !!meId && canPost && !m.deleted && String(m.senderId) === String(meId);
}
