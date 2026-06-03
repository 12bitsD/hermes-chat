import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActionSheetIOS, Platform, Share, Clipboard, Image, Animated, Easing, TextInput } from 'react-native';
import { neutral, type, space, radius, useTheme } from '../../theme';
import { Message } from '../../types';
import { FileCard } from './FileCard';
import { MessageTools } from './MessageTools';
import { isNarrow } from '../../utils/platform';
import { haptic } from '../../utils/haptic';
import { speak } from '../../utils/speak';

export interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
  onSyncToHermes?: () => void;
  onSend?: (text: string) => void;
  onEdit?: (newText: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message, isLast, onSyncToHermes, onSend, onEdit }) => {
  const accent = useTheme();
  const blocks = useMemo(() => parseMarkdown(message.content), [message.content]);
  const [expanded, setExpanded] = useState<number | null>(null);
  // Edit mode is only used for user bubbles. We swap the rendered text
  // for a TextInput + Save/Cancel bar; on Save we call onEdit(text)
  // which the parent uses to truncate messages and re-send.
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);

  const isUser = message.role === 'user';
  const showCursor = message.status === 'streaming';

  const onLongPress = useCallback(() => {
    haptic('medium');
    if (Platform.OS === 'ios') {
      // iOS gets a real action sheet. We only offer Edit on user
      // bubbles because re-sending an assistant turn would change the
      // role of this message and break sync ordering.
      const baseUser = onEdit ? ['Edit', 'Copy', 'Share', 'Speak', 'Cancel'] : ['Copy', 'Share', 'Speak', 'Cancel'];
      const baseAsst = onSyncToHermes
        ? ['Copy', 'Share', 'Speak', '📡 Sync from Hermes', 'Regenerate', 'Cancel']
        : ['Copy', 'Share', 'Speak', 'Regenerate', 'Cancel'];
      const opts = isUser ? baseUser : baseAsst;
      const cancelIdx = opts.length - 1;
      const editIdx   = (isUser && onEdit) ? 0 : -1;
      const regenIdx  = isUser ? -1 : (onSyncToHermes ? 4 : 3);
      const syncIdx   = isUser ? -1 : (onSyncToHermes ? 3 : -1);
      // Offsets shift when Edit is the first option.
      const copyIdx   = editIdx >= 0 ? 1 : 0;
      const shareIdx  = editIdx >= 0 ? 2 : 1;
      const speakIdx  = editIdx >= 0 ? 3 : 2;
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opts, cancelButtonIndex: cancelIdx, destructiveButtonIndex: undefined },
        (idx) => {
          if (idx === editIdx && onEdit) { haptic('light'); setEditing(true); return; }
          if (idx === copyIdx) Clipboard.setString(message.content);
          else if (idx === shareIdx) Share.share({ message: message.content }).catch(() => {});
          else if (idx === speakIdx) speak(message.content);
          else if (idx === syncIdx && onSyncToHermes) { haptic('light'); onSyncToHermes(); }
          else if (idx === regenIdx) haptic('warning');
        },
      );
    } else {
      // Android / web: copy and let the user long-press the system paste menu for more
      Clipboard.setString(message.content);
    }
  }, [message.content, isUser, onSyncToHermes, onEdit]);

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser ? <MascotAvatar small={isNarrow} /> : null}

      <Pressable
        onLongPress={onLongPress}
        style={[
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

        {!isUser && message.toolEvents && message.toolEvents.length > 0 ? (
          <MessageTools events={message.toolEvents} />
        ) : null}

        {isUser && editing ? (
          <View>
            <TextInput
              value={editDraft}
              onChangeText={setEditDraft}
              multiline
              autoFocus
              style={styles.editInput}
              placeholderTextColor={neutral.inkMuted}
            />
            <View style={styles.editBar}>
              <Pressable
                onPress={() => { setEditing(false); setEditDraft(message.content); haptic('light'); }}
                hitSlop={6}
                style={[styles.editBtn, { backgroundColor: 'transparent', borderColor: neutral.border }]}
              >
                <Text style={[styles.editBtnText, { color: neutral.ink }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const next = editDraft.trim();
                  if (!next || !onEdit) { haptic('error'); return; }
                  setEditing(false);
                  onEdit(next);
                }}
                hitSlop={6}
                style={[styles.editBtn, { backgroundColor: accent.accent.fg }]}
              >
                <Text style={[styles.editBtnText, { color: '#fff' }]}>Save & resend</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
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
            {message.status === 'queued' ? <Text style={styles.errMark}>⏳ queued</Text> : null}
            {message.status === 'failed-queued' ? <Text style={styles.errMark}>❌ could not resend — tap to retry</Text> : null}
            {!isUser && message.status === 'done' && isLast && onSend ? (
              <QuickReplies
                onPick={(text) => { haptic('light'); onSend(text); }}
                content={message.content}
              />
            ) : null}
            {isUser && onEdit && Platform.OS !== 'ios' ? (
              <Pressable
                onPress={() => { setEditing(true); haptic('light'); }}
                hitSlop={6}
                style={styles.editInlineBtn}
              >
                <Text style={styles.editInlineText}>✏️ Edit</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </Pressable>
    </View>
  );
}, (prev, next) =>
  prev.isLast === next.isLast &&
  prev.message.id === next.message.id &&
  prev.message.role === next.message.role &&
  prev.message.content === next.message.content &&
  prev.message.status === next.message.status &&
  prev.message.attachments === next.message.attachments &&
  prev.message.toolEvents === next.message.toolEvents &&
  prev.message.approval === next.message.approval,
);

// ─── Mascot avatar ───────────────────────────────────────────────────────────

/**
 * MascotAvatar — the assistant's identity in the chat stream.
 *
 * avatar.png is 256×256 with the character centered. We don't crop
 * it to a circle (the artwork is full-body, cropping cuts the face)
 * — we render it square with a pink accent border + drop shadow so
 * it reads as a "sticker" rather than a photo avatar. Size 36
 * desktop / 32 narrow.
 */
const MascotAvatar: React.FC<{ small?: boolean }> = ({ small = false }) => {
  const size = small ? 32 : 36;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: 8 }]}>
      <Image
        source={require('../../../assets/illustrations/avatar.png')}
        style={{ width: size, height: size, borderRadius: 8 }}
        resizeMode="cover"
      />
    </View>
  );
};

