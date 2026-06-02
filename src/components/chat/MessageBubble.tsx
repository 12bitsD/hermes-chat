import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActionSheetIOS, Platform, Share, Clipboard, Image } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../../theme';
import { Message } from '../../types';
import { FileCard } from './FileCard';
import { isNarrow } from '../../utils/platform';
import { haptic } from '../../utils/haptic';

export interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message, isLast }) => {
  const accent = useTheme();
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
      Clipboard.setString(message.content);
    }
  }, [message.content]);

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser ? <MascotAvatar small={isNarrow} /> : null}

      <View style={[
        styles.bubble,
        isUser
          ? [styles.bubbleUser, { backgroundColor: accent.accent.fg }]
          : [styles.bubbleAssistant, { borderColor: neutral.border }],
      ]}>
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

        {message.toolEvents && message.toolEvents.length > 0 ? (
          <View style={styles.toolStrip}>
            {message.toolEvents.map((t) => {
              const dot = t.status === 'running' ? '◔' : t.status === 'error' ? '✕' : '✓';
              const dotColor = t.status === 'running' ? '#007AFF' : t.status === 'error' ? '#DC2626' : '#16a34a';
              const dur = t.durationMs != null ? ` · ${(t.durationMs / 1000).toFixed(2)}s` : '';
              return (
                <View key={t.id} style={styles.toolChip}>
                  <Text style={[styles.toolDot, { color: dotColor }]}>{dot}</Text>
                  <Text style={styles.toolName}>{t.tool}</Text>
                  {dur ? <Text style={styles.toolDur}>{dur}</Text> : null}
                  {t.preview ? (
                    <Text style={styles.toolPreview} numberOfLines={2}>{t.preview}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {blocks.length === 0 && !showCursor ? (
          !isUser ? <TypingDots /> : null
        ) : (
          blocks.map((b, i) => <Block key={i} block={b} isUser={isUser} />)
        )}

        {showCursor ? <Cursor isUser={isUser} /> : null}
        {isLast && message.status === 'done' ? (
          <Text style={[styles.heartbeat, isUser ? styles.heartbeatUser : [styles.heartbeatAssistant, { color: neutral.inkMuted }]]}>✓</Text>
        ) : null}
        {message.status === 'error' ? <Text style={styles.errMark}>⚠ error</Text> : null}
      </View>
    </View>
  );
}, (prev, next) =>
  prev.isLast === next.isLast &&
  prev.message.id === next.message.id &&
  prev.message.role === next.message.role &&
  prev.message.content === next.message.content &&
  prev.message.status === next.message.status &&
  prev.message.attachments === next.message.attachments,
);

// ─── Mascot avatar ───────────────────────────────────────────────────────────

const MascotAvatar: React.FC<{ small?: boolean }> = ({ small = false }) => {
  const size = small ? 28 : 36;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={require('../../../assets/illustrations/avatar.png')}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    </View>
  );
};

// ─── Typing & cursor ──────────────────────────────────────────────────────────

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
    return () => { clearTimeout(start); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [delay]);
  return <View style={[styles.dot, phase === 1 ? styles.dotMid : phase === 2 ? styles.dotHi : styles.dotLo]} />;
};

const Cursor: React.FC<{ isUser: boolean }> = ({ isUser }) => {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn((v) => !v), 480);
    return () => clearInterval(t);
  }, []);
  return <Text style={[styles.cursor, isUser ? styles.cursorOnAccent : styles.cursorOnNeutral, on ? null : styles.cursorOff]}>▍</Text>;
};

// ─── parser ─────────────────────────────────────────────────────────────────

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
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      blocks.push({ kind: 'code', lang, text: buf.join('\n') });
      continue;
    }
    if (line.startsWith('|')) {
      const header = parseInline(line);
      i++;
      if (i < lines.length && /^\|[\s:|-]+\|/.test(lines[i])) i++;
      const rows: InlineSpan[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(parseInline(lines[i])); i++; }
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
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) { items.push(parseInline(lines[i].replace(/^[-*+]\s/, ''))); i++; }
      blocks.push({ kind: 'ul', items });
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items: InlineSpan[][] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(parseInline(lines[i].replace(/^\d+\.\s/, ''))); i++; }
      blocks.push({ kind: 'ol', items });
      continue;
    }
    if (line.startsWith('> ')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) { buf.push(lines[i].slice(2)); i++; }
      blocks.push({ kind: 'blockquote', text: parseInline(buf.join(' ')) });
      continue;
    }
    if (/^---+\s*$/.test(line)) { blocks.push({ kind: 'hr' }); i++; continue; }
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|[-*+]\s|\d+\.\s|>\s|---+\s|\|)/.test(lines[i])) { buf.push(lines[i]); i++; }
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
      const end = s.indexOf('*', i + 1);
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
          i = end + 1; continue;
        }
      }
    }
    buf += s[i]; i++;
  }
  flush();
  return spans;
}

