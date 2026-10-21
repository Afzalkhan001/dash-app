// Professional categories — the website's Config › Professional Categories (dash.html:3428
// ProfessionalCategoriesCard): the kinds of professional that can be booked, the hours each is
// bookable within, and the gap left after a booking before the next can start.
//   PUT /tenants/:id {profTypes:[{id, label, dayStart, dayEnd, gapMinutes, active}]}  (routes/tenants.js:53)
// The list is REPLACED WHOLE, so the company record is read again just before saving and the save is
// refused if someone else changed the list meanwhile. The website's save rules are kept exactly
// (features/hradvanced/company-model): the id comes from the label once and never changes; a
// category is switched off, not deleted, so past bookings keep pointing at it. Saving changes what
// everyone can book, so it goes through ConfirmSheet + SwipeToConfirm. Nobody is messaged.

import { useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { fetchFreshTenant, useUpdateTenant } from '@/api/company';
import type { ProfType } from '@/api/me';
import { profTypesOf } from '@/features/booking/model';
import { useCompanyAccess } from '@/features/company/gate';
import { canEditCompanyConfig } from '@/features/hradvanced/access';
import { categoryChanges, categoryDrafts, cleanCategories, type DraftCategory, hmTyping, idFor, isHm, newCategory } from '@/features/hradvanced/company-model';
import { errorText, GateFallback } from '@/features/hradvanced/ui';
import { NumberField, ToggleRow } from '@/features/hrtime/ui';
import { space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ActionBar, Banner, Button, Card, ConfirmSheet, NavHeader, PillField, Screen, SummaryCard, Text, toast } from '@/ui';

export default function CategoriesScreen() {
  const { user, tenant, ready } = useCompanyAccess();
  const allowed = canEditCompanyConfig(user, tenant);
  const header = <NavHeader title="Professional categories" />;
  if (!allowed || !tenant) return <GateFallback pending={!ready} header={header} />;
  const base = profTypesOf(tenant.profTypes);
  return <Editor key={tenant.id} header={header} tenantId={tenant.id} initial={base} />;
}

function Editor({ header, tenantId, initial }: { header: React.ReactNode; tenantId: string; initial: ProfType[] }) {
  const qc = useQueryClient();
  const update = useUpdateTenant();
  // What this screen started from: a re-read just before saving is compared with it.
  const [base, setBase] = useState<ProfType[]>(initial);
  const [latest, setLatest] = useState<ProfType[] | null>(null);
  const [rows, setRows] = useState<DraftCategory[]>(() => categoryDrafts(initial));
  const [confirming, setConfirming] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const result = cleanCategories(rows);
  const list = 'list' in result ? result.list : null;
  const changes = list ? categoryChanges(base, list) : [];
  const set = (key: string, patch: Partial<DraftCategory>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const review = async () => {
    setMsg(null);
    if (!list) {
      setMsg('error' in result ? result.error : null);
      return;
    }
    if (!changes.length) {
      toast.show('Nothing has changed.', 'info');
      return;
    }
    setError(null);
    setChecking(true);
    try {
      const fresh = profTypesOf((await fetchFreshTenant(qc, tenantId))?.profTypes);
      setLatest(fresh);
      setStale(JSON.stringify(fresh) !== JSON.stringify(base));
      setConfirming(true);
    } catch (e) {
      // The list is replaced whole: without a fresh read there is no way to know nobody else saved
      // meanwhile, so nothing is offered for saving.
      setMsg(`Couldn’t check for other changes: ${errorText(e)} Try again.`);
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    if (!list) return;
    setError(null);
    try {
      await update.mutateAsync({ tenantId, patch: { profTypes: list } });
      setBase(list);
      setRows(categoryDrafts(list));
      setConfirming(false);
      toast.show('Categories saved.');
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Screen
      header={header}
      footer={
        <ActionBar note={msg}>
          <Button title="Review and save" icon={<Save />} onPress={() => void review()} loading={checking} />
        </ActionBar>
      }>
      <Text variant="body" muted>
        The kinds of professional that can be booked, and the hours each is bookable within. The gap is buffer time left after a booking before the next can start — travel time for a shoot, for example. Switch a
        category off to stop offering it without touching past bookings.
      </Text>
      {rows.map((r, i) => {
        const id = idFor(r);
        const badTimes = (r.dayStart && !isHm(r.dayStart)) || (r.dayEnd && !isHm(r.dayEnd));
        return (
          <Card key={r.key}>
            <View style={styles.stack}>
              <PillField
                label={`Category ${i + 1}`}
                value={r.label}
                onChangeText={(v) => set(r.key, { label: v.slice(0, 40) })}
                placeholder="e.g. Sound Engineer"
                hint={r.isNew ? (id ? `Its id will be “${id}” (fixed once saved). Leave the name blank to skip this row.` : 'Leave it blank to skip this row.') : `Id “${r.id}” — fixed, so past bookings keep their category.`}
              />
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <PillField label="Day starts" value={r.dayStart} onChangeText={(v) => set(r.key, { dayStart: hmTyping(v) })} placeholder="07:00" keyboardType="numbers-and-punctuation" />
                </View>
                <View style={styles.flex}>
                  <PillField label="Day ends" value={r.dayEnd} onChangeText={(v) => set(r.key, { dayEnd: hmTyping(v) })} placeholder="22:00" keyboardType="numbers-and-punctuation" />
                </View>
              </View>
              {badTimes ? (
                <Text variant="caption" muted>
                  24-hour time, like 07:00 or 22:00.
                </Text>
              ) : null}
              <NumberField label="Gap after a booking" unit="minutes" value={r.gapMinutes} onChange={(v) => set(r.key, { gapMinutes: v.slice(0, 3) })} hint="0 to 480" />
              <ToggleRow label="Offered" sub={r.active ? 'People can book this category' : 'Hidden from booking; past bookings stay'} value={r.active} onChange={(v) => set(r.key, { active: v })} />
            </View>
          </Card>
        );
      })}
      <Button title="Add a category" variant="ghost" icon={<Plus />} onPress={() => setRows((rs) => [...rs, newCategory()])} />

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Save professional categories?"
        subtitle={`${list?.length ?? 0} categories`}
        confirmLabel="Swipe to save"
        onConfirm={() => void submit()}
        loading={update.isPending}
        disabled={stale}
        note="Changes what everyone can book from now on. Past bookings keep their category. Nobody is messaged.">
        {stale ? (
          <Banner
            tone="danger"
            title="Someone else changed this list"
            message="It was saved by someone else after you opened this screen. Load the latest list and make your change again."
            action={{
              label: 'Load the latest',
              onPress: () => {
                setConfirming(false);
                if (latest) {
                  setBase(latest);
                  setRows(categoryDrafts(latest));
                }
                setStale(false);
                toast.show('Loaded the latest list.', 'info');
              },
            }}
          />
        ) : null}
        <SummaryCard title={`${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`} rows={changes.map((t, i) => ({ key: String(i), label: t }))} />
        {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  stack: { gap: space.md },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  flex: { flex: 1, minWidth: 130 },
}));
