import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { palette, type } from '../../theme';
import { Message } from '../../types';
import { FileCard } from './FileCard';

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
 * - fenced code blocks (```...```)
 * - tables (| a | b |)
 * - blockquote (> ...)
 * - horizontal rules (---)
 * - inline links [text](url) → render as text
 *
 * For the v0 build that's plenty. Phase 1 swaps in a real engine (react-native-markdown-display
 * or markdown-it + custom renderer) with HTML / math support.
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isLast }) => {
  const blocks = useMemo(() => parseMarkdown(message.content), [message.content]);
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <View style={[styles.bubble, message.role === 'user' ? styles.user : styles.assistant]}>
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
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
      {message.status === 'streaming' ? <Text style={styles.cursor}>▍</Text> : null}
      {isLast && message.status === 'done' ? <Text style={styles.heartbeat}>✓</Text> : null}
    </View>
  );
};

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

// ─── parser ────────────────────────────────────────────────────────────────────

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
      i++; // skip closing fence
      blocks.push({ kind: 'code', lang, text: buf.join('\n') });
      continue;
    }

    if (line.startsWith('|')) {
      // crude table parse
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

    // paragraph (consume consecutive non-empty non-special lines)
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
    // bold **x**
    if (s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2);
      if (end > -1) { flush(); spans.push({ t: 'bold', v: parseInline(s.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    // italic *x*
    if (s[i] === '*' && s[i + 1] !== '*') {
      const end = findUnescaped(s, '*', i + 1);
      if (end > -1) { flush(); spans.push({ t: 'italic', v: parseInline(s.slice(i + 1, end)) }); i = end + 1; continue; }
    }
    // inline code `x`
    if (s[i] === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > -1) { flush(); spans.push({ t: 'code', v: s.slice(i + 1, end) }); i = end + 1; continue; }
    }
    // link [t](u)
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

// ─── renderer ──────────────────────────────────────────────────────────────────

const Block: React.FC<{ block: Block }> = ({ block }) => {
  switch (block.kind) {
    case 'h1':
      return <Text style={styles.h1}><Inlines spans={block.text} /></Text>;
    case 'h2':
      return <Text style={styles.h2}><Inlines spans={block.text} /></Text>;
    case 'h3':
      return <Text style={styles.h3}><Inlines spans={block.text} /></Text>;
    case 'p':
      return <Text style={styles.p}><Inlines spans={block.text} /></Text>;
    case 'code':
      return (
        <View style={styles.codeBlock}>
          {block.lang ? <Text style={styles.codeLang}>{block.lang}</Text> : null}
          <Text style={styles.codeText}>{block.text}</Text>
        </View>
      );
    case 'ul':
      return (
        <View>
          {block.items.map((it, i) => (
            <Text key={i} style={styles.li}>
              •  <Inlines spans={it} />
            </Text>
          ))}
        </View>
      );
    case 'ol':
      return (
        <View>
          {block.items.map((it, i) => (
            <Text key={i} style={styles.li}>
              {i + 1}.  <Inlines spans={it} />
            </Text>
          ))}
        </View>
      );
    case 'blockquote':
      return (
        <View style={styles.bq}>
          <Text style={styles.bqText}><Inlines spans={block.text} /></Text>
        </View>
      );
    case 'hr':
      return <View style={styles.hr} />;
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

const styles = StyleSheet.create({
  bubble: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginVertical: 4,
    maxWidth: '92%',
  },
  attachments: { marginBottom: 6 },
  user: {
    alignSelf: 'flex-end',
    backgroundColor: palette.inkBlue,
    borderRadius: 0,
  },
  assistant: {
    alignSelf: 'flex-start',
    backgroundColor: palette.paper,
  },
  // user color overrides
  bold: { fontWeight: 'bold' },
  italic: { fontStyle: 'italic' },
  inlineCode: {
    fontFamily: 'Courier',
    backgroundColor: palette.surface,
    color: palette.ink,
  },
  link: { color: palette.inkLink, textDecorationLine: 'underline' },
  // block-level
  h1: { ...type.hero, color: palette.ink, marginTop: 4, marginBottom: 4 },
  h2: { ...type.title, color: palette.ink, marginTop: 4, marginBottom: 4 },
  h3: { ...type.uiBold, color: palette.ink, marginTop: 4, marginBottom: 4 },
  p: { ...type.body, color: palette.ink, marginBottom: 4 },
  li: { ...type.body, color: palette.ink, marginLeft: 8, marginBottom: 2 },
  codeBlock: {
    backgroundColor: palette.ink,
    padding: 8,
    marginVertical: 4,
  },
  codeLang: {
    ...type.ui,
    color: palette.cyberBlue,
    marginBottom: 2,
  },
  codeText: {
    ...type.code,
    color: palette.bevelHi,
  },
  bq: {
    borderLeftWidth: 3,
    borderLeftColor: palette.bevelDark,
    paddingLeft: 8,
    marginVertical: 4,
  },
  bqText: { ...type.body, color: palette.inkSoft, fontStyle: 'italic' },
  hr: { height: 1, backgroundColor: palette.bevelDark, marginVertical: 8 },
  table: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: palette.bevelDark,
    marginVertical: 4,
  },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    ...type.ui,
    color: palette.ink,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.bevelDark,
  },
  tableHeader: {
    fontWeight: 'bold',
    backgroundColor: palette.surface,
  },
  cursor: { color: palette.ink, fontWeight: 'bold' },
  heartbeat: { color: palette.ok, fontSize: 10, alignSelf: 'flex-end' },
});
