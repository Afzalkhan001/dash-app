// "Visitors" for the signed-in employee (visitors.js, EMPLOYEE section ~L666): who is waiting
// downstairs for me, guests I have invited, and my past visitors. Same requests as the web's
// MyVisitorsHub / VisitorInvites (dash.html ~L35577–35690).
//
//   GET    /visitors/mine                → { pending: Visit[], history: Visit[] }   (pending = pending|no_response)
//   POST   /visitors/:id/decide          { decision: 'approve' | 'reject' }        (no note — the server takes none)
//   GET    /visitors/invites             → { invites: Invite[] }
//   POST   /visitors/invites             { guestName, guestMobile, visitDate, timeFrom, timeTo, purpose } → { id, code, visitDate, guestName }
//   DELETE /visitors/invites/:id         cancel (the guest is NOT told)
//   GET    /visitors/invites/:id/pass    → image/png (authenticated download)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';
import { downloadAuthed, shareFile } from '@/lib/files';

export type VisitStatus = 'pending' | 'approved' | 'rejected' | 'no_response' | 'checked_out';

// shapeVisit() in visitors.js. photoUrl is a short-lived signed Storage URL (no auth header needed).
export type Visit = {
  id: string;
  hostUserId: string;
  hostName: string;
  visitorName: string;
  visitorMobile: string;
  purpose: string;
  source?: string;
  inviteId?: string | null;
  status: VisitStatus | string;
  createdAt: string;
  decidedAt?: string | null;
  /** 'app' / 'whatsapp' (the host) · 'desk' (the desk, for the host) · 'desk_override' (the desk let them in after the host's 5 minutes). */
  decidedVia?: string;
  decidedBy?: string;
  /** When the desk may let this visitor in without the host (created + LET_IN_AFTER_MIN; meaningful while waiting). */
  letInAt?: string;
  /** Minutes they waited for an answer, once there is one (null until then). */
  waitedMin?: number | null;
  checkOutAt?: string | null;
  workDate?: string;
  photoUrl: string;
  photoPurged: boolean;
};

export type InviteStatus = 'active' | 'used' | 'cancelled';

export type Invite = {
  id: string;
  guestName: string;
  guestMobile: string;
  visitDate: string; // YYYY-MM-DD
  timeFrom: string; // HH:MM or ''
  timeTo: string;
  purpose: string;
  code: string;
  status: InviteStatus | string;
  usedAt?: string | null;
  createdAt?: string;
};

export type InviteInput = {
  guestName: string;
  guestMobile: string;
  visitDate: string;
  timeFrom: string;
  timeTo: string;
  purpose: string;
};

export type InviteCreated = { ok: true; id: string; code: string; visitDate: string; guestName: string };

export const visitorKeys = {
  mine: (userId?: string) => ['visitors-mine', userId] as const,
  invites: (userId?: string) => ['visitors-invites', userId] as const,
};

// `poll` — refetch every 30 s (the screen passes "is focused"). The Inbox badge can call this with
// poll=false and read `data.pending.length`.
export function useMyVisitors({ poll = false, enabled = true }: { poll?: boolean; enabled?: boolean } = {}) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: visitorKeys.mine(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ ok: true; pending: Visit[]; history: Visit[] }>('/visitors/mine', signal));
      return { pending: Array.isArray(r.pending) ? r.pending : [], history: Array.isArray(r.history) ? r.history : [] };
    },
    refetchInterval: poll ? 30_000 : false,
  });
}

export function useMyInvites(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: visitorKeys.invites(userId),
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<{ ok: true; invites: Invite[] }>('/visitors/invites', signal));
      return Array.isArray(r.invites) ? r.invites : [];
    },
  });
}

export function useDecideVisit() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      unwrap(api.post<{ ok: true; id: string; status: string }>(`/visitors/${encodeURIComponent(id)}/decide`, { decision })),
    // Reload either way, exactly like the web: a 409 ("already approved") still means the list is stale.
    // The Inbox keeps its own copy of who is waiting (['inbox', 'visitors', …]) — refresh that too, and
    // the visitor desk's board (['inbox', 'desk', …], api/desk.ts) for a Super Admin who is also a host.
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: visitorKeys.mine(userId) }),
        qc.invalidateQueries({ queryKey: ['inbox', 'visitors'] }),
        qc.invalidateQueries({ queryKey: ['inbox', 'desk'] }),
      ]),
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return useMutation({
    mutationFn: (input: InviteInput) => unwrap(api.post<InviteCreated>('/visitors/invites', { ...input, guestName: input.guestName.trim() })),
    onSuccess: () => qc.invalidateQueries({ queryKey: visitorKeys.invites(userId) }),
  });
}

export function useCancelInvite() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return useMutation({
    mutationFn: (id: string) => unwrap(api.del<{ ok: true }>(`/visitors/invites/${encodeURIComponent(id)}`)),
    onSettled: () => qc.invalidateQueries({ queryKey: visitorKeys.invites(userId) }),
  });
}

// The web saves the PNG as visitor-pass-<Guest-Name>.png; here it is downloaded with the bearer
// header and handed to the share sheet (WhatsApp, Save to Photos/Files, …).
export function passFileName(guestName?: string) {
  const safe = String(guestName || 'guest').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guest';
  return `visitor-pass-${safe}.png`;
}

export async function shareInvitePass(invite: { id: string; guestName?: string }) {
  const uri = await downloadAuthed(`/visitors/invites/${encodeURIComponent(invite.id)}/pass`, passFileName(invite.guestName));
  await shareFile(uri, 'image/png', 'Visitor pass');
}
