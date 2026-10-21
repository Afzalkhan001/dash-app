// "Delete data" — the website's irreversible admin deletes, one place on the phone. Each tool shows only
// to the people the website (or, for service requests, the owner's rule) allows; see
// features/adminadvanced/access.ts. Every tool asks for the item's name and a swipe before it deletes.

import { useRouter } from 'expo-router';
import { Boxes, Building2, Headset } from 'lucide-react-native';
import { View } from 'react-native';

import { deleteTools } from '@/features/adminadvanced/access';
import { GateFallback, useGate } from '@/features/adminadvanced/ui';
import { Banner, ListCard, ListRow, ModuleBadge, NavHeader, Screen, Text } from '@/ui';

export default function DeleteDataScreen() {
  const router = useRouter();
  const { access, pending } = useGate();
  const tools = deleteTools(access);
  const header = <NavHeader title="Delete data" />;
  if (!tools.any) return <GateFallback pending={pending} header={header} />;

  return (
    <Screen header={header}>
      <Banner
        tone="danger"
        title="These can’t be undone"
        message="Deleted data is gone for good, on the website too. Each one asks you to type the name before you swipe."
      />
      <View style={{ gap: 8 }}>
        <ListCard>
          {tools.company ? (
            <ListRow
              left={<ModuleBadge module="policies" icon={Building2} />}
              title="Delete a company"
              subtitle="Its people, departments, projects and all their records"
              subtitleLines={2}
              chevron
              onPress={() => router.push('/admin/advanced/delete-company')}
            />
          ) : null}
          {tools.assets ? (
            <ListRow
              left={<ModuleBadge module="support" icon={Boxes} />}
              title="Delete all assets"
              subtitle="Every asset in the catalogue, with its history"
              subtitleLines={2}
              chevron
              onPress={() => router.push('/admin/advanced/delete-assets')}
            />
          ) : null}
          {tools.ticket ? (
            <ListRow
              left={<ModuleBadge module="support" icon={Headset} />}
              title="Delete a service request"
              subtitle="A ticket, asset request, office request or complaint"
              subtitleLines={2}
              chevron
              onPress={() => router.push('/admin/advanced/delete-ticket')}
            />
          ) : null}
        </ListCard>
        <Text variant="caption" muted>
          Nobody is emailed or messaged when you delete something here.
        </Text>
      </View>
    </Screen>
  );
}
