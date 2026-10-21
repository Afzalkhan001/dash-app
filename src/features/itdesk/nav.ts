// IT desk — what it adds to More, the + sheet and Home. Pure: reads `access` only.
//   More › IT & office   "Assets" (IT Admin, `assets` switch), "Rooms & locations" (IT Admin, `rooms`
//                        switch), "Support centre" (Wi-Fi / staff for IT Admin, Super Admin, CEO, COO;
//                        office request lists for Admin, Super Admin, CEO, COO, App Manager)
//   + sheet              "Add asset" (IT Admin)
//   Home                 the equipment card (IT Admin): acknowledgements waiting, warranties ending
// Subscriptions (company domain) and the Service desk (servicedesk domain) sit in the same section.

import { Building2, LifeBuoy, Package, PackagePlus } from 'lucide-react-native';

import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';
import { canManageSupport, canSeeAssets, canSeeRooms, isSupportItAdmin } from '@/features/itdesk/access';
import { EquipmentCard } from '@/features/itdesk/home-card';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const rows: WorkspaceRow[] = [];
  if (canSeeAssets(access)) {
    rows.push({
      key: 'itdesk.assets',
      section: 'it',
      label: 'Assets',
      subtitle: 'Equipment, who has it and warranties',
      href: '/admin/it-desk/assets',
      icon: Package,
      module: 'support',
      order: 20,
      tourId: 'more.itdesk.assets',
    });
  }
  if (canSeeRooms(access)) {
    rows.push({
      key: 'itdesk.rooms',
      section: 'it',
      label: 'Rooms & locations',
      subtitle: 'Rooms, shoot locations, bookings and purposes',
      href: '/admin/it-desk/rooms',
      icon: Building2,
      module: 'support',
      order: 30,
      tourId: 'more.itdesk.rooms',
    });
  }
  if (canManageSupport(access)) {
    rows.push({
      key: 'itdesk.support',
      section: 'it',
      label: 'Support centre',
      subtitle: isSupportItAdmin(access.user?.role) ? 'Branch Wi-Fi, office contacts and temp staff' : 'Office request items and complaint types',
      href: '/admin/it-desk/support',
      icon: LifeBuoy,
      module: 'support',
      order: 40,
      tourId: 'more.itdesk.support',
    });
  }
  return rows;
}

export function createActions(access: Access): CreateAction[] {
  if (!canSeeAssets(access)) return [];
  return [{ key: 'itdesk.asset', label: 'Add asset', href: '/admin/it-desk/assets/new', icon: PackagePlus, module: 'support', hint: 'Opens a new asset form', order: 30 }];
}

export function homeCards(access: Access): HomeCard[] {
  if (!canSeeAssets(access)) return [];
  return [{ key: 'itdesk.equipment', placement: 'needs', order: 50, Card: EquipmentCard }];
}
