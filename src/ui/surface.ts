// Which surface a control sits on. Sheet provides 'sheet' so fields inside it use the solid
// surfaceMuted fill (glass would vanish on the sheet's near-white background).
//
// Also two small colour helpers for light / dark (read them at render time or inside a
// themedStyles factory, never in a module-level constant):
//   isDarkScheme()               true while the live tokens hold the dark scheme
//   withAlpha(palette.ink, 0.07) a #RRGGBB token at an opacity: a dark hairline in light mode and a
//                                light hairline in dark mode; withAlpha(palette.surface, 0.7) is a
//                                translucent white in light mode.

import { createContext, useContext } from 'react';

import { currentColorScheme } from '@/theme/tokens';

export type SurfaceKind = 'screen' | 'sheet';

export const SurfaceContext = createContext<SurfaceKind>('screen');

export function useSurface(): SurfaceKind {
  return useContext(SurfaceContext);
}

/** True while the live tokens hold the dark scheme. The app remounts on a scheme change, so a render may read it. */
export function isDarkScheme(): boolean {
  return currentColorScheme() === 'dark';
}

/** A #RRGGBB colour (a palette token) at opacity `a`, as rgba(). Other colour strings come back unchanged. */
export function withAlpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
