// My profile — the same data and edits as the web's My Profile (dash.html ProfileView ~L28975),
// in the Payno profile style (docs/REFERENCE-COMPONENTS.md), top to bottom:
//   1. NavHeader "My profile";
//   2. the hero on the warm wash: my photo (tap it to change or remove), name, job title, my team and
//      time here as two small chips, and ONE "Edit profile" pill (phone, bank details, bio and work
//      links, all in one sheet);
//   3. Contact: a SummaryCard of phone, email, blood group;
//   4. Work: a SummaryCard of employee no., job role (when it differs from the title), role in DASH
//      (when the title isn't already it), location and the joining date; my reporting manager is an
//      AccountRow under it ("View" opens their profile) when the org chart knows them — found by the
//      chart's rules from my own record, so it works for HR, Super Admin and the other logins that are
//      not on the directory; then "My team" (my manager, peers and direct reports → /team) for anyone
//      who is a person on a team and whose company has People switched on;
//   5. Bank details: a SummaryCard whose account number stays masked until the eye is tapped. With
//      nothing added yet it is one AccountRow with an "Add" pill that opens Edit profile;
//   6. About: the bio and the work links (each opens in the browser), only when there are any.
// Change password and App lock live on the More tab only. Empty details are left out, except phone and
// bank details, which say "Not added" so it is clear they can be filled in.

import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { CloudOff, ExternalLink, Eye, EyeOff, Landmark, Link2, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { safeLink } from '@/api/announcements';
import { useMyProfile } from '@/api/me';
import { deptName, type ProfileRecord, useDepartments } from '@/api/people';
import { useSession } from '@/auth/session';
import { useNow } from '@/features/attendance/use-now';
import { usePhotoActions } from '@/features/more/photo-sheet';
import { ProfileEditSheet } from '@/features/more/profile-edit-sheet';
import { ProfileHero, ProfileHeroSkeleton } from '@/features/more/profile-hero';
import { bloodCode, joinedLabel, personPhone, personTitle, useOrgTree } from '@/features/people/directory';
import { placeOf } from '@/features/people/org-tree';
import { PersonAvatar } from '@/features/people/person-ui';
import { hasTeam } from '@/features/team/team';
import { ROLE_LABEL } from '@/lib/access';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { istParts } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  AccountRow,
  ActivityList,
  ActivityRow,
  Banner,
  ErrorState,
  IconButton,
  NavHeader,
  Screen,
  SkeletonList,
  type SummaryItem,
  SummaryCard,
  Text,
  useLayout,
} from '@/ui';

const NOT_ADDED = 'Not added';

function maskAccount(n: string) {
  return n.length <= 4 ? n : `•••• ${n.slice(-4)}`;
}

/**
 * An Indian mobile number grouped the way it is read aloud: "+918328617610" or "08328617610" →
 * "+91 83286 17610". Anything else (another country, a landline, an extension) is shown as stored.
 */
function displayPhone(raw: string) {
  const stored = raw.trim();
  const digits = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(stored.replace(/[\s().-]/g, ''))?.[1];
  return digits ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : stored;
}

// Time here in plain words, from the joining date: "4+ years", "7 months" ('' under a month).
const MONTH_MS = 1000 * 60 * 60 * 24 * 30.44;
function timeHere(joined: string | null | undefined, now: number) {
  const t = Date.parse(String(joined || ''));
  if (!Number.isFinite(t) || !Number.isFinite(now) || t > now) return '';
  const months = Math.floor((now - t) / MONTH_MS);
  const years = Math.floor(months / 12);
  if (years >= 1) return `${years}+ ${years === 1 ? 'year' : 'years'}`;
  return months >= 1 ? `${months} ${months === 1 ? 'month' : 'months'}` : '';
}

// Tenure is counted in months, so an hourly tick is plenty (and keeps render pure: no Date.now()).
const TENURE_TICK_MS = 60 * 60_000;

/** Rows with a value only (callers pass "Not added" for the ones that must always show). */
const filled = (rows: SummaryItem[]) => rows.filter((r) => !!r && r.value != null && r.value !== '');

