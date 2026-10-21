// Which parts of My Pay this person gets — the website's rules exactly:
//   the section: HR_SECTIONS 'pay' (dash.html ~L5306) = not a system role and salary|payslips|reimbursements;
//   inside it (MyPayPanel ~L5099): salary card ← 'salary', payslips (+ FY summary) ← 'payslips',
//   salary advances (and the old HR claims) ← 'reimbursements'.
// The server re-checks every request; this only decides what is shown and which queries run.

import { hrHas } from '@/lib/access';
import { useAccess } from '@/lib/use-access';

export function usePayAccess() {
  const a = useAccess();
  const on = a.sections.pay;
  return {
    loading: a.loading,
    pay: on,
    salary: on && hrHas(a.hr, 'salary'),
    payslips: on && hrHas(a.hr, 'payslips'),
    advances: on && hrHas(a.hr, 'reimbursements'),
    isSystemRole: a.isSystemRole,
    refetch: a.refetch,
  };
}
