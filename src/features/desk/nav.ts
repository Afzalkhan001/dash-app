// Desk domain — what the visitor desk adds to More, the + sheet and Home (docs/port/visitor-desk.md §4.1).
//   More › Reception   Visitor desk · Kiosk mode · Visitor log · Invites · Check-in link, for both desk
//                      roles (visitor_manager: visitors-dashboard…visitors-qr; super_admin: visitors-desk).
//   + sheet            "Start kiosk" and "Invite visitor" for the Visitor Manager (the Super Admin already
//                      has the built-in "Invite a visitor"; its kiosk is one row away in More).
//   Home               the desk hero for the Visitor Manager (instead of the light Today card).
// Pure: decided from `access` only (features/desk/access.ts holds the gates, cited to dash.html).

import { History, LayoutDashboard, MonitorSmartphone, QrCode, Ticket, UserPlus } from 'lucide-react-native';

import { canSeeDeskBoard, canSeeDeskInvites, canSeeDeskQr, canSeeKiosk, canSeeVisitorLog, isDeskRole, isVisitorManager } from '@/features/desk/access';
import { DeskHeroCard } from '@/features/desk/home-card';
import { DESK_ROUTES } from '@/features/desk/routes';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  if (!isDeskRole(access.user)) return [];
  const rows: WorkspaceRow[] = [];
  if (canSeeDeskBoard(access)) {
    rows.push({
      key: 'desk.board',
      section: 'reception',
      label: 'Visitor desk',
      subtitle: 'Who is in the building and who is waiting',
      href: DESK_ROUTES.board,
      icon: LayoutDashboard,
      module: 'visitors',
      order: 10,
      tourId: 'more.desk.board',
    });
  }
  if (canSeeKiosk(access)) {
    rows.push({
      key: 'desk.kiosk',
      section: 'reception',
      label: 'Kiosk mode',
      subtitle: 'Turn this phone into a check-in stand for the lobby',
      href: DESK_ROUTES.kiosk,
      icon: MonitorSmartphone,
      module: 'visitors',
      order: 15,
      tourId: 'more.desk.kiosk',
    });
  }
  if (canSeeVisitorLog(access)) {
    rows.push({ key: 'desk.log', section: 'reception', label: 'Visitor log', subtitle: 'Every visit, searchable by name or date', href: DESK_ROUTES.log, icon: History, module: 'visitors', order: 20 });
  }
  if (canSeeDeskInvites(access)) {
    rows.push({ key: 'desk.invites', section: 'reception', label: 'Invites', subtitle: 'Guests you invited and their codes', href: DESK_ROUTES.invites, icon: Ticket, module: 'visitors', order: 30 });
  }
  if (canSeeDeskQr(access)) {
    rows.push({
      key: 'desk.qr',
      section: 'reception',
      label: 'Check-in link',
      subtitle: 'The link behind the reception QR code',
      href: DESK_ROUTES.qr,
      icon: QrCode,
      module: 'visitors',
      order: 40,
      tourId: 'more.desk.qr',
    });
  }
  return rows;
}

export function createActions(access: Access): CreateAction[] {
  if (!isVisitorManager(access.user)) return [];
  const out: CreateAction[] = [];
  if (canSeeKiosk(access)) {
    out.push({ key: 'desk.kiosk', label: 'Start kiosk', href: DESK_ROUTES.kiosk, icon: MonitorSmartphone, module: 'visitors', hint: 'Opens the lobby check-in stand' });
  }
  if (canSeeDeskInvites(access)) {
    out.push({ key: 'desk.invite', label: 'Invite visitor', href: DESK_ROUTES.invite, icon: UserPlus, module: 'visitors', hint: 'Send a guest an entry code' });
  }
  return out;
}

export function homeCards(access: Access): HomeCard[] {
  if (!isVisitorManager(access.user) || !canSeeDeskBoard(access)) return [];
  return [{ key: 'desk.hero', placement: 'hero', Card: DeskHeroCard }];
}