// ─── Quick replies (under the last assistant message) ───────────────────────

/**
 * QuickReplies — small chip row under the last assistant reply.
 * One-tap context-aware follow-ups. Designed to make the
 * "habit loop" tight: see answer → tap next action.
 *
 * Suggestions are inferred from the message content. For now we
 * ship three universal chips; the heuristic can grow.
 */
const QuickReplies: React.FC<{ onPick: (text: string) => void; content: string }> = ({ onPick, content }) => {
  const c = content.toLowerCase();
  const chips: { label: string; text: string }[] = [];
  // Heuristic 1: short answer → ask for more
  if (content.length < 320 && !c.includes('```')) {
    chips.push({ label: 'More detail', text: 'Can you go deeper? More detail please.' });
  }
  // Heuristic 2: code block → explain it
  if (c.includes('```')) {
    chips.push({ label: 'Explain code', text: 'Walk me through this code line by line.' });
  }
  // Heuristic 3: bullet list → summarize or convert
  if (/^\s*[-*]\s/m.test(content)) {
    chips.push({ label: 'Summarize', text: 'Summarize the above in 2 sentences.' });
  }
  // Always-offer chips
  chips.push({ label: '👍 Continue', text: 'Continue. What else?' });

  const accent = useTheme();

  return (
    <View style={styles.quickReplies}>
      {chips.map((c, i) => (
        <QuickReplyChip key={i} label={c.label} onPress={() => onPick(c.text)} accent={accent} />
      ))}
    </View>
  );
};

/**
 * QuickReplyChip — a one-tap follow-up under an assistant reply.
 *
 * Micro-interaction: spring lifts to translateY -2 + accent-soft tint
 * + scale 0.96 on press. The chip lives inside a single Animated.Value
 * so the lift + scale + tint read as one motion, not three.
 */
