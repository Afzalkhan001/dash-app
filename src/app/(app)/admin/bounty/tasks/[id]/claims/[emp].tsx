// Check one person's work on a bounty task (features/bountyadmin/claim-review.tsx; the Inbox kind
// `bounty-claim` opens the same screen).

import { useLocalSearchParams } from 'expo-router';

import { ClaimReviewScreen } from '@/features/bountyadmin/claim-review';

export default function ClaimReviewRoute() {
  const { id, emp } = useLocalSearchParams<{ id: string; emp: string }>();
  return <ClaimReviewScreen taskId={typeof id === 'string' ? id : ''} employeeId={typeof emp === 'string' ? emp : ''} />;
}
