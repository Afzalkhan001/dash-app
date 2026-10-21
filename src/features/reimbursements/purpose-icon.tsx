// The icon for a claim's purpose (Food, Fuel, Accommodation, Transportation).

import { BedDouble, Car, Fuel, type LucideIcon, Receipt, Utensils } from 'lucide-react-native';

/** The icon component for a purpose (pass it to ModuleBadge). */
export function purposeIcon(purpose?: string): LucideIcon {
  switch (purpose) {
    case 'food':
      return Utensils;
    case 'fuel':
      return Fuel;
    case 'accommodation':
      return BedDouble;
    case 'transportation':
      return Car;
    default:
      return Receipt;
  }
}

export function PurposeIcon({ purpose, size = 20, color }: { purpose?: string; size?: number; color: string }) {
  switch (purpose) {
    case 'food':
      return <Utensils size={size} color={color} />;
    case 'fuel':
      return <Fuel size={size} color={color} />;
    case 'accommodation':
      return <BedDouble size={size} color={color} />;
    case 'transportation':
      return <Car size={size} color={color} />;
    default:
      return <Receipt size={size} color={color} />;
  }
}
