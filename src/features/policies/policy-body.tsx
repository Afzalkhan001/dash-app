// Policy text is PLAIN TEXT by design (hr_policies.js: no HTML, no Markdown — a policy can't carry
// script) and the website shows it pre-wrapped. On a phone it is laid out for reading: blank lines
// split paragraphs, a short single line reads as a section heading, and lines starting with
// - * • or 1. / a) become list items with a hanging indent. Nothing else is interpreted, so the
// words always appear exactly as HR wrote them. Text is selectable for copying.

import { View } from 'react-native';

import { palette, space } from '@/theme/tokens';
import { Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
const LIST_RE = /^\s*([-*•–·]|\(?\d{1,3}[.)]|\(?[a-z][.)])\s+(.*)$/i;
const BULLET_RE = /^\s*[-*•–·]\s/;

type Item = { marker: string; text: string };
export type PolicyBlock = { kind: 'heading'; text: string } | { kind: 'para'; text: string } | { kind: 'list'; items: Item[] };

function isHeading(line: string) {
  const t = line.trim();
  return t.length > 0 && t.length <= 70 && /[A-Za-z]/.test(t) && !/[.,;!?]$/.test(t) && !BULLET_RE.test(t);
}

const marker = (m: string) => (/^[-*•–·]$/.test(m) ? '•' : m);

export function parsePolicy(body: string | null | undefined): PolicyBlock[] {
  const out: PolicyBlock[] = [];
  // The API may send a non-string (number, object) by mistake — treat it as no text rather than crash.
  const paras = (typeof body === 'string' ? body : '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
  for (const raw of paras) {
    const para = raw.replace(/^\n+/, '').replace(/\s+$/, '');
    if (!para.trim()) continue;
    const lines = para.split('\n');
    if (lines.length === 1 && isHeading(lines[0]!)) {
      out.push({ kind: 'heading', text: lines[0]!.trim() });
      continue;
    }
    let text: string[] = [];
    let items: Item[] = [];
    const flushText = () => {
      if (text.length) out.push({ kind: 'para', text: text.join('\n') });
      text = [];
    };
    const flushList = () => {
      if (items.length) out.push({ kind: 'list', items });
      items = [];
    };
    for (const line of lines) {
      const m = LIST_RE.exec(line);
      if (m) {
        flushText();
        items.push({ marker: marker(m[1]!), text: m[2]!.trim() });
      } else if (items.length && /^\s{2,}\S/.test(line)) {
        // indented continuation of the previous list item
        const last = items[items.length - 1]!;
        items[items.length - 1] = { ...last, text: `${last.text}\n${line.trim()}` };
      } else {
        flushList();
        text.push(line);
      }
    }
    flushText();
    flushList();
  }
  return out;
}

export function PolicyBody({ body }: { body: string | null | undefined }) {
  const blocks = parsePolicy(body);
  if (!blocks.length) {
    return (
      <Text variant="body" muted>
        This policy has no text.
      </Text>
    );
  }
  return (
    <View style={{ gap: space.md }}>
      {blocks.map((b, i) => {
        if (b.kind === 'heading') {
          return (
            <Text key={i} variant="bodyStrong" selectable accessibilityRole="header" style={i > 0 ? styles.heading : null}>
              {b.text}
            </Text>
          );
        }
        if (b.kind === 'para') {
          return (
            <Text key={i} variant="body" selectable style={styles.para}>
              {b.text}
            </Text>
          );
        }
        return (
          <View key={i} style={styles.list}>
            {b.items.map((it, j) => (
              <View key={j} style={styles.item}>
                <Text variant="body" color={palette.textMuted} style={[styles.para, styles.marker]}>
                  {it.marker}
                </Text>
                <Text variant="body" selectable style={[styles.para, styles.itemText]}>
                  {it.text}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// Long-form reading: body text with a slightly taller line (24) than the UI default (22).
const styles = themedStyles(() => ({
  heading: { marginTop: space.xxs },
  para: { lineHeight: 24 },
  list: { gap: space.xs },
  item: { flexDirection: 'row', gap: space.xs, paddingLeft: space.xxs },
  marker: { minWidth: 20, flexShrink: 0 },
  itemText: { flex: 1, minWidth: 0 },
}));
