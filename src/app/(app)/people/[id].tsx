// A colleague's profile, built only from their directory row (GET /org/directory) — never from
// GET /users/:id — so nobody sees more than the server's directory already allows them: CEO / COO /
// Super Admin / HR see department, employee no. and location; everyone else sees name, role,
// title, manager, contact, blood group and how long they have been here.
//
// Payno profile (docs/REFERENCE-COMPONENTS.md §3): NavHeader "Colleague" with a "•••" button; the
// hero on the warm wash (big avatar, name, role) with round Call / Email buttons; then Contact (mobile
// first, so the number is above the fold) and Work as SummaryCards; then where they sit, as kit
// ActivityLists (the hierarchy the owner asked for, Keka-style):
//   "Reports to"          their manager first, then up the chart — each higher row says whose manager
//                         it is ("Priya's manager"); at most 3, "Full line" opens the org chart on them.
//                         A branch the chart only hung under the head of the company has no line.
//   "Direct reports (n)"  the people under them, at most 8, "See all" opens the org chart on them;
//                         me too ("You") when they are my manager and my login is not on the chart.
// Every row opens that person (a manager who is not in the directory is shown without a link).
// WhatsApp, "Share contact" and "Show on org chart" are in the "•••" menu.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Mail, MessageCircle, MoreHorizontal, Network, Phone, Share2, UserX } from 'lucide-react-native';
import { useState } from 'react';

import { useMyProfile } from '@/api/me';
import { deptName, useDepartments } from '@/api/people';
import { type StaffUser, useSession } from '@/auth/session';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { callNumber, canWhatsApp, openWhatsApp, phoneDisplay, sendMail, shareContact } from '@/features/people/contact';
import { bloodCode, joinedLabel, personPhone, personTitle, tenureHere, useOrgTree } from '@/features/people/directory';
import { type OrgNode, placeOf } from '@/features/people/org-tree';
import { type ContactAction, PersonHeader, PersonHeaderSkeleton, PersonRow } from '@/features/people/person-ui';
import { firstName } from '@/lib/format';
import { palette } from '@/theme/tokens';
import {
  ActivityList,
  Button,
  EmptyState,
  ErrorState,
  type MenuItem,
  MenuSheet,
  NavHeader,
  Screen,
  SkeletonList,
  type SummaryItem,
  SummaryCard,
} from '@/ui';

const MAX_REPORTS = 8;
const MAX_ABOVE = 3;

/** "Priya’s manager" ("Your manager" over me) — what a higher row of the reporting line is to the row under it. */
const managerOfLabel = (below: OrgNode | undefined, me: string | undefined) => {
  if (below && me && below.id === me) return 'Your manager';
  const f = firstName(below?.name);
  return f ? `${f}’s manager` : 'One level up';
};

const filled = (rows: SummaryItem[]) => rows.filter((r) => !!r && r.value != null && r.value !== '');

