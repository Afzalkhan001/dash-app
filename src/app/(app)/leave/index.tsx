// /leave was the Leave tab; it now lives in Me (the Leave segment). Old links land there.
import { MeRedirect } from '@/features/me/redirect';

export default function LeaveRedirect() {
  return <MeRedirect tab="leave" />;
}
