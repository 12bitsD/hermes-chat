import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActionSheetIOS, Platform, Share, Clipboard } from 'react-native';
import { palette, type } from '../../theme';
import { Message } from '../../types';
import { FileCard } from './FileCard';
import { isNarrow } from '../../utils/platform';
import { haptic } from '../../utils/haptic';

export interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
}

/**
 * Minimal in-house markdown renderer. We avoid pulling react-native-markdown-display
 * for the v0 build to keep cold start fast and bundle small. This handles:
 * - # / ## / ### headings
 * - **bold**, *italic*, `code`
 * - bullet lists (- ...)
 * - numbered lists (1. ...)
 * - fenced code blocks (```...```)
 * - tables (| a | b |)
 * - blockquote (> ...)
 * - horizontal rules (---)
 * - inline links [text](url) → render as text
 *
 * The output is a flat list of `Block`s which we render as RN views.
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isLast }) => {
  const blocks = useMemo(() => parseMarkdown(message.content), [message.content]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const isUser = message.role === 'user';
  const showCursor = message.status === 'streaming';

  const onLongPress = useCallback(() => {
    haptic('medium');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Copy', 'Share', 'Cancel'], cancelButtonIndex: 2 },
        (idx) => {
          if (idx === 0) Clipboard.setString(message.content);
          if (idx === 1) Share.share({ message: message.content }).catch(() => {});
        },
      );
    } else {
      // Android / web: best-effort — copy and share, no native action sheet
      Clipboard.setString(message.content);
    }
  }, [message.content]);

  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}
    >
      {!isUser ? <MascotAvatar small={isNarrow} /> : null}

      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {message.attachments && message.attachments.length > 0 ? (
          <View style={styles.attachments}>
            {message.attachments.map((a, i) => (
              <FileCard
                key={a.id + i}
                name={a.name}
                kind={a.kind}
                size={a.size}
                uri={a.uri}
                previewUri={a.previewUri}
                expanded={expanded === i}
                onToggle={() => setExpanded(expanded === i ? null : i)}
                previewContent={a.kind === 'text' ? '' : undefined}
              />
            ))}
          </View>
        ) : null}

        {blocks.length === 0 && !showCursor ? (
          // Empty assistant placeholder — show a typing dot row
          isUser ? null : <TypingDots />
        ) : (
          blocks.map((b, i) => <Block key={i} block={b} />)
        )}

        {showCursor ? <Cursor /> : null}

        {isLast && message.status === 'done' ? <Text style={[styles.heartbeat, isUser ? styles.heartbeatUser : styles.heartbeatAssistant]}>✓</Text> : null}
        {message.status === 'error' ? <Text style={styles.errMark}>⚠</Text> : null}
      </View>
    </Pressable>
  );
};

// ─── Mascot avatar (left side of assistant messages) ────────────────────────

const MascotAvatar: React.FC<{ small?: boolean }> = ({ small = false }) => {
  const size = small ? 28 : 36;
  return (
    <View style={[styles.avatar, { width: size, height: size }]}>
      <Text style={{ fontSize: size * 0.6 }}>🌸</Text>
    </View>
  );
};

// ─── Typing dots & cursor ───────────────────────────────────────────────────

const TypingDots: React.FC = () => (
  <View style={styles.typingRow}>
    <Dot delay={0} />
    <Dot delay={150} />
    <Dot delay={300} />
  </View>
);

const Dot: React.FC<{ delay: number }> = ({ delay }) => {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let t1: any, t2: any, t3: any;
    const tick = () => {
      setPhase(1);
      t1 = setTimeout(() => setPhase(0), 220);
      t2 = setTimeout(() => setPhase(2), 440);
      t3 = setTimeout(tick, 700);
    };
    const start = setTimeout(tick, delay);
    return () => {
      clearTimeout(start);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [delay]);

  return <View style={[styles.dot, phase === 1 ? styles.dotMid : phase === 2 ? styles.dotHi : styles.dotLo]} />;
};

const Cursor: React.FC = () => {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn((v) => !v), 480);
    return () => clearInterval(t);
  }, []);
  return <Text style={[styles.cursor, on ? null : styles.cursorOff]}>▍</Text>;
};

// ─── parser / renderer (unchanged from v0) ─────────────────────────────────

type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: InlineSpan[] }
  | { kind: 'p'; text: InlineSpan[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'ul'; items: InlineSpan[][] }
  | { kind: 'ol'; items: InlineSpan[][] }
  | { kind: 'blockquote'; text: InlineSpan[] }
  | { kind: 'hr' }
  | { kind: 'table'; header: InlineSpan[]; rows: InlineSpan[][] };

type InlineSpan =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: InlineSpan[] }
  | { t: 'italic'; v: InlineSpan[] }
  | { t: 'code'; v: string }
  | { t: 'link'; text: string; url: string };

function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ kind: 'code', lang, text: buf.join('\n') });
      continue;
    }

    if (line.startsWith('|')) {
      const header = parseInline(line);
      i++;
      if (i < lines.length && /^\|[\s:|-]+\|/.test(lines[i])) i++;
      const rows: InlineSpan[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(parseInline(lines[i]));
        i++;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      const m = line.match(/^(#+)\s+(.*)$/)!;
      const level = m[1].length as 1 | 2 | 3;
      blocks.push({ kind: `h${level}` as 'h1' | 'h2' | 'h3', text: parseInline(m[2]) });
      i++;
      continue;
    }

    if (/^[-*+]\s/.test(line)) {
      const items: InlineSpan[][] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^[-*+]\s/, '')));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: InlineSpan[][] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\d+\.\s/, '')));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    if (line.startsWith('> ')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        buf.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ kind: 'blockquote', text: parseInline(buf.join(' ')) });
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|[-*+]\s|\d+\.\s|>\s|---+\s|\|)/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'p', text: parseInline(buf.join(' ')) });
  }
  return blocks;
}

function parseInline(s: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let i = 0;
  let buf = '';
  const flush = () => { if (buf) { spans.push({ t: 'text', v: buf }); buf = ''; } };
  while (i < s.length) {
    if (s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2);
      if (end > -1) { flush(); spans.push({ t: 'bold', v: parseInline(s.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    if (s[i] === '*' && s[i + 1] !== '*') {
      const end = findUnescaped(s, '*', i + 1);
      if (end > -1) { flush(); spans.push({ t: 'italic', v: parseInline(s.slice(i + 1, end)) }); i = end + 1; continue; }
    }
    if (s[i] === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > -1) { flush(); spans.push({ t: 'code', v: s.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (s[i] === '[') {
      const close = s.indexOf(']', i + 1);
      if (close > -1 && s[close + 1] === '(') {
        const end = s.indexOf(')', close + 2);
        if (end > -1) {
          flush();
          spans.push({ t: 'link', text: s.slice(i + 1, close), url: s.slice(close + 2, end) });
          i = end + 1;
          continue;
        }
      }
    }
    buf += s[i];
    i++;
  }
  flush();
  return spans;
}

function findUnescaped(s: string, ch: string, from: number): number {
  for (let i = from; i < s.length; i++) if (s[i] === ch) return i;
  return -1;
}

const Block: React.FC<{ block: Block }> = ({ block }) => {
  switch (block.kind) {
    case 'h1': return <Text style={styles.h1}><Inlines spans={block.text} /></Text>;
    case 'h2': return <Text style={styles.h2}><Inlines spans={block.text} /></Text>;
    case 'h3': return <Text style={styles.h3}><Inlines spans={block.text} /></Text>;
    case 'p':  return <Text style={styles.p}><Inlines spans={block.text} /></Text>;
    case 'code':
      return (
        <View style={styles.codeBlock}>
          {block.lang ? <Text style={styles.codeLang}>{block.lang}</Text> : null}
          <Text style={styles.codeText} selectable>{block.text}</Text>
        </View>
      );
    case 'ul':
      return (
        <View>
          {block.items.map((it, i) => (
            <Text key={i} style={styles.li}>•  <Inlines spans={it} /></Text>
          ))}
        </View>
      );
    case 'ol':
      return (
        <View>
          {block.items.map((it, i) => (
            <Text key={i} style={styles.li}>{i + 1}.  <Inlines spans={it} /></Text>
          ))}
        </View>
      );
    case 'blockquote':
      return (
        <View style={styles.bq}>
          <Text style={styles.bqText}><Inlines spans={block.text} /></Text>
        </View>
      );
    case 'hr': return <View style={styles.hr} />;
    case 'table':
      return (
        <View style={styles.table}>
          <View style={styles.tableRow}>
            {block.header.map((c, i) => (
              <Text key={i} style={[styles.tableCell, styles.tableHeader]}><Inlines spans={[c]} /></Text>
            ))}
          </View>
          {block.rows.map((row, ri) => (
            <View key={ri} style={styles.tableRow}>
              {row.map((c, ci) => (
                <Text key={ci} style={styles.tableCell}><Inlines spans={[c]} /></Text>
              ))}
            </View>
          ))}
        </View>
      );
  }
};

const Inlines: React.FC<{ spans: InlineSpan[] }> = ({ spans }) => (
  <>
    {spans.map((s, i) => {
      if (s.t === 'text') return <Text key={i}>{s.v}</Text>;
      if (s.t === 'bold') return <Text key={i} style={styles.bold}><Inlines spans={s.v} /></Text>;
      if (s.t === 'italic') return <Text key={i} style={styles.italic}><Inlines spans={s.v} /></Text>;
      if (s.t === 'code') return <Text key={i} style={styles.inlineCode}>{s.v}</Text>;
      if (s.t === 'link') return <Text key={i} style={styles.link}>{s.text}</Text>;
      return null;
    })}
  </>
);

// ─── Styles — iMessage-flavored bubbles on top of the Win95 palette ─────────

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 4, paddingHorizontal: 6 },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },

  avatar: {
    marginRight: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.surface,
    borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 4, borderBottomRightRadius: 14,
  },

  bubble: {
    maxWidth: '78%',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 16,
  },
  bubbleUser: {
    backgroundColor: palette.inkBlue,
    borderBottomRightRadius: 4, // tail
    marginLeft: 48,
  },
  bubbleAssistant: {
    backgroundColor: palette.surface,
    borderTopWidth: 1, borderLeftWidth: 1, borderTopColor: palette.bevelHi, borderLeftColor: palette.bevelHi,
    borderRightWidth: 1, borderBottomWidth: 1, borderRightColor: palette.bevelDark, borderBottomColor: palette.bevelDark,
    borderBottomLeftRadius: 4, // tail
  },

  attachments: { marginBottom: 6 },

  bold: { fontWeight: 'bold' },
  italic: { fontStyle: 'italic' },
  inlineCode: {
    fontFamily: 'Courier',
    backgroundColor: '#00000018',
    color: palette.ink,
  },
  link: { color: palette.inkLink, textDecorationLine: 'underline' },

  h1: { ...type.hero, color: palette.ink, marginTop: 4, marginBottom: 4 },
  h2: { ...type.title, color: palette.ink, marginTop: 4, marginBottom: 4 },
  h3: { ...type.uiBold, color: palette.ink, marginTop: 4, marginBottom: 4 },
  p: { ...type.body, color: palette.ink, marginBottom: 4 },
  li: { ...type.body, color: palette.ink, marginLeft: 4, marginBottom: 2 },

  // Code block — when inside an assistant bubble, invert so it pops
  codeBlock: {
    backgroundColor: '#1a1a2e', padding: 8, marginVertical: 4, borderRadius: 4,
  },
  codeLang: { ...type.ui, color: palette.cyberBlue, marginBottom: 2 },
  codeText: { ...type.code, color: '#e6e6fa' },

  bq: {
    borderLeftWidth: 3, borderLeftColor: palette.bevelDark,
    paddingLeft: 8, marginVertical: 4,
  },
  bqText: { ...type.body, color: palette.inkSoft, fontStyle: 'italic' },
  hr: { height: 1, backgroundColor: palette.bevelDark, marginVertical: 8 },
  table: {
    borderTopWidth: 1, borderLeftWidth: 1, borderColor: palette.bevelDark,
    marginVertical: 4, alignSelf: 'flex-start',
  },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    ...type.ui, color: palette.ink,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: palette.bevelDark,
  },
  tableHeader: { fontWeight: 'bold', backgroundColor: palette.surface },

  cursor: { color: palette.ink, fontWeight: 'bold' },
  cursorOff: { opacity: 0 },
  heartbeat: { color: palette.ok, fontSize: 10, marginTop: 2 },
  heartbeatUser: { color: '#ffffffcc', alignSelf: 'flex-end' },
  heartbeatAssistant: { alignSelf: 'flex-end' },
  errMark: { color: palette.err, fontSize: 12, marginTop: 2 },

  typingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, height: 18 },
  dot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 2, backgroundColor: palette.inkMuted },
  dotLo: { opacity: 0.35, transform: [{ translateY: 0 }] },
  dotMid: { opacity: 0.7, transform: [{ translateY: -2 }] },
  dotHi: { opacity: 1, transform: [{ translateY: -4 }] },
});
