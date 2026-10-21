// The office map in the web build: map-html.ts in an iframe (react-native-webview has no web version).
// Messages go through window.postMessage, tagged so other frames' messages are ignored.

import { createElement, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { type MapEvent, mapHtml, type MapState } from '@/features/adminadvanced/map-html';

export type MapFrameProps = {
  state: Omit<MapState, 'type' | 'fit'>;
  fitKey: string;
  onPick: (lat: number, lng: number) => void;
  onError?: (message: string) => void;
  height: number;
};

const HTML = mapHtml();

export function MapFrame({ state, fitKey, onPick, onError, height }: MapFrameProps) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const lastFit = useRef('');
  const handlers = useRef({ onPick, onError });
  const [ready, setReady] = useState(false);
  const payload = JSON.stringify(state);

  useEffect(() => {
    handlers.current = { onPick, onError };
  });

  useEffect(() => {
    const listen = (e: MessageEvent) => {
      const d = e.data as { __dashMap?: boolean; data?: string } | null;
      if (!d || !d.__dashMap || e.source !== ref.current?.contentWindow) return;
      let m: MapEvent | null = null;
      try {
        m = JSON.parse(String(d.data)) as MapEvent;
      } catch {
        return;
      }
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'pick') handlers.current.onPick(m.lat, m.lng);
      else if (m.type === 'error') handlers.current.onError?.(m.message);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const fit = lastFit.current !== fitKey;
    lastFit.current = fitKey;
    ref.current?.contentWindow?.postMessage(JSON.stringify({ type: 'state', ...(JSON.parse(payload) as object), fit }), '*');
  }, [ready, payload, fitKey]);

  return (
    <View style={{ height, borderRadius: 20, overflow: 'hidden' }} accessibilityLabel="Map of the offices. Click the map to place the office.">
      {createElement('iframe', {
        ref,
        srcDoc: HTML,
        title: 'Office map',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
    </View>
  );
}
