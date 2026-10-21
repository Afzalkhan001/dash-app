// The office map on a phone: map-html.ts inside react-native-webview (bundled in Expo Go). The web
// build uses map-frame.web.tsx (an iframe) instead.

import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { DASH_URL } from '@/config';
import { type MapEvent, mapHtml, type MapState } from '@/features/adminadvanced/map-html';

export type MapFrameProps = {
  state: Omit<MapState, 'type' | 'fit'>;
  /** The view refits whenever this changes (another office picked, the first draw). */
  fitKey: string;
  onPick: (lat: number, lng: number) => void;
  onError?: (message: string) => void;
  height: number;
};

const HTML = mapHtml();

export function MapFrame({ state, fitKey, onPick, onError, height }: MapFrameProps) {
  const ref = useRef<WebView>(null);
  const lastFit = useRef('');
  const [ready, setReady] = useState(false);
  const payload = JSON.stringify(state);

  useEffect(() => {
    if (!ready) return;
    const fit = lastFit.current !== fitKey;
    lastFit.current = fitKey;
    const msg = JSON.stringify({ type: 'state', ...(JSON.parse(payload) as object), fit });
    ref.current?.injectJavaScript(`window.__dashMap && window.__dashMap(${msg}); true;`);
  }, [ready, payload, fitKey]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: MapEvent | null = null;
    try {
      m = JSON.parse(e.nativeEvent.data) as MapEvent;
    } catch {
      return;
    }
    if (m.type === 'ready') setReady(true);
    else if (m.type === 'pick') onPick(m.lat, m.lng);
    else if (m.type === 'error') onError?.(m.message);
  };

  return (
    <View style={{ height, borderRadius: 20, overflow: 'hidden' }}>
      <WebView
        ref={ref}
        source={{ html: HTML, baseUrl: DASH_URL }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        setBuiltInZoomControls={false}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        accessibilityLabel="Map of the offices. Tap the map to place the office."
      />
    </View>
  );
}