export default function PersonScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  const router = useRouter();
  const now = useNow();
  const today = useTodayIst();
  const sessionUser = useSession((s) => s.user);
  const me = sessionUser?.id;
  const myProfile = useMyProfile();
  const org = useOrgTree();
  const departments = useDepartments(org.full);
  const deptList = Array.isArray(departments.data) ? departments.data : undefined;
  const [menuOpen, setMenuOpen] = useState(false);

  const person = id ? org.tree.byId.get(id) : undefined;
  const kids = person ? org.tree.kids.get(person.id) : undefined;
  // A login the chart leaves out (HR, Super Admin, Accounts, IT Admin…) still has a manager on its
  // record: on that manager's page it is one of their direct reports ("You"), as on My team.
  const myRec = (myProfile.data ?? sessionUser) as StaffUser | null;
  const offChartMe: OrgNode | null =
    myRec?.id && !org.tree.byId.has(String(myRec.id))
      ? { id: String(myRec.id), name: String(myRec.name || 'You'), role: myRec.role, jobTitle: typeof myRec.jobTitle === 'string' ? myRec.jobTitle : undefined }
      : null;
  const myManager = offChartMe
    ? placeOf(org.tree, {
        id: offChartMe.id,
        name: offChartMe.name,
        reportingTo: typeof myRec?.reportingTo === 'string' ? myRec.reportingTo : null,
        reportingManager: typeof myRec?.reportingManager === 'string' ? myRec.reportingManager : undefined,
        reportingToName: typeof myRec?.reportingToName === 'string' ? myRec.reportingToName : undefined,
      }).manager
    : null;
  const reports: OrgNode[] = [
    ...(Array.isArray(kids) ? kids.filter(Boolean) : []),
    ...(offChartMe && person && myManager && myManager.id === person.id ? [offChartMe] : []),
  ].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const shownReports = reports.slice(0, MAX_REPORTS);

  if (id && id === me) return <Redirect href="/profile" />;

  const found = !!person && !person.ghost;
  const header = (
    <NavHeader
      title="Colleague"
      actions={found ? [{ key: 'more', icon: MoreHorizontal, label: 'More options', onPress: () => setMenuOpen(true) }] : undefined}
    />
  );

  if (!person || person.ghost) {
    return (
      <Screen header={header} onRefresh={() => org.refetch()}>
        {/* Keys match the loaded layout's slots, so the content replaces the skeleton in place. */}
        {/* isPending (not isLoading) also covers restoring the saved cache on a cold start, so a deep
            link doesn't flash "Not in the directory" before the directory is back. */}
        {org.isPending ? (
          <PersonHeaderSkeleton key="hero" />
        ) : org.isError && !org.data ? (
          <ErrorState key="hero" message={org.error?.message ?? 'The directory could not be loaded.'} onRetry={() => void org.refetch()} />
        ) : (
          <EmptyState
            key="hero"
            icon={<UserX color={palette.textMuted} strokeWidth={1.8} />}
            title="Not in the directory"
            message="They may have left the company."
            action={<Button title="Back to People" variant="accent" size="md" onPress={() => router.replace('/people')} />}
          />
        )}
        {org.isPending ? <SkeletonList key="contact" rows={4} tone="surface" /> : null}
      </Screen>
    );
  }

  const name = person.name || 'Unnamed';
  const title = personTitle(person);
  const phone = personPhone(person);
  // Shown grouped ('+91 90001 01048') like your own profile; call / WhatsApp still use the raw value.
  const phoneShown = phoneDisplay(phone);
  const email = String(person.email || '').trim();
  // Up the chart from their manager, nearest first. The chart parent of an "assumed" branch is only
  // where the chart hung it, not a manager on file, so the line stops there.
  const above: OrgNode[] = [];
  const guard = new Set<string>([person.id]);
  let cur: OrgNode = person;
  while (above.length < 64 && !org.tree.assumed.has(cur.id)) {
    const up = org.tree.parent.get(cur.id);
    if (!up || guard.has(up.id)) break;
    above.push(up);
    guard.add(up.id);
    cur = up;
  }
  const shownAbove = above.slice(0, MAX_ABOVE);
  const managerName = person.reportingManager || above[0]?.name || '';
  const joined = joinedLabel(person.dateJoined, today);
  const tenure = tenureHere(person.dateJoined, now);
  const openPerson = (pid: string) => (pid === me ? router.push('/profile') : router.push(`/people/${encodeURIComponent(pid)}`));
  const openChart = () => router.push(`/people/org?focus=${encodeURIComponent(person.id)}`);

  const actions: ContactAction[] = [
    ...(phone ? [{ key: 'call', icon: Phone, label: 'Call', primary: true, onPress: () => callNumber(phone) }] : []),
    ...(email ? [{ key: 'mail', icon: Mail, label: 'Email', onPress: () => sendMail(email) }] : []),
  ];

  const contactRows = filled([
    { key: 'mobile', label: 'Mobile', value: phoneShown },
    { key: 'email', label: 'Email', value: email },
    { key: 'blood', label: 'Blood group', value: bloodCode(person.bloodGroup) },
  ]);
  const workRows = filled([
    { key: 'dept', label: 'Department', value: org.full ? deptName(person.dept, deptList) : '' },
    // A manager the chart knows is the first row of "Reports to" below; a name it can't place is a plain row.
    { key: 'manager', label: 'Reports to', value: above.length ? '' : managerName },
    { key: 'empno', label: 'Employee no.', value: org.full ? String(person.employeeNumber || person.kekaCode || '') : '' },
    { key: 'location', label: 'Location', value: org.full ? String(person.location || person.city || '') : '' },
    { key: 'joined', label: 'Joined', value: joined || tenure, hint: joined && tenure ? tenure : null },
  ]);

  const menu: MenuItem[] = [
    ...(canWhatsApp(phone) ? [{ key: 'whatsapp', label: 'Message on WhatsApp', icon: MessageCircle, onPress: () => openWhatsApp(phone) }] : []),
    { key: 'share', label: 'Share contact', icon: Share2, onPress: () => shareContact({ name, title, phone: phoneShown, email }) },
    { key: 'chart', label: 'Show on org chart', icon: Network, onPress: openChart },
  ];

  return (
    <>
      <Screen header={header} onRefresh={() => org.refetch()}>
        <PersonHeader
          key="hero"
          person={person}
          name={name}
          subtitle={title || null}
          note={person.pending && org.full ? 'Not signed up for DASH yet' : null}
          actions={actions}
        />

        {contactRows.length ? <SummaryCard key="contact" title="Contact" rows={contactRows} /> : null}

        {workRows.length ? <SummaryCard key="work" title="Work" rows={workRows} /> : null}

        {shownAbove.length ? (
          <ActivityList
            key="above"
            title="Reports to"
            onSeeAll={above.length > MAX_ABOVE ? openChart : undefined}
            seeAllLabel="Full line"
            seeAllAccessibilityLabel={`See ${name}'s full reporting line on the org chart`}>
            {shownAbove.map((m, i) => (
              <PersonRow
                key={m.id}
                person={m}
                title={m.name || 'Unnamed'}
                subtitle={personTitle(m) || null}
                // The first row is their manager (the section says so); each higher one says whose manager it is.
                meta={m.ghost ? 'Not in the directory' : [m.id === me ? 'You' : '', i > 0 ? managerOfLabel(shownAbove[i - 1], me) : ''].filter(Boolean).join(' · ') || null}
                onPress={m.ghost ? undefined : () => openPerson(m.id)}
              />
            ))}
          </ActivityList>
        ) : null}

        {reports.length ? (
          <ActivityList
            key="reports"
            title={`Direct reports (${reports.length})`}
            onSeeAll={reports.length > MAX_REPORTS ? openChart : undefined}
            seeAllAccessibilityLabel={`See all ${reports.length} on the org chart`}>
            {shownReports.map((r) => (
              <PersonRow
                key={r.id}
                person={r}
                title={r.name || 'Unnamed'}
                subtitle={personTitle(r) || null}
                meta={r.ghost ? 'Not in the directory' : r.id === me ? 'You' : r.pending && org.full ? 'Not signed up yet' : null}
                onPress={r.ghost ? undefined : () => openPerson(r.id)}
              />
            ))}
          </ActivityList>
        ) : null}
      </Screen>
      <MenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={name} subtitle={title || undefined} items={menu} />
    </>
  );
}