const QuickReplyChip: React.FC<{
  label: string;
  onPress: () => void;
  accent: ReturnType<typeof useTheme>;
}> = ({ label, onPress, accent }) => {
  const press = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);
  const lift = press.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const tintOpacity = press.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const animateTo = (to: number) => {
    Animated.spring(press, { toValue: to, useNativeDriver: true, friction: 6, tension: 220 }).start();
  };
  const handlePressIn = () => animateTo(1);
  const handlePressOut = () => animateTo(0);

  return (
    <Animated.View style={{ transform: [{ translateY: lift }, { scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.quickReplyChip,
          focused ? styles.quickReplyChipFocused : null,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: accent.accent.soft, opacity: tintOpacity, borderRadius: 12 },
          ]}
        />
        <Text style={styles.quickReplyText} numberOfLines={1}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
};

// ─── Typing & cursor ──────────────────────────────────────────────────────────

/**
 * ThinkingMascot — a kawaii sparkle-ringed avatar that bobs up and
 * down while the agent is composing. Replaces the old 3-dot typing
 * indicator with something the user can *see*. The avatar reuses
 * the small `avatar.png` (GPT-Image-2) at 28×28 so it stays cheap.
 * A 6-point sparkle ring rotates around it via Animated.timing.
 */
const ThinkingMascot: React.FC = () => {
  const ring = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const r = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 4000, useNativeDriver: true, easing: Easing.linear }));
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -4, duration: 350, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(bob, { toValue: 0,  duration: 350, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ]),
    );
    r.start(); b.start();
    return () => { r.stop(); b.stop(); };
  }, [ring, bob]);
  const rotate = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={styles.thinkingWrap}>
      <Animated.View pointerEvents="none" style={[styles.thinkingRing, { transform: [{ rotate }] }]}>
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i / 6) * Math.PI * 2;
          const r = 18;
          return (
            <Text key={i} style={[styles.thinkingSparkle, { transform: [{ translateX: Math.cos(a) * r }, { translateY: Math.sin(a) * r }] }]}>
              {i % 2 === 0 ? '✦' : '✧'}
            </Text>
          );
        })}
      </Animated.View>
      <Animated.View style={{ transform: [{ translateY: bob }] }}>
        <Image source={require('../../../assets/illustrations/avatar.png')} style={styles.thinkingAvatar} />
      </Animated.View>
    </View>
  );
};

const TypingDots: React.FC = () => (
  <View style={styles.typingRow}>
    <ThinkingMascot />
  </View>
);

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
    backgroundColor: '#FFE4EC', borderWidth: 1, borderColor: '#FFB6C1', borderRadius: 8,
    shadowColor: '#FFB6C1', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 2,
  },

  bubble: {
    maxWidth: '78%',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  bubbleUser: { borderBottomRightRadius: 4, shadowColor: '#FFB6C1', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 2 },
  bubbleAssistant: {
    backgroundColor: neutral.surface,
    borderWidth: 1, borderBottomLeftRadius: 4,
    shadowColor: '#00000020', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
  },

  attachments: { marginBottom: 6 },
  toolStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  toolChip: {
    backgroundColor: '#00000010', borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%',
  },
  toolDot: { fontSize: 11, fontWeight: '700' },
  toolName: { ...type.captionSm, color: neutral.ink, fontFamily: 'Courier' },
  toolDur: { ...type.captionXs, color: neutral.inkMuted, fontSize: 10 },
  toolPreview: { ...type.captionXs, color: neutral.inkSoft, fontSize: 10, marginTop: 2 },

  bold: { fontWeight: '600' },
  italic: { fontStyle: 'italic' },
  inlineCode: {
    fontFamily: 'Courier',
    backgroundColor: '#00000018',
  },
  link: { color: '#007AFF', textDecorationLine: 'underline' },

  h1: { ...type.title, color: neutral.ink, marginTop: 4, marginBottom: 4, fontSize: 22 },
  h1User: { color: '#fff' },
  h2: { ...type.title, color: neutral.ink, marginTop: 4, marginBottom: 4, fontSize: 19 },
  h2User: { color: '#fff' },
  h3: { ...type.uiBold, fontSize: 15, color: neutral.ink, marginTop: 4, marginBottom: 4 },
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
  quickReplies: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  quickReplyChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 12, borderWidth: 1, borderColor: neutral.border,
    backgroundColor: neutral.surface, overflow: 'hidden',
  },
  quickReplyChipFocused: {
    borderColor: '#FFB6C1',
    shadowColor: '#FFB6C1', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 4, elevation: 2,
  },
  quickReplyText: { ...type.captionSm, color: neutral.ink, fontSize: 12 },
  heartbeatUser: { color: '#ffffffcc', alignSelf: 'flex-end' },
  heartbeatAssistant: { alignSelf: 'flex-end' },
  errMark: { color: neutral.err, fontSize: 11, marginTop: 2, fontWeight: '600' },
  editInput: {
    ...type.body,
    color: '#000',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 40,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#FFB6C1',
  },
  editBar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  editBtnText: { ...type.caption, fontSize: 12, fontWeight: '700' },
  editInlineBtn: { alignSelf: 'flex-end', marginTop: 4, paddingHorizontal: 4, paddingVertical: 2 },
  editInlineText: { ...type.captionSm, fontSize: 11, color: '#ffffffcc', fontStyle: 'italic' },

  typingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, height: 44, paddingLeft: 0 },
  thinkingWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  thinkingRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  thinkingSparkle: { position: 'absolute', fontSize: 10, color: neutral.inkMuted },
  thinkingAvatar: { width: 28, height: 28, borderRadius: 14 },
});
