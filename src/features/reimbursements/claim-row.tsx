// One of my expense claims in a list (Payno "transaction" row): what it was for and when, the amount,
// and where it stands.
//
//   [ icon ]  Food ························ ₹1,250
//             Mon, 19 Oct · TM_INT_REEL26   • Waiting
//
// Built on the kit's ActivityRow (amount over the status pill on the right), so it lines up with every
// other list in the app. Amounts in a row are whole rupees; the claim's own screen shows the paise.
// The pill is the claim's status, the same word as everywhere else ("Being paid" while Accounts is
// paying): the "Did you get ₹X?" question is asked once, in the screen's Needs you list, as Petty cash
// does. The list passes `today` (useTodayIst()) for the date.

import type { Reimbursement } from '@/api/reimbursements';
import { isoDay, purposeLabel, reimbursementStatus, rowInr } from '@/features/reimbursements/format';
import { purposeIcon } from '@/features/reimbursements/purpose-icon';
import { ActivityRow } from '@/ui';

export function ClaimRow({ claim, today, onPress }: { claim: Reimbursement; today?: string; onPress?: () => void }) {
  const st = reimbursementStatus(claim);
  const purpose = purposeLabel(claim.purpose);
  const day = isoDay(claim.created_at, today);
  const code = claim.keka_code ? String(claim.keka_code) : '';
  const subtitle = [day !== '—' ? day : '', code].filter(Boolean).join(' · ');
  const amount = rowInr(claim.amount);
  return (
    <ActivityRow
      module="expenses"
      icon={purposeIcon(claim.purpose)}
      title={purpose}
      subtitle={subtitle || null}
      value={amount}
      status={st}
      onPress={onPress}
      accessibilityLabel={[purpose, subtitle, amount, st.label].filter(Boolean).join(', ')}
    />
  );
}
