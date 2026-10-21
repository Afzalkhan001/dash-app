// Vendors — the website's Vendor Registrations (dash.html:24954) and Vendor Master (:25830) in one list,
// for Accounts: /admin/accounts/vendors?tab=<waiting|corrections|approved|rejected|all>.
//   tabs      Waiting (pending_verification) · Corrections · Approved (the vendor list) · Rejected · All
//             — only Approved when the company has Vendor Master on but registrations off
//   search    name, vendor ID, contact, PAN, GSTIN, email (the server searches; 350 ms after typing stops)
//   filters   GST registered / not, MSME, PAN not linked to Aadhaar, sent between two dates
//   link      "Share the registration link" — DASH's /vendor page, through the phone's share sheet
// Rows open the vendor. The vendor list's Excel and PDF exports stay on the website.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Link2, Search, SlidersHorizontal, Store } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';

import { type AccountsVendorRow, useAccountsVendors, type VendorListFilters } from '@/api/accounts';
import { DASH_URL } from '@/config';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeRegistrations, canSeeVendorMaster } from '@/features/accounts/access';
import { panAadhaarLabel, vendorStatusMeta } from '@/features/accounts/vendor-format';
import { shortDate } from '@/features/petty-cash/logic';
import { useAccess } from '@/lib/use-access';
import { palette, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { AccountRow, ActivityList, ActivityRow, Button, DateField, EmptyState, ErrorState, NavHeader, PillField, PillSelector, Screen, Segmented, SelectField, Sheet, SkeletonList, toast } from '@/ui';

type Tab = 'waiting' | 'corrections' | 'approved' | 'rejected' | 'all';
const TAB_STATUS: Record<Tab, string> = { waiting: 'pending_verification', corrections: 'correction_required', approved: 'approved', rejected: 'rejected', all: 'all' };
const TABS: { key: Tab; label: string }[] = [
  { key: 'waiting', label: 'Waiting' },
  { key: 'corrections', label: 'Corrections' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];
const isTab = (s: unknown): s is Tab => typeof s === 'string' && TABS.some((t) => t.key === s);

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function VendorsScreen() {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const params = useLocalSearchParams<{ tab?: string }>();
  const regs = canSeeRegistrations(access);
  const master = canSeeVendorMaster(access);
  const tabs = regs ? TABS : TABS.filter((t) => t.key === 'approved');
  const [tab, setTab] = useState<Tab>(isTab(params.tab) && tabs.some((t) => t.key === params.tab) ? params.tab : regs ? 'waiting' : 'approved');
  const [q, setQ] = useState('');
  const [gst, setGst] = useState<'' | 'registered' | 'not_registered'>('');
  const [msme, setMsme] = useState<'' | 'yes' | 'no'>('');
  const [aadhaar, setAadhaar] = useState<'' | 'not_linked'>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(false);
  const needle = useDebounced(q, 350);
  const filters: VendorListFilters = { status: TAB_STATUS[tab], q: needle, gst, msme, aadhaar, from, to };
  const listQ = useAccountsVendors(filters, regs || master);

  if (!regs && !master) return <Redirect href="/" />;

  const rows: AccountsVendorRow[] = listQ.data ?? [];
  const filterCount = [gst, msme, aadhaar, from, to].filter(Boolean).length;
  const share = async () => {
    try {
      await Share.share({ message: `Register as a vendor with us on DASH: ${DASH_URL}/vendor` });
    } catch {
      toast.show('Couldn’t open the share sheet', 'danger');
    }
  };

  return (
    <Screen header={<NavHeader title="Vendors" />} onRefresh={() => listQ.refetch()}>
      {regs ? (
        <AccountRow icon={Link2} module="vendor" title="Registration link" sub={`${DASH_URL.replace(/^https?:\/\//, '')}/vendor`} actionLabel="Share" onPress={() => void share()} hint="Opens the share sheet with the vendor sign-up link" />
      ) : null}
      {tabs.length > 1 ? <Segmented options={tabs} value={tab} onChange={setTab} /> : null}
      <View style={styles.searchRow}>
        <PillField icon={Search} placeholder="Name, vendor ID, PAN, phone…" value={q} onChangeText={setQ} autoCorrect={false} autoCapitalize="none" returnKeyType="search" containerStyle={styles.search} accessibilityLabel="Search vendors" />
        <PillSelector icon={SlidersHorizontal} label={filterCount ? `Filters · ${filterCount}` : 'Filters'} onPress={() => setOpen(true)} accessibilityHint="Opens the filters" />
      </View>

      {listQ.isPending ? (
        <SkeletonList rows={5} avatar />
      ) : listQ.isError && !listQ.data ? (
        <ErrorState
          message={/sign in|permission/i.test(listQ.error?.message || '') ? `${listQ.error?.message} Sign out and back in if your role changed.` : listQ.error?.message || 'Couldn’t load vendors.'}
          onRetry={() => void listQ.refetch()}
        />
      ) : rows.length ? (
        <ActivityList title={`${rows.length} ${rows.length === 1 ? 'vendor' : 'vendors'}`}>
          {rows.map((v) => {
            const st = vendorStatusMeta(v.status);
            const facts = [v.gstStatus === 'registered' ? 'GST' : v.gstStatus === 'not_registered' ? 'No GST' : null, v.msmeRegistered ? 'MSME' : null, v.panAadhaar === 'not_linked' ? panAadhaarLabel('not_linked') : null].filter(Boolean);
            return (
              <ActivityRow
                key={v.id}
                module="vendor"
                icon={Store}
                title={v.legalEntityName || v.tradeName || v.contactNumber}
                subtitle={[v.vendorCode, v.contactPerson].filter(Boolean).join(' · ') || v.contactNumber}
                note={[...facts, v.submittedAt ? `Sent ${shortDate(v.submittedAt, today)}` : null].filter(Boolean).join(' · ') || null}
                status={{ label: st.label, tone: st.tone }}
                chevron
                onPress={() => router.push({ pathname: '/admin/accounts/vendors/[id]', params: { id: v.id } })}
              />
            );
          })}
        </ActivityList>
      ) : (
        <EmptyState
          icon={<Store color={palette.textMuted} strokeWidth={1.8} />}
          title={needle || filterCount ? 'No matches' : tab === 'waiting' ? 'Nothing to review' : 'No vendors here'}
          message={needle || filterCount ? 'Nothing matches the search and filters.' : tab === 'waiting' ? 'New registrations show up here once a vendor sends theirs.' : 'There are no vendors in this list yet.'}
        />
      )}

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Filters"
        footer={
          <Button
            title="Clear filters"
            variant="ghost"
            disabled={!filterCount}
            onPress={() => {
              setGst('');
              setMsme('');
              setAadhaar('');
              setFrom('');
              setTo('');
            }}
          />
        }>
        <View style={styles.sheet}>
          <SelectField
            label="GST"
            value={gst}
            options={[
              { value: '', label: 'Any' },
              { value: 'registered', label: 'GST registered' },
              { value: 'not_registered', label: 'Not GST registered' },
            ]}
            onChange={setGst}
          />
          <SelectField
            label="MSME"
            value={msme}
            options={[
              { value: '', label: 'Any' },
              { value: 'yes', label: 'MSME registered' },
              { value: 'no', label: 'Not MSME' },
            ]}
            onChange={setMsme}
          />
          <SelectField
            label="PAN and Aadhaar"
            value={aadhaar}
            options={[
              { value: '', label: 'Any' },
              { value: 'not_linked', label: 'PAN not linked to Aadhaar' },
            ]}
            onChange={setAadhaar}
          />
          <DateField label="Sent from" value={from} onChange={setFrom} maximumDate={to || today} />
          <DateField label="Sent to" value={to} onChange={setTo} minimumDate={from || undefined} maximumDate={today} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  search: { flexGrow: 1, flexBasis: 200, minWidth: 0 },
  sheet: { gap: space.md },
}));
