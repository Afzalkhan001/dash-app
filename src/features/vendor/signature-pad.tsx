// "Draw" signature, as on the website's SignaturePad (600x200 canvas, #0f172a ink, 2.4px round
// strokes, transparent background → PNG). Strokes are captured with PanResponder and drawn live
// with react-native-svg; "Use signature" rasterises them to the same 600x200 PNG in plain JS
// (features/vendor/png.ts) — no native view-shot needed, so it works in Expo Go.
// Lives in its own sheet so drawing never fights the page's scroll view. Two actions only (Clear,
// Use signature); a close (X) button in the sheet's header, the handle or a tap outside closes it.
// The pad is paper in both themes (ui.tsx paperColor): the ink stays the website's #0f172a,
// so in dark mode the box is a warm off-white sheet of paper, not the dark card.

import { Eraser, X } from 'lucide-react-native';
import { useState } from 'react';
import { type GestureResponderEvent, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { type Point, renderSignaturePng } from '@/features/vendor/png';
import { paperColor, paperInk, useOpenCount } from '@/features/vendor/ui';
import { lightPalette, palette, radius, space } from '@/theme/tokens';
import { ActionRow, Button, IconButton, isDarkScheme, Sheet, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
const OUT_W = 600;
const OUT_H = 200;
const INK = '#0f172a';
const LINE = 2.4;

export function SignaturePadSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: (dataUrl: string) => void }) {
  const session = useOpenCount(visible);
  return (
    <Sheet visible={visible} onClose={onClose} scroll={false}>
      {/* Own header so a visible close button sits beside the title (iOS has no back button). */}
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="heading" numberOfLines={1} accessibilityRole="header">
            Draw your signature
          </Text>
          <Text variant="label" muted numberOfLines={2}>
            Use your finger inside the box.
          </Text>
        </View>
        <IconButton accessibilityLabel="Close" onPress={onClose}>
          <X size={20} color={palette.text} strokeWidth={1.8} />
        </IconButton>
      </View>
      {session ? <PadBody key={session} onDone={onDone} /> : null}
    </Sheet>
  );
}

function pathOf(s: Point[]) {
  if (!s.length) return '';
  const [first, ...rest] = s;
  if (!rest.length) return `M ${first!.x} ${first!.y} L ${first!.x + 0.1} ${first!.y}`;
  return `M ${first!.x} ${first!.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(' ');
}

function PadBody({ onDone }: { onDone: (dataUrl: string) => void }) {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(false);

  // Points outside the box (finger slid off the edge) are simply clipped, on screen and in the PNG.
  const [responder] = useState(() => {
    const at = (e: GestureResponderEvent): Point => ({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        const p = at(e);
        setStrokes((s) => [...s, [p]]);
      },
      onPanResponderMove: (e) => {
        const p = at(e);
        setStrokes((s) => {
          if (!s.length) return [[p]];
          const last = s[s.length - 1]!;
          const prev = last[last.length - 1];
          if (prev && Math.abs(prev.x - p.x) < 0.75 && Math.abs(prev.y - p.y) < 0.75) return s;
          const copy = s.slice();
          copy[copy.length - 1] = [...last, p];
          return copy;
        });
      },
    });
  });

  const height = width ? width / 3 : 120;
  const scale = width ? OUT_W / width : 1;

  function use() {
    if (!strokes.length || !width) return;
    setBusy(true);
    // Let the button show its spinner before the (fast, synchronous) rasterising runs.
    setTimeout(() => {
      const scaled = strokes.map((s) => s.map((p) => ({ x: p.x * scale, y: p.y * scale })));
      const dataUrl = renderSignaturePng(scaled, { width: OUT_W, height: OUT_H, lineWidth: LINE, color: INK });
      setBusy(false);
      onDone(dataUrl);
    }, 16);
  }

  return (
    <View style={{ gap: space.md }}>
      <View
        {...responder.panHandlers}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="Signature box. Draw your signature with one finger."
        style={[styles.pad, { height }]}>
        <View pointerEvents="none" style={styles.baseline} />
        {!strokes.length ? (
          <View pointerEvents="none" style={styles.hint}>
            <Text variant="label" color={paperInk()}>
              Sign here
            </Text>
          </View>
        ) : null}
        {width ? (
          <Svg width={width} height={height} pointerEvents="none" style={StyleSheet.absoluteFill}>
            {strokes.map((s, i) => (
              <Path key={i} d={pathOf(s)} stroke={INK} strokeWidth={LINE / scale} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ))}
          </Svg>
        ) : null}
      </View>
      <ActionRow context="sheet">
        <Button title="Clear" variant="accent" icon={<Eraser />} onPress={() => setStrokes([])} disabled={!strokes.length || busy} />
        <Button title="Use signature" onPress={use} loading={busy} disabled={!strokes.length} />
      </ActionRow>
    </View>
  );
}

const styles = themedStyles(() => ({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  pad: {
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: isDarkScheme() ? lightPalette.textFaint : palette.textFaint,
    backgroundColor: paperColor(),
    overflow: 'hidden',
  },
  baseline: { position: 'absolute', left: '8%', right: '8%', bottom: '24%', height: 1, backgroundColor: isDarkScheme() ? lightPalette.hairline : palette.hairline },
  hint: { position: 'absolute', left: '8%', bottom: '26%' },
}));
