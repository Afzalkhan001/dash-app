// Profile — the website's VendorDashboard "My Profile" tab, tidied like the staff app's More tab:
//   1. who you are (name, phone, Vendor ID on its own line, status and the approval date),
//   2. "Your details": one row per group (Business, Contact, Tax, Aadhaar, Bank account) showing its key
//      value; tapping opens the full details in a sheet, and — once approved — "Request a change"
//      there (Accounts reviews it; the server only takes change requests from approved vendors),
//   3. your change requests (latest 3) and your documents (each opens the file),
//   4. Account: password, Google (only when linked), "Email Tamada" (the Tamada contact's address, when
//      there is one), "Show me around"; then Sign out in a card of its own (POST /vendor/auth/logout,
//      then the token is forgotten).
// Look (docs/REFERENCE-COMPONENTS.md §3, Payno profile): the tab-root bar (centred "Profile"), a frosted
// profile card (initials avatar, the business name, phone, Vendor ID, status), then each group as an
// ActivityList — a small title (with a "See all" text link where there is more) over one card of rows.
// In the demo account (development builds only) a "Demo" row under the profile card opens the role
// picker, so every Afzal persona — vendor or staff — can be explored without signing out
// (features/demo/role-picker.tsx). The DEMO pill in the header says it is the demo.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { Building2, Fingerprint, KeyRound, Landmark, Link2, LogOut, Mail, Receipt, Shuffle, UserRound } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import { useVendorChangeRequests, useVendorMe, vendorSignOut } from '@/api/vendor';
import { useSession } from '@/auth/session';
import { isDemoToken } from '@/demo/config';
import { vendorPersonaFromToken } from '@/demo/vendor/personas';
import { useDemoRolePicker } from '@/features/demo/role-picker';
import { ShowMeAroundRow } from '@/features/tour/replay-row';
import { BUSINESS_TYPES, docLabel, vendorStatus } from '@/features/vendor/constants';
import { type FileSource, FileViewerSheet } from '@/features/vendor/files';
import { dateIN, maskTail, prettyPhone } from '@/features/vendor/format';
import { ChangeRequestItem, ChangeRequestSheet, DocumentItem, PasswordSheet, panAadhaarText } from '@/features/vendor/profile';
import { type InfoRow, InfoRows, useLastValue } from '@/features/vendor/ui';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  Avatar,
  Button,
  Card,
  ErrorState,
  IconBadge,
  ListRow,
  ModuleBadge,
  Screen,
  SeeAllLink,
  Sheet,
  Skeleton,
  SkeletonList,
  StatusPill,
  TabRootHeader,
  Text,
  toast,
  TourTarget,
  useLayout,
} from '@/ui';

type DetailSection = {
  key: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  rows: InfoRow[];
  changeFields?: string[];
};

// Rows wear the vendor module colour (Sign out has its own danger-tinted badge).
const rowIcon = (Icon: LucideIcon) => <ModuleBadge module="vendor" icon={Icon} />;