/** "forms.google.com" from a link, for the row title; the full address goes under it. */
function hostOf(href: string) {
  const m = /^https?:\/\/([^/?#:]+)/i.exec(href);
  return m ? m[1]!.replace(/^www\./i, '') : href;
}

function ProfileSkeleton() {
  const { gap } = useLayout();
  return (
    <View style={{ gap }}>
      <ProfileHeroSkeleton />
      <SkeletonList rows={4} tone="surface" />
    </View>
  );
}

export default function MyProfileScreen() {
  const router = useRouter();
  const sessionUser = useSession((s) => s.user);
  const profile = useMyProfile();
  const departments = useDepartments();
  const org = useOrgTree();
  const access = useAccess();
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [showBank, setShowBank] = useState(false);
  const now = useNow(TENURE_TICK_MS);

  const p = (profile.data ?? sessionUser) as ProfileRecord | null;
  const photo = typeof p?.avatar === 'string' && p.avatar ? p.avatar : null;
  const { openPhotoSheet, photoSheet, photoBusy } = usePhotoActions(!!photo);
  const refresh = () => Promise.all([profile.refetch(), departments.refetch(), org.refetch()]);
  const header = <NavHeader title="My profile" />;

  if (!p) {
    return (
      <Screen header={header} onRefresh={refresh}>
        {profile.isError ? (
          <ErrorState message={profile.error?.message ?? 'Your profile could not be loaded.'} onRetry={() => void profile.refetch()} />
        ) : (
          <ProfileSkeleton />
        )}
      </Screen>
    );
  }

  const openEdit = () => {
    setEditKey((k) => k + 1);
    setEditOpen(true);
  };

  const title = personTitle(p);

  // Reporting manager: the name on my record (the web shows it as typed), linked to their profile
  // when the org chart can place me under someone it can open (also when my login is not on it).
  const place = placeOf(org.tree, {
    id: String(p.id),
    name: p.name,
    reportingTo: typeof p.reportingTo === 'string' ? p.reportingTo : null,
    reportingManager: p.reportingManager,
  });
  const chartManager = place.manager;
  const managerName = String(p.reportingManager || '') || chartManager?.name || '';
  const managerLink = chartManager && !chartManager.ghost ? chartManager : null;
  // My team: everyone around me on the chart (the same people the My team screen lists).
  const teamSize = (managerLink ? 1 : 0) + place.peers.length + place.reports.length;
  // Only the groups I have: "manager and peers", "manager, peers and direct reports"…
  const teamParts = [managerLink ? 'manager' : '', place.peers.length ? 'peers' : '', place.reports.length ? 'direct reports' : ''].filter(Boolean);
  const teamWho = teamParts.length > 1 ? `${teamParts.slice(0, -1).join(', ')} and ${teamParts[teamParts.length - 1]}` : (teamParts[0] ?? '');
  const showTeam = hasTeam(p.role) && access.tenant?.orgEnabled !== false;

  const phone = displayPhone(personPhone(p));
  const jobRole = String(p.jobRole || p.jobTitle || '');
  const roleName = p.role ? (ROLE_LABEL[p.role] ?? String(p.role)) : '';
  const team = deptName(p.dept, Array.isArray(departments.data) ? departments.data : undefined);
  // "Thu, 5 Mar 2021": the app's one date format (year only outside this year). Today comes from the
  // ticking clock above, so render never reads the clock itself.
  const joined = joinedLabel(p.dateJoined, istParts(new Date(now)).date);
  const here = timeHere(p.dateJoined, now);
  const bank = String(p.bankAccountNumber || '');
  const ifsc = String(p.bankIfscCode || '');
  const bio = String(p.bio || '').trim();
  const rawLinks: unknown = p.workLinks;
  const links = (Array.isArray(rawLinks) ? rawLinks : []).map((l) => String(l || '').trim()).filter(Boolean);

  // The hero's chips say the team and the time here, so the Work card below doesn't repeat them.
  const facts = [team, here ? `${here} here` : ''];

  const muted = palette.textMuted;
  const contact = filled([
    { key: 'phone', label: 'Phone', value: phone || NOT_ADDED, valueColor: phone ? undefined : muted },
    { key: 'email', label: 'Email', value: String(p.email || '') },
    { key: 'blood', label: 'Blood group', value: bloodCode(p.bloodGroup) },
  ]);

  const work = filled([
    { key: 'emp', label: 'Employee no.', value: String(p.employeeNumber || p.kekaCode || '') },
    // The hero already shows the title; repeat the job role only when it says something else.
    { key: 'job', label: 'Job role', value: jobRole && jobRole !== title ? jobRole : '' },
    // What I can do in DASH (Employee, Manager, HR…); left out when the title above already says it.
    { key: 'role', label: 'Role in DASH', value: roleName && roleName !== title ? roleName : '' },
    // A manager the chart can't open is a plain row; one it can is the AccountRow under the card.
    { key: 'manager', label: 'Reporting manager', value: managerLink ? '' : managerName },
    { key: 'location', label: 'Location', value: String(p.location || p.city || '') },
    { key: 'joined', label: 'Joined', value: joined },
  ]);

  const bankRows: SummaryItem[] = [
    { key: 'account', label: 'Account number', value: bank ? (showBank ? bank : maskAccount(bank)) : NOT_ADDED, valueColor: bank ? undefined : muted },
    { key: 'ifsc', label: 'IFSC code', value: ifsc || NOT_ADDED, valueColor: ifsc ? undefined : muted },
  ];

  const teamRow = showTeam ? (
    <AccountRow
      icon={Users}
      module="people"
      title="My team"
      sub={teamSize ? `${plural(teamSize, 'person', 'people')} · ${teamWho}` : 'Your manager, peers and direct reports'}
      actionLabel="View"
      onPress={() => router.push('/team')}
      hint="Opens My team"
    />
  ) : null;

  const managerRow = managerLink ? (
    <AccountRow
      left={<PersonAvatar person={managerLink} size={44} ring={false} />}
      title={managerName}
      sub="Reporting manager"
      actionLabel="View"
      onPress={() => router.push(`/people/${encodeURIComponent(managerLink.id)}`)}
      hint="Opens their profile"
    />
  ) : null;

  // The sheets are Modals: they sit outside <Screen> so they don't take an animated slot (and a
  // stack gap) at the bottom of the scroll content.
  return (
    <>
      <Screen header={header} onRefresh={refresh}>
        <ProfileHero
          key="hero"
          name={p.name || 'Me'}
          title={title}
          photo={photo}
          photoBusy={photoBusy}
          facts={facts}
          onPhoto={openPhotoSheet}
          onEdit={openEdit}
        />

        {profile.isError ? (
          <Banner
            key="stale"
            icon={CloudOff}
            title="Showing saved details"
            message="The latest could not be loaded."
            action={{ label: 'Try again', onPress: () => void profile.refetch(), loading: profile.isFetching }}
          />
        ) : null}

        {contact.length ? <SummaryCard key="contact" title="Contact" rows={contact} /> : null}

        {work.length || managerRow || teamRow ? (
          <View key="work" style={styles.group}>
            {work.length ? <SummaryCard title="Work" rows={work} /> : null}
            {managerRow}
            {teamRow}
          </View>
        ) : null}

        {bank || ifsc ? (
          <SummaryCard
            key="bank"
            title="Bank details"
            rows={bankRows}
            right={
              bank ? (
                <IconButton accessibilityLabel={showBank ? 'Hide account number' : 'Show account number'} onPress={() => setShowBank((v) => !v)}>
                  {showBank ? <EyeOff size={18} color={palette.text} strokeWidth={1.8} /> : <Eye size={18} color={palette.text} strokeWidth={1.8} />}
                </IconButton>
              ) : undefined
            }
          />
        ) : (
          // Nothing added yet: one row, not a card of empty lines. "Add" opens Edit profile.
          <AccountRow
            key="bank"
            icon={Landmark}
            module="pay"
            title="Bank details"
            sub={NOT_ADDED}
            actionLabel="Add"
            onPress={openEdit}
            hint="Opens Edit profile"
          />
        )}

        {bio || links.length ? (
          <ActivityList key="about" title="About">
            {bio ? (
              <View style={styles.bio}>
                <Text variant="body" selectable style={styles.bioText}>
                  {bio}
                </Text>
              </View>
            ) : null}
            {links.map((l, i) => {
              const href = safeLink(l);
              return (
                <ActivityRow
                  key={`${i}-${l}`}
                  module="profile"
                  icon={Link2}
                  title={href ? hostOf(href) : l}
                  subtitle={l}
                  subtitleLines={1}
                  right={href ? <ExternalLink size={18} color={palette.textFaint} strokeWidth={1.8} /> : undefined}
                  onPress={href ? () => void WebBrowser.openBrowserAsync(href) : undefined}
                  accessibilityLabel={`Work link, ${l}`}
                  accessibilityHint={href ? 'Opens in the browser' : undefined}
                />
              );
            })}
          </ActivityList>
        ) : null}
      </Screen>
      <ProfileEditSheet key={editKey} visible={editOpen} onClose={() => setEditOpen(false)} profile={p} />
      {photoSheet}
    </>
  );
}

const styles = themedStyles(() => ({
  group: { gap: space.sm },
  bio: { paddingHorizontal: space.md, paddingVertical: space.sm },
  bioText: { lineHeight: 24 },
}));
