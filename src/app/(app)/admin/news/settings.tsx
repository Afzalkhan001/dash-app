// News settings — the switches on top of the website's Announcements page that only HR and Super Admin
// get (dash.html:19405, 19498-19512):
//   Birthday wishes / Work anniversaries  tenant.birthdayAutoOn / anniversaryAutoOn → PUT /tenants/:id.
//                                         The posting itself is a server sweep; switching one off also
//                                         hides cards of that kind already posted.
//   HR WhatsApp                            tenant.hrNotifyPhone → PUT /tenants/:id. The day's birthday and
//                                         anniversary share cards go to this number.
//   Send a test                            POST /celebration/test-send — a REAL WhatsApp (swiped).
//   Who can post news                      Super Admin: the company domain's Config list
//                                         (/admin/company/settings/access/news).

import { Redirect, useRouter } from 'expo-router';
import { Award, Cake, MessageCircle, Send, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';

import { useUpdateTenant } from '@/api/company';
import { useCelebrationTestSend } from '@/api/newsroom';
import { canEditNewsCreators } from '@/features/newsroom/access';
import { useNewsroomAccess } from '@/features/newsroom/gate';
import { ToggleRow } from '@/features/newsroom/toggle-row';
import { ANNOUNCEMENT_CREATOR_ROLES, ROLE_LABEL } from '@/lib/access';
import { space } from '@/theme/tokens';
import {
  ActionRow,
  Button,
  Card,
  ConfirmSheet,
  LabelledSection,
  ListCard,
  ListRow,
  ModuleBadge,
  NavHeader,
  Screen,
  SkeletonList,
  SummaryCard,
  Text,
  TextField,
  toast,
} from '@/ui';

const digits = (v: string) => v.replace(/[^\d+]/g, '');

export default function NewsSettingsScreen() {
  const router = useRouter();
  const { user, tenant, ready, studio, celebrations } = useNewsroomAccess();
  const save = useUpdateTenant();
  const test = useCelebrationTestSend();
  const savedPhone = typeof tenant?.hrNotifyPhone === 'string' ? tenant.hrNotifyPhone : '';
  const [phone, setPhone] = useState<string | null>(null);
  const [confirmTest, setConfirmTest] = useState(false);

  if (ready && !(studio && celebrations)) return <Redirect href="/" />;
  if (!tenant) {
    return (
      <Screen header={<NavHeader title="News settings" />}>
        <SkeletonList rows={4} />
      </Screen>
    );
  }

  const value = phone ?? savedPhone;
  const dirty = value.trim() !== savedPhone;
  const creators = Array.isArray(tenant.announcementCreators) ? tenant.announcementCreators : [];

  const flip = (key: 'birthdayAutoOn' | 'anniversaryAutoOn', next: boolean) =>
    save.mutate(
      { tenantId: tenant.id, patch: { [key]: next } },
      {
        onSuccess: () =>
          toast.show(
            key === 'birthdayAutoOn'
              ? next
                ? 'Birthday wishes will be posted.'
                : 'Birthday wishes are off.'
              : next
                ? 'Work anniversaries will be posted.'
                : 'Work anniversaries are off.',
          ),
        onError: (e) => toast.show(`Couldn’t save: ${e.message}`, 'danger'),
      },
    );

  const savePhone = (then?: () => void) => {
    const v = value.trim();
    if (v === savedPhone) {
      then?.();
      return;
    }
    save.mutate(
      { tenantId: tenant.id, patch: { hrNotifyPhone: v } },
      {
        onSuccess: () => {
          setPhone(null);
          if (then) then();
          else toast.show(v ? 'HR WhatsApp number saved.' : 'HR WhatsApp number cleared.');
        },
        onError: (e) => toast.show(`Couldn’t save: ${e.message}`, 'danger'),
      },
    );
  };

  const sendTest = () =>
    savePhone(() =>
      test.mutate(value.trim(), {
        onSuccess: () => {
          setConfirmTest(false);
          toast.show(`Test sent to ${value.trim()}.`);
        },
        onError: (e) => {
          setConfirmTest(false);
          toast.show(`Not sent: ${e.message}`, 'danger');
        },
      }),
    );

  return (
    <Screen header={<NavHeader title="News settings" />}>
      <LabelledSection title="Celebration posts">
        <ListCard>
          <ToggleRow
            title="Birthday wishes"
            subtitle="A card on each person’s birthday. Off hides past ones too."
            icon={Cake}
            module="news"
            value={!!tenant.birthdayAutoOn}
            busy={save.isPending}
            onChange={(v) => flip('birthdayAutoOn', v)}
          />
          <ToggleRow
            title="Work anniversaries"
            subtitle="A card on each joining anniversary. Off hides past ones too."
            icon={Award}
            module="news"
            value={!!tenant.anniversaryAutoOn}
            busy={save.isPending}
            onChange={(v) => flip('anniversaryAutoOn', v)}
          />
        </ListCard>
      </LabelledSection>

      <LabelledSection title="HR WhatsApp">
        <Card style={{ gap: space.md }}>
          <Text variant="caption" muted>
            Each day’s birthday and anniversary cards are sent to this WhatsApp number, so HR can share them with the team.
          </Text>
          <TextField
            label="WhatsApp number"
            value={value}
            onChangeText={(v) => setPhone(digits(v))}
            placeholder="e.g. 9876543210"
            keyboardType="phone-pad"
            maxLength={16}
          />
          <ActionRow>
            <Button variant="ghost" title="Send a test" icon={<Send />} disabled={!value.trim()} onPress={() => setConfirmTest(true)} />
            <Button title="Save" disabled={!dirty} loading={save.isPending && dirty} onPress={() => savePhone()} />
          </ActionRow>
        </Card>
      </LabelledSection>

      <LabelledSection title="Who can post news">
        <ListCard>
          <ListRow
            left={<ModuleBadge module="security" icon={ShieldCheck} />}
            title="Always"
            subtitle={ANNOUNCEMENT_CREATOR_ROLES.map((r) => ROLE_LABEL[r] ?? r).join(', ')}
            subtitleLines={3}
          />
          <ListRow
            left={<ModuleBadge module="people" icon={MessageCircle} />}
            title={creators.length ? `Also ${creators.length} ${creators.length === 1 ? 'person' : 'people'}` : 'Nobody else yet'}
            subtitle={creators.map((c) => c?.name).filter(Boolean).join(', ') || undefined}
            subtitleLines={3}
            chevron={canEditNewsCreators(user, tenant)}
            onPress={canEditNewsCreators(user, tenant) ? () => router.push('/admin/company/settings/access/news') : undefined}
            accessibilityHint={canEditNewsCreators(user, tenant) ? 'Opens the list to add or remove people' : undefined}
          />
        </ListCard>
        {!canEditNewsCreators(user, tenant) ? (
          <Text variant="caption" muted>
            A Super Admin chooses who else can post.
          </Text>
        ) : null}
      </LabelledSection>

      <ConfirmSheet
        visible={confirmTest}
        onClose={() => setConfirmTest(false)}
        title="Send a test on WhatsApp?"
        from={{ title: user?.name || 'You', subtitle: 'Sample cards', avatar: { name: user?.name || 'You' } }}
        to={{ title: value.trim() || '—', subtitle: 'WhatsApp', icon: MessageCircle, module: 'support' }}
        confirmLabel="Swipe to send"
        loading={test.isPending || save.isPending}
        onConfirm={sendTest}
        note="Sends a real WhatsApp message to this number. The number is saved first.">
        <SummaryCard
          rows={[
            { key: 'what', label: 'What is sent', value: 'A birthday card and a work-anniversary card' },
            { key: 'who', label: 'Shown on them', value: user?.name || 'You' },
          ]}
        />
      </ConfirmSheet>
    </Screen>
  );
}
