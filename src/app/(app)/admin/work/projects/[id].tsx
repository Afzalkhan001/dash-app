// One project code (web: a ProjectsView row). The facts as a SummaryCard; for Super Admin and project
// creators, Edit and Deactivate / Reactivate (toggleProjectActive :22627 — PUT {status}, can be undone,
// so a plain confirm, no swipe). Never Delete: tasks, bookings, tickets, claims and petty cash point
// at the code (the web removed it on purpose, :22721).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BriefcaseBusiness, Pencil, Power, PowerOff, SearchX } from 'lucide-react-native';
import { useState } from 'react';

import { useMyTenant } from '@/api/me';
import { useProjects } from '@/api/reimbursements';
import { projectWriteKeys, updateProject, type WorkProject } from '@/api/work';
import { useTodayIst } from '@/features/attendance/use-now';
import { canEditProjects, canSeeAllProjects, canSeeProjects, ownsProject } from '@/features/work/access';
import { WorkGate } from '@/features/work/gate';
import { codeOfProject, isActiveProject, projectStatus } from '@/features/work/projects';
import { dateLabel } from '@/lib/dates';
import { isYmd } from '@/lib/ist';
import { useAccess } from '@/lib/use-access';
import { palette, radius } from '@/theme/tokens';
import {
  ActionBar,
  ActionRow,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  haptic,
  NavHeader,
  Screen,
  Sheet,
  Skeleton,
  SummaryCard,
  SummaryHero,
  Text,
  toast,
} from '@/ui';

const str = (v: unknown) => (v == null ? '' : String(v));

export default function ProjectRoute() {
  return (
    <WorkGate title="Project code" allow={canSeeProjects}>
      <ProjectDetail />
    </WorkGate>
  );
}

function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const today = useTodayIst();
  const access = useAccess();
  const tenant = useMyTenant().data ?? null;
  const me = access.user;
  const q0 = useProjects();
  const [toggleOpen, setToggleOpen] = useState(false);
  const p = (Array.isArray(q0.data) ? q0.data : []).find((x) => x?.id === id) as WorkProject | undefined;
  const allowed = !!p && (canSeeAllProjects(me, tenant) || ownsProject(p, me));
  const canEdit = canEditProjects(me, tenant);

  const toggle = useMutation({
    mutationFn: (next: 'active' | 'inactive') => updateProject(String(id), { status: next }),
    onSuccess: (_r, next) => {
      haptic.success();
      setToggleOpen(false);
      toast.show(next === 'inactive' ? 'Code deactivated' : 'Code reactivated', 'success');
      void Promise.all(projectWriteKeys(me?.id).map((queryKey) => qc.invalidateQueries({ queryKey })));
    },
    onError: () => haptic.error(),
  });

  if (!p || !allowed) {
    return (
      <Screen header={<NavHeader title="Project code" />} onRefresh={() => q0.refetch()}>
        {q0.isPending ? (
          <Skeleton height={260} radius={radius.xl} />
        ) : q0.isError && !q0.data ? (
          <ErrorState message={q0.error.message} onRetry={() => void q0.refetch()} />
        ) : (
          <EmptyState icon={<SearchX color={palette.textMuted} />} title="Code not found" message="It may belong to someone else." />
        )}
      </Screen>
    );
  }

  const active = isActiveProject(p);
  const st = projectStatus(p);
  const code = codeOfProject(p) || '—';
  const date = str(p.date || p.createdAt).slice(0, 10);
  const label = code;

  return (
    <Screen
      header={<NavHeader title="Project code" />}
      onRefresh={() => q0.refetch()}
      footer={
        canEdit ? (
          <ActionBar>
            <ActionRow context="bar">
              <Button title={active ? 'Deactivate' : 'Reactivate'} variant="ghost" icon={active ? <PowerOff /> : <Power />} onPress={() => setToggleOpen(true)} />
              <Button title="Edit" icon={<Pencil />} onPress={() => router.push(`/admin/work/projects/edit?id=${encodeURIComponent(p.id)}`)} />
            </ActionRow>
          </ActionBar>
        ) : undefined
      }>
      <SummaryHero
        icon={BriefcaseBusiness}
        module="tasks"
        label="Project code"
        figure={
          <Text variant="hero" color={palette.ink} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} tabular selectable>
            {code}
          </Text>
        }
        sub={str(p.name) || undefined}
      />
      {!active ? <Banner tone="info" title="Inactive" message="It isn’t offered for new tasks, bookings or claims. Work already logged against it stays." /> : null}
      <SummaryCard
        rows={[
          { key: 'status', label: 'Status', value: st.label, status: st.tone },
          { key: 'm1', label: 'Meta 1', value: str(p.meta1) },
          { key: 'm2', label: 'Meta 2', value: str(p.meta2) },
          { key: 'm3', label: 'Meta 3', value: str(p.meta3) },
          { key: 'owner', label: 'Project owner', value: str(p.costCodeOwner) },
          { key: 'emp', label: 'Owner’s employee number', value: str(p.empNo) },
          { key: 'date', label: 'Date', value: isYmd(date) ? dateLabel(date, today) : date },
        ]}
        hideEmpty
      />

      <Sheet
        visible={toggleOpen}
        onClose={() => (toggle.isPending ? undefined : setToggleOpen(false))}
        title={active ? `Deactivate ${label}?` : `Reactivate ${label}?`}
        subtitle={
          active
            ? 'It stops being offered for new tasks and bookings. Work already booked against it is untouched, and you can reactivate it later.'
            : 'It will be selectable again for new work.'
        }
        footer={
          <Button
            title={active ? 'Deactivate' : 'Reactivate'}
            variant={active ? 'destructive' : 'primary'}
            loading={toggle.isPending}
            onPress={() => toggle.mutate(active ? 'inactive' : 'active')}
          />
        }>
        {toggle.error ? <Banner tone="danger" title="Couldn’t update this code" message={toggle.error.message} /> : <Text variant="label" muted>No message is sent.</Text>}
      </Sheet>
    </Screen>
  );
}
