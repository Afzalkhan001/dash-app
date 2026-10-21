// One use-coins request (features/bountyadmin/redemption-review.tsx; the Inbox kind `bounty-coins`
// opens the same screen).

import { useLocalSearchParams } from 'expo-router';

import { RedemptionReviewScreen } from '@/features/bountyadmin/redemption-review';

export default function RedemptionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RedemptionReviewScreen id={typeof id === 'string' ? id : ''} />;
}
