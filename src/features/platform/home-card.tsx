// Home for the platform owner (master_admin, who never clocks in): a "Companies on DASH" hero — how
// many companies, how many people are on DASH across them (GET /users counted per company, since the
// stored `tenant.users` is never kept up to date), how many are suspended — then shortcuts to the three
// platform screens. Each shortcut follows the website's sidebar gate.

import { useRouter } from 'expo-router';
import { Building2, Coins, ToggleRight } from 'lucide-react-native';
import { View } from 'react-native';

import { useAllTenants } from '@/api/me';
import { companyStatus, countByCompany, usePlatformUsers } from '@/api/platform';
import { useSession } from '@/auth/session';
import { canSeeCompanies, canSeeCompanyFeatures, canSeeCompanyWallets } from '@/features/platform/access';
import { plural } from '@/lib/format';
import { radius } from '@/theme/tokens';
import { ErrorState, ListCard, ListRow, ModuleBadge, Skeleton, SummaryHero, TourTarget, useLayout } from '@/ui';

export function PlatformHeroCard() {
  const router = useRouter();
  const { gap } = useLayout();
  const user = useSession((s) => s.user);
  const tenantsQ = useAllTenants();
  const usersQ = usePlatformUsers();
  const tenants = tenantsQ.data;
  const counts = countByCompany(usersQ.data);
  const people = tenants ? tenants.reduce((s, t) => s + (counts.get(t.id) ?? 0), 0) : 0;
  const suspended = tenants ? tenants.filter((t) => companyStatus(t) === 'suspended').length : 0;
  const openCompanies = () => router.push('/admin/platform/companies');

  return (
    <View style={{ gap: gap - 4 }}>
      <TourTarget id="home.platform.hero" radius={radius.xl}>
        {tenants ? (
          <SummaryHero
            icon={Building2}
            module="policies"
            label="Companies on DASH"
            value={tenants.length}
            onArrowPress={openCompanies}
            arrowLabel="Open companies"
            info={
              usersQ.data
                ? { label: 'People on DASH', value: people.toLocaleString('en-IN'), onPress: openCompanies, accessibilityLabel: `${people} people on DASH. Open companies` }
                : undefined
            }
            sub={suspended ? `${plural(suspended, 'company', 'companies')} suspended` : 'Every company is active'}
          />
        ) : tenantsQ.isError ? (
          <ErrorState message={tenantsQ.error?.message ?? 'The companies could not be loaded.'} onRetry={() => void tenantsQ.refetch()} />
        ) : (
          <Skeleton height={190} radius={radius.xl} />
        )}
      </TourTarget>
      <ListCard>
        {canSeeCompanies(user) ? (
          <ListRow left={<ModuleBadge module="policies" icon={Building2} />} title="Companies" subtitle="Details, Super Admin, register a new one" chevron onPress={openCompanies} />
        ) : null}
        {canSeeCompanyWallets(user) ? (
          <ListRow
            left={<ModuleBadge module="bounty" icon={Coins} />}
            title="Company wallets"
            subtitle="Add or take back bounty coins"
            chevron
            onPress={() => router.push('/admin/platform/wallets')}
          />
        ) : null}
        {canSeeCompanyFeatures(user) ? (
          <ListRow
            left={<ModuleBadge module="security" icon={ToggleRight} />}
            title="Company features"
            subtitle="What each company can use"
            chevron
            onPress={() => router.push('/admin/platform/features')}
          />
        ) : null}
      </ListCard>
    </View>
  );
}
