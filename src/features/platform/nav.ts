// Platform domain (wave 3) — what it adds to More, the + sheet and Home, for the platform owner
// (master_admin) only.
//   More › Workspace › Platform   Companies, Company wallets, Company features — each only with the
//                                 website's sidebar item (features/platform/access.ts).
//   Home                          "Companies on DASH" hero (count, people on DASH) with the three shortcuts.
//   + sheet                       nothing: registering a company and adding coins are rare, deliberate
//                                 tasks that start from their own screens.
// Pure: reads `access` only.

import { Building2, Coins, ToggleRight } from 'lucide-react-native';

import { canSeeCompanies, canSeeCompanyFeatures, canSeeCompanyWallets, isPlatformOwner } from '@/features/platform/access';
import { PlatformHeroCard } from '@/features/platform/home-card';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const u = access.user;
  if (!u) return [];
  const rows: WorkspaceRow[] = [];
  if (canSeeCompanies(u)) {
    rows.push({
      key: 'platform.companies',
      section: 'platform',
      label: 'Companies',
      subtitle: 'Every company on DASH; register a new one',
      href: '/admin/platform/companies',
      icon: Building2,
      module: 'policies',
      order: 10,
      tourId: 'more.platform.companies',
    });
  }
  if (canSeeCompanyWallets(u)) {
    rows.push({
      key: 'platform.wallets',
      section: 'platform',
      label: 'Company wallets',
      subtitle: 'Add bounty coins to a company',
      href: '/admin/platform/wallets',
      icon: Coins,
      module: 'bounty',
      order: 20,
      tourId: 'more.platform.wallets',
    });
  }
  if (canSeeCompanyFeatures(u)) {
    rows.push({
      key: 'platform.features',
      section: 'platform',
      label: 'Company features',
      subtitle: 'Switch features and HR on or off for a company',
      href: '/admin/platform/features',
      icon: ToggleRight,
      module: 'security',
      order: 30,
      tourId: 'more.platform.features',
    });
  }
  return rows;
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(access: Access): HomeCard[] {
  if (!isPlatformOwner(access.user) || !canSeeCompanies(access.user)) return [];
  return [{ key: 'platform.hero', placement: 'hero', order: 10, Card: PlatformHeroCard }];
}
