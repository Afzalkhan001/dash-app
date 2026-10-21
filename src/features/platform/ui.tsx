// Small pieces the platform screens share: a switch row, and the company picker (a PillSelector that
// opens a sheet of every company).

import { Building2, Check } from 'lucide-react-native';
import { useState } from 'react';

import { companyName, companyStatus } from '@/api/platform';
import type { Tenant } from '@/api/me';
import { palette } from '@/theme/tokens';
import { Avatar, ListCard, ListRow, ModuleBadge, PillSelector, Sheet } from '@/ui';

/** One switch as a list row: the kit's SwitchRow (kept under this name for the platform screens). */
export { SwitchRow as ToggleRow } from '@/ui';


/**
 * "Company ⌄": a pill with the chosen company that opens a sheet listing every company. `allLabel` adds
 * an "every company" choice at the top (value '').
 */
export function CompanyPicker({
  tenants,
  value,
  onChange,
  allLabel,
}: {
  tenants: Tenant[];
  value: string;
  onChange: (id: string) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = tenants.find((t) => t.id === value) ?? null;
  const label = current ? companyName(current) : allLabel && !value ? allLabel : 'Choose a company';
  const pick = (id: string) => {
    setOpen(false);
    onChange(id);
  };
  return (
    <>
      <PillSelector icon={Building2} label={label} onPress={() => setOpen(true)} accessibilityLabel={`Company: ${label}`} accessibilityHint="Opens the list of companies" />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Choose a company">
        <ListCard>
          {allLabel ? (
            <ListRow
              left={<ModuleBadge module="policies" icon={Building2} />}
              title={allLabel}
              right={!value ? <Check size={20} color={palette.primaryText} /> : undefined}
              onPress={() => pick('')}
              accessibilityLabel={`${allLabel}${!value ? ', chosen' : ''}`}
            />
          ) : null}
          {tenants.map((t) => {
            const on = t.id === value;
            const name = companyName(t);
            return (
              <ListRow
                key={t.id}
                left={<Avatar name={name} size={40} ring={false} />}
                title={name}
                subtitle={companyStatus(t) === 'suspended' ? 'Suspended' : undefined}
                right={on ? <Check size={20} color={palette.primaryText} /> : undefined}
                onPress={() => pick(t.id)}
                accessibilityLabel={`${name}${on ? ', chosen' : ''}`}
              />
            );
          })}
        </ListCard>
      </Sheet>
    </>
  );
}
