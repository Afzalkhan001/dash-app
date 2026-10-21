// A real QR code, drawn on the phone (react-native-qrcode-svg on react-native-svg — no network, no server).
// Always black on white inside a white tile, in light and dark mode alike: scanners need a dark-on-light code
// with a quiet zone round it. qrSvgMarkup() draws the same code as SVG text for the poster and pass PDFs.

import genMatrix from 'react-native-qrcode-svg/src/genMatrix';
import transformMatrixIntoPath from 'react-native-qrcode-svg/src/transformMatrixIntoPath';
import QRCode from 'react-native-qrcode-svg';
import { useWindowDimensions, View } from 'react-native';

import { themedStyles } from '@/theme/themed';
import { palette, radius } from '@/theme/tokens';

// Scanner colours, not theme colours: they must not change with the theme.
const INK = '#0F172A';
const PAPER = '#FFFFFF';

/** How many modules wide the code is (21 for a pass, 33 for the check-in link). */
function moduleCount(value: string): number {
  try {
    return genMatrix(value, 'M').length || 25;
  } catch {
    return 25;
  }
}

export function QrImage({ value, size, label }: { value: string; size: number; label: string }) {
  const { width } = useWindowDimensions();
  if (!value) return null;
  // A 4-module quiet zone (scanners need it; in dark mode the card round the tile is dark), and the whole
  // tile fits the screen at 320 dp and in a sheet: the code shrinks rather than overflowing.
  const modules = moduleCount(value);
  const room = Math.max(120, width - 96);
  const fit = Math.min(size, Math.floor((room * modules) / (modules + 8)));
  const pad = Math.ceil((fit / modules) * 4);
  return (
    <View style={[styles.tile, { padding: pad, width: fit + pad * 2, height: fit + pad * 2 }]} accessible accessibilityRole="image" accessibilityLabel={label}>
      <QRCode value={value} size={fit} color={INK} backgroundColor={PAPER} ecl="M" quietZone={0} />
    </View>
  );
}

/** The same QR as an <svg> string (for the printable HTML). `px` is the drawn size. */
export function qrSvgMarkup(value: string, px: number): string {
  if (!value) return '';
  try {
    const matrix = genMatrix(value, 'M');
    const { cellSize, path } = transformMatrixIntoPath(matrix, px);
    const q = cellSize * 4; // the standard 4-module quiet zone
    const full = px + q * 2;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${full}" height="${full}" viewBox="${-q} ${-q} ${full} ${full}" shape-rendering="crispEdges">` +
      `<rect x="${-q}" y="${-q}" width="${full}" height="${full}" fill="${PAPER}"/>` +
      `<path d="${path}" stroke="${INK}" stroke-width="${cellSize}" fill="none"/></svg>`
    );
  } catch {
    return '';
  }
}

const styles = themedStyles(() => ({
  tile: {
    backgroundColor: PAPER,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
}));
