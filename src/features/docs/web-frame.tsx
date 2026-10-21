// A sandboxed HTML page inside a screen (react-native-webview, in Expo Go): the PDF page viewer and the
// document previews. The page talks back with postMessage (JSON); commands go in through
// injectJavaScript as window.__cmd({...}). The web build has its own file (web-frame.web.tsx, an iframe).

import { type Ref, useImperativeHandle, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

export type WebFrameHandle = { send: (cmd: Record<string, unknown>) => void };
export type WebFrameMessage = { type?: string; [k: string]: unknown };

export function WebFrame({
  html,
  height,
  onMessage,
  title,
  scroll = false,
  style,
  ref,
}: {
  html: string;
  height: number;
  onMessage?: (m: WebFrameMessage) => void;
  /** Spoken name of the frame. */
  title: string;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<WebFrameHandle>;
}) {
  const view = useRef<WebView>(null);
  useImperativeHandle(ref, () => ({
    send: (cmd) => view.current?.injectJavaScript(`window.__cmd&&window.__cmd(${JSON.stringify({ __dash: 1, ...cmd })});true;`),
  }));
  return (
    <WebView
      ref={view}
      accessibilityLabel={title}
      originWhitelist={['*']}
      source={{ html }}
      onMessage={(e) => {
        try {
          const m = JSON.parse(e.nativeEvent.data) as WebFrameMessage;
          if (m && typeof m === 'object') onMessage?.(m);
        } catch {
          // not ours
        }
      }}
      scrollEnabled={scroll}
      javaScriptEnabled
      setSupportMultipleWindows={false}
      allowsLinkPreview={false}
      style={[{ height, backgroundColor: 'transparent' }, style]}
      containerStyle={{ height, flex: 0 }}
    />
  );
}
