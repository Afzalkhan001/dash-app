// Project codes (web: ProjectsView, dash.html:22587; the web says "Keka codes").
//
// Who sees which rows (:22650): HR, IT Admin, Super Admin, CEO, COO and Config project creators see
// every code; everyone else sees only the codes they own (owner name = theirs). Only Super Admin and
// project creators may add, edit or deactivate (:22616) — the + is theirs alone. Search by name, code
// or owner; Active / Inactive / All; newest first; 30 at a time. Bulk upload and the code time report
// stay on the website (docs/port/PLAN.md §4). Codes are never deleted (the web removed that on purpose).

import { useRouter } from 'expo-router';
import { BriefcaseBusiness, Plus, Search, SearchX } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useMyTenant } from '@/api/me';
import { useProjects } from '@/api/reimbursements';
import type { WorkProject } from '@/api/work';
import { canEditProjects, canSeeAllProjects, canSeeProjects, ownsProject } from '@/features/work/access';
import { WorkGate } from '@/features/work/gate';
import { codeOfProject, isActiveProject, projectMatches, projectsNewestFirst, projectStatus } from '@/features/work/projects';
import { useAccess } from '@/lib/use-access';
import { plural } from '@/lib/format';
import { palette, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Button, EmptyState, ErrorState, ListCard, ListRow, NavHeader, PillField, Screen, Segmented, SkeletonList, StatusPill, SummaryHero, Text } from '@/ui';

type Show = 'active' | 'inactive' | 'all';
const PAGE = 30;

export default function ProjectsRoute() {
  return (
    <WorkGate title="Project codes" allow={canSeeProjects}>
      <Projects />
    </WorkGate>
  );
}

function Projects() {
  const router = useRouter();
  const access = useAccess();
  const tenant = useMyTenant().data ?? null;
  const me = access.user;
  const q0 = useProjects();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('active');
  const [limit, setLimit] = useState(PAGE);

  const seeAll = canSeeAllProjects(me, tenant);
  const canEdit = canEditProjects(me, tenant);
  const list = (Array.isArray(q0.data) ? q0.data : []) as WorkProject[];
  const scoped = seeAll ? list : list.filter((p) => ownsProject(p, me));
  const counts = { active: scoped.filter(isActiveProject).length, inactive: scoped.filter((p) => !isActiveProject(p)).length, all: scoped.length };
  const shown = scoped
    .filter((p) => (show === 'all' ? true : show === 'active' ? isActiveProject(p) : !isActiveProject(p)))
    .filter((p) => projectMatches(p, q))
    .sort(projectsNewestFirst);
  const page = shown.slice(0, limit);

  return (
    <Screen
      header={
        <NavHeader
          title="Project codes"
          actions={canEdit ? [{ icon: Plus, label: 'Add a project code', onPress: () => router.push('/admin/work/projects/edit') }] : undefined}
        />
      }
      onRefresh={() => q0.refetch()}>
      {q0.data ? (
        <SummaryHero
          icon={BriefcaseBusiness}
          module="tasks"
          label={seeAll ? 'Active project codes' : 'Your active project codes'}
          value={counts.active}
          info={counts.inactive ? { label: 'Inactive', value: String(counts.inactive) } : undefined}
          sub={seeAll ? undefined : 'You see the codes you own.'}
        />
      ) : null}

      <PillField
        icon={Search}
        value={q}
        onChangeText={(t) => {
          setQ(t);
          setLimit(PAGE);
        }}
        placeholder="Search name, code or owner"
        accessibilityLabel="Search project codes"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <Segmented
        options={[
          { key: 'active', label: 'Active', badge: counts.active },
          { key: 'inactive', label: 'Inactive', badge: counts.inactive },
          { key: 'all', label: 'All', badge: counts.all },
        ]}
        value={show}
        onChange={(k) => {
          setShow(k);
          setLimit(PAGE);
        }}
      />

      {q0.isPending && !q0.data ? (
        <SkeletonList rows={5} />
      ) : q0.isError && !q0.data ? (
        <ErrorState message={q0.error.message} onRetry={() => void q0.refetch()} />
      ) : !shown.length ? (
        q.trim() ? (
          <EmptyState icon={<SearchX color={palette.textMuted} />} title="No codes found" message={`Nothing matches “${q.trim()}”.`} />
        ) : (
          <EmptyState
            icon={<BriefcaseBusiness color={palette.textMuted} />}
            title={show === 'inactive' ? 'No inactive codes' : 'No project codes yet'}
            message={seeAll ? (canEdit ? 'Add one with +.' : undefined) : 'Codes you own show up here.'}
          />
        )
      ) : (
        <View style={styles.list}>
          <ListCard tone="surface" separatorInset={16}>
            {page.map((p) => {
              const st = projectStatus(p);
              const code = codeOfProject(p) || '—';
              const sub = [String(p.name || ''), String(p.costCodeOwner || '')].filter(Boolean).join(' · ');
              return (
                <ListRow
                  key={p.id}
                  title={code}
                  subtitle={sub || undefined}
                  subtitleLines={2}
                  // Active or Inactive already says the status; only All mixes them.
                  below={show === 'all' ? <StatusPill label={st.label} tone={st.tone} /> : undefined}
                  chevron
                  onPress={() => router.push(`/admin/work/projects/${encodeURIComponent(p.id)}`)}
                  accessibilityLabel={`${code}, ${sub}, ${st.label}`}
                />
              );
            })}
          </ListCard>
          {shown.length > page.length ? (
            <Button title={`Show more (${shown.length - page.length})`} variant="text" size="md" onPress={() => setLimit((n) => n + PAGE)} style={styles.more} />
          ) : (
            <Text variant="caption" muted align="center">
              {plural(shown.length, 'code')}
            </Text>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  list: { gap: space.sm },
  more: { alignSelf: 'center' },
}));