const Block: React.FC<{ block: Block; isUser: boolean }> = ({ block, isUser }) => {
  const codeTextColor = isUser ? '#fff' : neutral.ink;
  const codeBlockBg = isUser ? '#00000022' : neutral.bg;
  switch (block.kind) {
    case 'h1': return <Text style={[styles.h1, isUser && styles.h1User]}><Inlines spans={block.text} /></Text>;
    case 'h2': return <Text style={[styles.h2, isUser && styles.h2User]}><Inlines spans={block.text} /></Text>;
    case 'h3': return <Text style={[styles.h3, isUser && styles.h3User]}><Inlines spans={block.text} /></Text>;
    case 'p':  return <Text style={[styles.p, isUser && styles.pUser]}><Inlines spans={block.text} /></Text>;
    case 'code':
      return (
        <View style={[styles.codeBlock, { backgroundColor: codeBlockBg }]}>
          {block.lang ? <Text style={[styles.codeLang, isUser && styles.codeLangUser]}>{block.lang}</Text> : null}
          <Text style={[styles.codeText, { color: codeTextColor }]} selectable>{block.text}</Text>
        </View>
      );
    case 'ul':
      return (
        <View>
          {block.items.map((it, i) => (
            <Text key={i} style={[styles.li, isUser && styles.liUser]}>•  <Inlines spans={it} /></Text>
          ))}
        </View>
      );
    case 'ol':
      return (
        <View>
          {block.items.map((it, i) => (
            <Text key={i} style={[styles.li, isUser && styles.liUser]}>{i + 1}.  <Inlines spans={it} /></Text>
          ))}
        </View>
      );
    case 'blockquote':
      return (
        <View style={[styles.bq, { borderLeftColor: isUser ? '#ffffff66' : neutral.border }]}>
          <Text style={[styles.bqText, isUser && styles.bqTextUser]}><Inlines spans={block.text} /></Text>
        </View>
      );
    case 'hr': return <View style={[styles.hr, { backgroundColor: isUser ? '#ffffff33' : neutral.border }]} />;
    case 'table':
      return (
        <View style={[styles.table, { borderColor: isUser ? '#ffffff33' : neutral.border }]}>
          <View style={styles.tableRow}>
            {block.header.map((c, i) => (
              <Text key={i} style={[styles.tableCell, styles.tableHeader, isUser && styles.tableHeaderUser]}><Inlines spans={[c]} /></Text>
            ))}
          </View>
          {block.rows.map((row, ri) => (
            <View key={ri} style={styles.tableRow}>
              {row.map((c, ci) => (
                <Text key={ci} style={[styles.tableCell, isUser && styles.tableCellUser, { borderColor: isUser ? '#ffffff33' : neutral.border }]}><Inlines spans={[c]} /></Text>
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

// ─── styles (flat) ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 6, paddingHorizontal: space.sm },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },

  avatar: {
    marginRight: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: neutral.surfaceMuted, overflow: 'hidden',
  },

  bubble: {
    maxWidth: '78%',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAssistant: {
    backgroundColor: neutral.surface,
    borderWidth: 1, borderBottomLeftRadius: 4,
  },

  attachments: { marginBottom: 6 },
  toolStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  toolChip: {
    backgroundColor: '#00000010', borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%',
  },
  toolDot: { fontSize: 11, fontWeight: '700' },
  toolName: { ...type.caption, color: neutral.ink, fontFamily: 'Courier' },
  toolDur: { ...type.caption, color: neutral.inkMuted, fontSize: 10 },
  toolPreview: { ...type.caption, color: neutral.inkSoft, fontSize: 10, marginTop: 2 },

  bold: { fontWeight: '600' },
  italic: { fontStyle: 'italic' },
  inlineCode: {
    fontFamily: 'Courier',
    backgroundColor: '#00000018',
  },
  link: { color: '#007AFF', textDecorationLine: 'underline' },

  h1: { ...type.display, color: neutral.ink, marginTop: 4, marginBottom: 4, fontSize: 20 },
  h1User: { color: '#fff' },
  h2: { ...type.title, color: neutral.ink, marginTop: 4, marginBottom: 4 },
  h2User: { color: '#fff' },
  h3: { ...type.uiBold, fontSize: 14, color: neutral.ink, marginTop: 4, marginBottom: 4 },
  h3User: { color: '#fff' },
  p: { ...type.body, color: neutral.ink, marginBottom: 4 },
  pUser: { color: '#fff' },
  li: { ...type.body, color: neutral.ink, marginLeft: 4, marginBottom: 2 },
  liUser: { color: '#fff' },

  codeBlock: { padding: 8, marginVertical: 4, borderRadius: 6 },
  codeLang: { ...type.caption, color: neutral.inkMuted, marginBottom: 2 },
  codeLangUser: { color: '#ffffff99' },
  codeText: { ...type.code },

  bq: { borderLeftWidth: 3, paddingLeft: 8, marginVertical: 4 },
  bqText: { ...type.body, color: neutral.inkSoft, fontStyle: 'italic' },
  bqTextUser: { color: '#fff' },
  hr: { height: 1, marginVertical: 8 },
  table: { borderTopWidth: 1, borderLeftWidth: 1, marginVertical: 4, alignSelf: 'flex-start' },
  tableRow: { flexDirection: 'row' },
  tableCell: { ...type.caption, color: neutral.ink, paddingHorizontal: 6, paddingVertical: 3, borderRightWidth: 1, borderBottomWidth: 1 },
  tableCellUser: { color: '#fff' },
  tableHeader: { fontWeight: '600', backgroundColor: neutral.surfaceMuted },
  tableHeaderUser: { backgroundColor: '#ffffff22', color: '#fff' },

  cursor: { fontWeight: '600' },
  cursorOnAccent: { color: '#fff' },
  cursorOnNeutral: { color: neutral.ink },
  cursorOff: { opacity: 0 },
  heartbeat: { fontSize: 10, marginTop: 2 },
  heartbeatUser: { color: '#ffffffcc', alignSelf: 'flex-end' },
  heartbeatAssistant: { alignSelf: 'flex-end' },
  errMark: { color: neutral.err, fontSize: 11, marginTop: 2, fontWeight: '600' },

  typingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, height: 18 },
  dot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 2, backgroundColor: neutral.inkMuted },
  dotLo: { opacity: 0.3, transform: [{ translateY: 0 }] },
  dotMid: { opacity: 0.6, transform: [{ translateY: -2 }] },
  dotHi: { opacity: 1, transform: [{ translateY: -4 }] },
});
