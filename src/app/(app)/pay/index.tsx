// /pay was My Pay; it now lives in Me (the Pay segment, src/features/me/pay-view.tsx). Old links land
// there. The pay detail screens (/pay/payslips, /pay/salary, /pay/fy, …) are unchanged.
import { MeRedirect } from '@/features/me/redirect';

export default function PayRedirect() {
  return <MeRedirect tab="pay" />;
}