export default function VendorProfile() {
  const { gap } = useLayout();
  const me = useVendorMe();
  const v = me.data;
  const approved = v?.status === 'approved';
  const requests = useVendorChangeRequests(approved);
  const [pwOpen, setPwOpen] = useState(false);
  const [detail, setDetail] = useState<DetailSection | null>(null);
  const detailShown = useLastValue(detail); // keeps the sheet's rows while it fades out
  const [changeFields, setChangeFields] = useState<string[] | null>(null);
  const [viewing, setViewing] = useState<FileSource | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [allRequests, setAllRequests] = useState(false);
  const router = useRouter();
  // The demo's role switcher (isDemoToken is false in store builds).
  const demoToken = useSession((st) => (isDemoToken(st.token) ? st.token : null));
  const demoPersona = vendorPersonaFromToken(demoToken);
  const rolePicker = useDemoRolePicker({ onPicked: (_id, kind) => kind === 'vendor' && router.navigate('/portal') });

  const refresh = () => Promise.all([me.refetch(), ...(approved ? [requests.refetch()] : [])]);

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign back in with your mobile number.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void vendorSignOut();
        },
      },
    ]);
  }

  const header = <TabRootHeader overline="Vendor portal" title="Profile" />;

  if (me.isPending || !v) {
    return (
      <Screen withTabBar onRefresh={me.isPending ? undefined : () => me.refetch()} header={header}>
        {me.isPending ? (
          <View style={{ gap }}>
            <Skeleton height={120} radius={radius.xl} />
            <SkeletonList rows={4} avatar tone="surface" />
            <SkeletonList rows={3} avatar tone="surface" />
          </View>
        ) : (
          <View style={{ gap }}>
            <ErrorState message={me.error?.message ?? 'Could not load your profile.'} onRetry={() => void me.refetch()} />
            <Button title="Sign out" variant="danger" icon={<LogOut />} onPress={confirmSignOut} loading={signingOut} />
          </View>
        )}
      </Screen>
    );
  }

  const st = vendorStatus(v.status);
  const docs = (Array.isArray(v.documents) ? v.documents : []).filter((d) => d && typeof d.docType === 'string');
  const changeRequests = (Array.isArray(requests.data) ? requests.data : []).filter(Boolean);
  const shownRequests = allRequests ? changeRequests : changeRequests.slice(0, 3);
  const nonGst = v.gst?.status !== 'registered';
  const aad = v.kyc?.aadhaarVerification;
  const businessType = BUSINESS_TYPES.find((b) => b[0] === v.business?.businessType)?.[1] ?? v.business?.businessType;
  const name = v.business?.legalEntityName || 'Your registration';
  const gstWord = v.gst?.status === 'registered' ? 'GST registered' : v.gst?.status === 'not_registered' ? 'Not GST registered' : '';
  const verifiedDocs = docs.filter((d) => d.status === 'verified').length;
  const pocEmail = (v.business?.pocEmail || '').trim();

  function emailTamada() {
    void Linking.openURL(`mailto:${pocEmail}`).catch(() => toast.show(`Couldn’t open your email app. Write to ${pocEmail}.`, 'danger'));
  }

  const sections: DetailSection[] = [
    {
      key: 'business',
      title: 'Business',
      icon: Building2,
      summary: v.business?.tradeName || v.business?.legalEntityName || 'Not added yet',
      changeFields: ['legalEntityName'],
      rows: [
        { label: 'Legal entity name', value: v.business?.legalEntityName },
        { label: 'Trade name', value: v.business?.tradeName },
        { label: 'Business type', value: businessType },
        { label: 'Brand name', value: v.business?.brandName },
        { label: 'Registered address', value: v.business?.registeredAddress },
      ],
    },
    {
      key: 'contact',
      title: 'Contact',
      icon: UserRound,
      summary: v.email || prettyPhone(v.contactNumber) || 'Not added yet',
      rows: [
        ...(v.vendorCode ? [{ label: 'Vendor ID', value: v.vendorCode, mono: true }] : []),
        { label: 'Contact person', value: v.business?.contactPerson },
        { label: 'Designation', value: v.business?.designation },
        { label: 'Phone', value: prettyPhone(v.contactNumber) },
        { label: 'Email', value: v.email },
        { label: 'Tamada contact', value: v.business?.pocEmail },
      ],
    },
    {
      key: 'tax',
      title: 'Tax',
      icon: Receipt,
      summary: [v.tax?.pan ? `PAN ${v.tax.pan}` : '', gstWord].filter(Boolean).join(' · ') || 'Not added yet',
      changeFields: ['pan', 'gstin'],
      rows: [
        { label: 'PAN', value: v.tax?.pan, mono: true },
        ...(v.tax?.panHolderType ? [{ label: 'PAN holder type', value: v.tax.panHolderType }] : []),
        { label: 'PAN linked to Aadhaar', value: panAadhaarText(v) },
        { label: 'GST', value: gstWord },
        { label: 'GSTIN', value: v.gst?.gstin, mono: true },
        ...(v.gst?.status === 'registered' && v.kyc?.gstVerification?.verified
          ? [{ label: 'GST certificate checked', value: v.kyc.gstVerification.legalName || 'Yes' }]
          : []),
        { label: 'MSME (Udyam)', value: v.msme?.registered ? 'Registered' : 'Not registered' },
        { label: 'Udyam number', value: v.msme?.number, mono: true },
      ],
    },
    // Aadhaar is part of the NON-GST Digio check only; GST vendors verify via the certificate.
    ...(nonGst
      ? [
          {
            key: 'aadhaar',
            title: 'Aadhaar',
            icon: Fingerprint,
            summary: aad?.nameOnAadhaar || 'Not verified yet',
            rows: [
              { label: 'Name on Aadhaar', value: aad?.nameOnAadhaar },
              { label: 'Aadhaar (last 4)', value: aad?.last4 ? `••••••••${aad.last4}` : '' },
              { label: 'Address on Aadhaar', value: aad?.address },
            ],
          },
        ]
      : []),
    {
      key: 'bank',
      title: 'Bank account',
      icon: Landmark,
      summary: [v.bank?.bankName, maskTail(v.bank?.accountNumber)].filter(Boolean).join(' · ') || 'Not added yet',
      changeFields: ['bankAccountName', 'bankName', 'accountNumber', 'ifsc'],
      rows: [
        ...(v.bank?.verified ? [{ label: 'Verified', value: `By your bank${v.bank.verifiedAt ? ` on ${dateIN(v.bank.verifiedAt)}` : ''}` }] : []),
        { label: 'Account holder', value: v.bank?.accountName },
        { label: 'Bank', value: v.bank?.bankName },
        { label: 'Account number', value: v.bank?.accountNumber, mono: true },
        { label: 'IFSC code', value: v.bank?.ifsc, mono: true },
        { label: 'Branch', value: v.bank?.branchName },
      ],
    },
  ];

  // Change requests are only taken once approved (same rule as before: the server refuses them earlier).
  const canChange = (s: DetailSection | null) => !!s && approved && !!s.changeFields?.length;

  return (
    <>
      <Screen withTabBar onRefresh={refresh} header={header}>
        <Card tone="frostStrong" style={{ gap: space.md, borderRadius: radius.xxl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar name={name} size={64} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              {/* Up to 3 lines: a long legal name ("… Productions Private Limited") reads in full at 320 dp. */}
              <Text variant="heading" numberOfLines={3} accessibilityLabel={name}>
                {name}
              </Text>
              {prettyPhone(v.contactNumber) ? (
                <Text variant="label" muted numberOfLines={1} tabular>
                  {prettyPhone(v.contactNumber)}
                </Text>
              ) : null}
              {/* Its own line: the ID vendors quote to Accounts must never be cut off. */}
              {v.vendorCode ? (
                <Text variant="label" muted numberOfLines={2} tabular>
                  Vendor ID {v.vendorCode}
                </Text>
              ) : null}
            </View>
          </View>
          {/* Full card width: a long pill never squeezes the name column at 360 dp / font scale 1.3. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs }}>
            <StatusPill label={st.label} tone={st.tone} />
            {approved && v.approvedAt ? (
              <Text variant="caption" muted>
                since {dateIN(v.approvedAt)}
              </Text>
            ) : null}
          </View>
        </Card>

        {demoToken ? (
          <ActivityList title="Demo">
            <TourTarget id="vendor.switchDemo">
              <ListRow
                left={rowIcon(Shuffle)}
                title="Switch demo role"
                subtitle={demoPersona ? `Now ${demoPersona.label} · sample data only` : 'Sample data only'}
                subtitleLines={2}
                chevron
                onPress={rolePicker.open}
                accessibilityHint="Opens the list of demo roles"
              />
            </TourTarget>
          </ActivityList>
        ) : null}

        <TourTarget id="vendor.profileDetails" radius={radius.xl}>
          <ActivityList title="Your details">
            {sections.map((s) => (
              <ListRow
                key={s.key}
                left={rowIcon(s.icon)}
                title={s.title}
                subtitle={s.summary}
                subtitleLines={2}
                chevron
                onPress={() => setDetail(s)}
                accessibilityLabel={`${s.title}, ${s.summary}. Show details`}
              />
            ))}
          </ActivityList>
        </TourTarget>

        {approved && changeRequests.length > 0 ? (
          <ActivityList
            title="Change requests"
            separatorInset={space.md}
            right={
              changeRequests.length > 3 ? (
                <SeeAllLink label={allRequests ? 'Show less' : 'See all'} onPress={() => setAllRequests((x) => !x)} />
              ) : undefined
            }>
            {shownRequests.map((r) => (
              <ChangeRequestItem key={r.id} r={r} />
            ))}
          </ActivityList>
        ) : null}

        {docs.length ? (
          <TourTarget id="vendor.profileDocuments" radius={radius.xl}>
            <ActivityList title="Documents" overline={`${verifiedDocs} of ${docs.length} verified`}>
              {docs.map((d) => (
                <DocumentItem
                  key={d.docType}
                  doc={d}
                  onView={() => setViewing({ kind: 'document', docType: d.docType, title: docLabel(d.docType, d.label) || 'Document' })}
                />
              ))}
            </ActivityList>
          </TourTarget>
        ) : null}

        <ActivityList title="Account">
          <ListRow
            left={rowIcon(KeyRound)}
            title={v.hasPassword ? 'Change password' : 'Set a password'}
            subtitle={v.hasPassword ? undefined : 'Sign in without a WhatsApp code'}
            chevron
            onPress={() => setPwOpen(true)}
          />
          {v.googleLinked ? (
            <ListRow left={rowIcon(Link2)} title="Google account" subtitle={`Linked${v.email ? ` · ${v.email}` : ''}`} subtitleLines={2} />
          ) : null}
          {pocEmail ? (
            <ListRow
              left={rowIcon(Mail)}
              title="Email Tamada"
              subtitle={pocEmail}
              subtitleLines={2}
              chevron
              onPress={emailTamada}
              accessibilityLabel={`Email Tamada, ${pocEmail}`}
            />
          ) : null}
          <ShowMeAroundRow kind="vendor" left={(icon) => rowIcon(icon)} />
        </ActivityList>

        {/* Sign out in a card of its own (as in the staff More tab), never one slip away from a link. */}
        <ActivityList>
          <ListRow
            left={
              <IconBadge bg={palette.dangerSoft}>
                <LogOut size={20} color={palette.dangerInk} strokeWidth={2} />
              </IconBadge>
            }
            title={signingOut ? 'Signing out…' : 'Sign out'}
            titleColor={palette.dangerInk}
            disabled={signingOut}
            onPress={confirmSignOut}
            accessibilityHint="Asks before signing you out"
          />
        </ActivityList>
      </Screen>

      {/* Sheets live outside the Screen so they don't add empty animated slots (and gaps) to the scroll.
          One at a time: "Request a change" closes the details sheet first, then opens the form. */}
      <Sheet
        visible={!!detail}
        onClose={() => setDetail(null)}
        title={detailShown?.title}
        footer={
          canChange(detailShown) ? (
            <Button
              title="Request a change"
              variant="accent"
              onPress={() => {
                const fields = detailShown?.changeFields ?? [];
                setDetail(null);
                setTimeout(() => setChangeFields(fields), 280);
              }}
            />
          ) : undefined
        }>
        {detailShown ? (
          detailShown.rows.some((r) => r.value) ? (
            <InfoRows rows={detailShown.rows} hideEmpty />
          ) : (
            <Text variant="label" muted>
              Nothing added yet.
            </Text>
          )
        ) : null}
      </Sheet>
      <PasswordSheet visible={pwOpen} hasPassword={v.hasPassword} onClose={() => setPwOpen(false)}
        onDone={() => {
          setPwOpen(false);
          toast.show('Password saved. Use it next time you sign in.', 'success');
        }}
      />
      <ChangeRequestSheet
        fields={changeFields}
        onClose={() => setChangeFields(null)}
        onDone={(m) => {
          setChangeFields(null);
          toast.show(m, 'success');
        }}
      />
      <FileViewerSheet source={viewing} onClose={() => setViewing(null)} />
      {rolePicker.element}
    </>
  );
}
