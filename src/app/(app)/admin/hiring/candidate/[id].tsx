// One referred candidate — features/hiring/candidate-screen (also the Inbox's /inbox/referral/<id>).
// The screen re-checks its own gate (Referred Candidates: creators, the Application Manager, or anyone
// HR forwarded a referral to) and sends anyone else home.

import { useLocalSearchParams } from 'expo-router';

import { CandidateScreen } from '@/features/hiring/candidate-screen';

export default function CandidateRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  return <CandidateScreen id={id} />;
}
