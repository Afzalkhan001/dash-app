// One service desk request (/admin/service-desk/<id>): the desk's ticket screen with this viewer's
// actions (features/servicedesk/ticket-detail). The same screen serves /inbox/desk-it/<id>.

import { useLocalSearchParams } from 'expo-router';

import { TicketDetail } from '@/features/servicedesk/ticket-detail';

export default function ServiceDeskTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TicketDetail id={String(id ?? '')} via="desk" />;
}
