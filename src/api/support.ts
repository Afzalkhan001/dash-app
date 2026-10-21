// Support (web: SupportView, dash.html ~L29187): raise an IT ticket / asset request / admin request
// / complaint, follow your own requests (History), and the read-only Support Centre directory
// (branch Wi-Fi and branch staff). Server: routes/tickets.js, routes/support.js.
//
//   GET  /tickets                → every ticket in the company; the web keeps fromId === me || fromEmail === me
//   POST /tickets                → the full record (client-built, exactly like submitTicket/submitAsset/…)
//   PUT  /tickets/:id            { status: 'cancelled', cancelledAt, cancelledBy } — the raiser may only withdraw
//   GET  /support_branches       → config lists: { listType: 'admin_item' | 'complaint_type', label }
//   GET  /support_wifi           → { branch, wifiName, password }
//   GET  /support_staff          → { branch, designation, name, mobile, active }
//   GET  /support_temp_staff     → temp staff (the server drops expired rows itself)
//   GET  /users, /departments    → contact details of the assignee, my department name

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';

export type TicketCategory = 'ticket' | 'asset' | 'admin_request' | 'complaint';

export type Ticket = {
  id: string;
  category?: TicketCategory | string;
  type?: string;
  subject?: string;
  desc?: string;
  priority?: string;
  assetType?: string;
  itemType?: string;
  quantity?: number;
  urgency?: string;
  reason?: string;
  status: string;
  date?: string;
  createdAt?: string;
  from?: string;
  raisedByName?: string;
  fromEmail?: string;
  fromId?: string;
  raisedById?: string;
  fromPhone?: string;
  dept?: string;
  kekaCode?: string;
  assignedTo?: string;
  acceptedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  resolution?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  [k: string]: unknown;
};

export type ConfigItem = { id: string; listType: 'admin_item' | 'complaint_type' | string; label: string };
export type WifiEntry = { id: string; branch: string; wifiName: string; password: string };
export type StaffEntry = { id: string; branch: string; designation: string; name: string; mobile: string; active?: boolean; isTemp?: boolean };
export type TempStaffEntry = StaffEntry & { days?: number; createdAt?: string; expiresAt?: string };
export type DirectoryUser = { id: string; name: string; email?: string; mobile?: string; phone?: string; dept?: string; deptName?: string };
export type Department = { id: string; name: string };

export const supportKeys = {
  tickets: (userId?: string) => ['support-tickets', userId] as const,
  config: (userId?: string) => ['support-config', userId] as const,
  wifi: (userId?: string) => ['support-wifi', userId] as const,
  staff: (userId?: string) => ['support-staff', userId] as const,
  tempStaff: (userId?: string) => ['support-temp-staff', userId] as const,
  users: (userId?: string) => ['support-users', userId] as const,
  departments: (userId?: string) => ['support-departments', userId] as const,
};

// Only my own requests are kept in the cache (the full list is the whole company's).
export function useMyTickets() {
  const user = useSession((s) => s.user);
  return useQuery({
    queryKey: supportKeys.tickets(user?.id),
    enabled: !!user?.id,
    queryFn: async ({ signal }) => {
      const all = await unwrap(api.get<Ticket[]>('/tickets', signal));
      const list = Array.isArray(all) ? all : [];
      return list.filter((t) => t && (t.fromId === user?.id || (!!user?.email && t.fromEmail === user.email)));
    },
  });
}

function useList<T>(key: readonly unknown[], path: string, enabled = true, staleTime = 5 * 60_000) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({
    queryKey: key,
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const r = await unwrap(api.get<T[]>(path, signal));
      return Array.isArray(r) ? r : [];
    },
    staleTime,
  });
}

export function useSupportConfig(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useList<ConfigItem>(supportKeys.config(userId), '/support_branches', enabled);
}
export function useSupportWifi(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useList<WifiEntry>(supportKeys.wifi(userId), '/support_wifi', enabled);
}
export function useSupportStaff(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useList<StaffEntry>(supportKeys.staff(userId), '/support_staff', enabled);
}
export function useSupportTempStaff(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useList<TempStaffEntry>(supportKeys.tempStaff(userId), '/support_temp_staff', enabled, 60_000);
}

// The company's people, slimmed to what these screens read (name → contact, department). The list
// itself carries no photos (the server strips avatars from /users). Exposed as query options too,
// so My Tasks can make sure it is loaded before deciding whether a Start/End needs a code.
export const directoryUsersQuery = (userId?: string) =>
  queryOptions({
    queryKey: supportKeys.users(userId),
    queryFn: async ({ signal }): Promise<DirectoryUser[]> => {
      const r = await unwrap(api.get<DirectoryUser[]>('/users', signal));
      return (Array.isArray(r) ? r : [])
        .filter((u) => u && u.id)
        .map((u) => ({ id: u.id, name: u.name || '', email: u.email, mobile: u.mobile, phone: u.phone, dept: u.dept, deptName: u.deptName }));
    },
    staleTime: 10 * 60_000,
  });

export function useDirectoryUsers(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({ ...directoryUsersQuery(userId), enabled: enabled && !!userId });
}

export const departmentsQuery = (userId?: string) =>
  queryOptions({
    queryKey: supportKeys.departments(userId),
    queryFn: async ({ signal }): Promise<Department[]> => {
      const r = await unwrap(api.get<Department[]>('/departments', signal));
      return (Array.isArray(r) ? r : []).map((d) => ({ id: d.id, name: d.name || '' }));
    },
    staleTime: 10 * 60_000,
  });

export function useDepartments(enabled = true) {
  const userId = useSession((s) => s.user?.id);
  return useQuery({ ...departmentsQuery(userId), enabled: enabled && !!userId });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  return useMutation({
    mutationFn: (record: Ticket) => unwrap(api.post<{ ok: true; t: Ticket }>('/tickets', record)),
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.tickets(userId) }),
  });
}

// "Cancel this request? This cannot be undone." — the only status change the raiser may make.
export function useCancelTicket() {
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.put<{ ok: true }>(`/tickets/${encodeURIComponent(id)}`, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelledBy: user?.name || '',
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: supportKeys.tickets(user?.id) }),
  });
}
