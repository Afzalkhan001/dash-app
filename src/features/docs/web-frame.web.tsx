// The web build's WebFrame (react-native-webview has no web support): an iframe holding the same page.
// Messages come back through window.postMessage from the frame; commands go in the same way.

import { type Ref, useEffect, useImperativeHandle, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type WebFrameHandle = { send: (cmd: Record<string, unknown>) => void };
export type WebFrameMessage = { type?: string; [k: string]: unknown };

export function WebFrame({
  html,
  height,
  onMessage,
  title,
  scroll = false,
  ref,
}: {
  html: string;
  height: number;
  onMessage?: (m: WebFrameMessage) => void;
  title: string;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<WebFrameHandle>;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  useImperativeHandle(ref, () => ({
    send: (cmd) => frame.current?.contentWindow?.postMessage(JSON.stringify({ __dash: 1, ...cmd }), '*'),
  }));
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      try {
        const m = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as WebFrameMessage;
        if (m && typeof m === 'object' && !m.__dash) onMessage?.(m);
      } catch {
        // not ours
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [onMessage]);
  return (
    <iframe
      ref={frame}
      title={title}
      srcDoc={html}
      scrolling={scroll ? 'yes' : 'no'}
      sandbox="allow-scripts allow-same-origin allow-modals"
      style={{ width: '100%', height, border: 0, display: 'block', background: 'transparent', borderRadius: 16 }}
    />
  );
}
