/**
 * MessageTools — collapsible list of tool calls the assistant made
 * inside a single message. Lets the user audit what the agent
 * actually did (read what, fetched which URL, ran which shell
 * command) so they can verify the reply was grounded in real work
 * rather than hallucinated.
 *
 * Design notes
 * ────────────
 *  - Hidden entirely when the message has zero tool events (R7 from
 *    the Phase 64 #3 review). No 'used 0 tools' filler.
 *  - Header line: "🔧 N tools used · 1.2s total" with a ▾/▴ chevron
 *    reflecting the expand state.
 *  - Each row: emoji + tool name + duration + 1-line preview.
 *  - Tap a row to expand its preview to 5 lines.
 *  - Running tools show a pulsing dot. Errors show ⚠ in red.
 *  - The preview is the agent's own pre-formatted string — we
 *    don't reformat. The component only truncates.
 *
 * Why a sub-component: keeps MessageBubble small and lets us
 * memoise this whole tree independently of the bubble (tool
 * events are static once the message is done).
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { neutral, type, radius } from '../../theme';
import type { ToolEvent } from '../../types';

const TOOL_ICON: Record<string, string> = {
  read_file: '📄', cat: '📄', view: '📄',
  write_file: '✏️', edit_file: '✏️',
  delete_file: '🗑', rm: '🗑',
  list_dir: '📂', ls: '📂',
  find: '🔍', grep: '🔍', glob: '🔍',
  web_search: '🔍', search: '🔍',
  web_fetch: '🌐', http_get: '🌐', fetch: '🌐',
  shell: '🔧', exec: '🔧', bash: '🔧', run_command: '🔧',
  send_email: '✉️', send_message: '💬',
  git_push: '📤', git_commit: '📤', deploy: '🚀',
  default: '🔨',
};

interface ToolRowProps {
  event: ToolEvent;
  expanded: boolean;
  onToggle: () => void;
}

const ToolRow: React.FC<ToolRowProps> = React.memo(({ event, expanded, onToggle }) => {
  const icon = TOOL_ICON[event.tool?.toLowerCase?.() ?? ''] ?? TOOL_ICON.default;
  const isRunning = event.status === 'running';
  const isError = event.status === 'error';
  const durLabel = isRunning
    ? 'running…'
    : (typeof event.durationMs === 'number'
        ? `${(event.durationMs / 1000).toFixed(1)}s`
        : '—');
  return (
    <Pressable onPress={onToggle} style={[styles.row, isError && styles.rowError]}>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.rowMain}>
        <View style={styles.rowHeader}>
          <Text style={styles.toolName}>{event.tool}</Text>
          {isRunning ? <PulseDot /> : null}
          <Text style={[styles.duration, isError && styles.durationError]}>
            {durLabel}
          </Text>
        </View>
        {event.preview ? (
          <Text style={styles.preview} numberOfLines={expanded ? 5 : 1}>
            {event.preview}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});
ToolRow.displayName = 'ToolRow';

const PulseDot: React.FC = () => {
  const opacity = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.dot, { opacity }]} />;
};

export interface MessageToolsProps {
  events: ToolEvent[];
}

export const MessageTools: React.FC<MessageToolsProps> = React.memo(({ events }) => {
  const [expanded, setExpanded] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  if (!events || events.length === 0) return null;

  const totalMs = events.reduce((s, e) => s + (e.durationMs ?? 0), 0);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => [styles.header, pressed ? styles.headerPressed : null]}
      >
        <Text style={styles.headerText}>
          🔧 {events.length} {events.length === 1 ? 'tool' : 'tools'} used · {(totalMs / 1000).toFixed(1)}s
        </Text>
        <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.list}>
          {events.map((e) => (
            <ToolRow
              key={e.id}
              event={e}
              expanded={expandedEvent === e.id}
              onToggle={() => setExpandedEvent(expandedEvent === e.id ? null : e.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});
MessageTools.displayName = 'MessageTools';

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4, marginBottom: 2,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: neutral.border,
    backgroundColor: neutral.surfaceMuted,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, paddingHorizontal: 8,
  },
  headerPressed: { backgroundColor: '#F2E6EA' },
  headerText: { ...type.caption, color: neutral.ink, fontWeight: '600' },
  chevron: { ...type.caption, color: neutral.inkMuted },
  list: { borderTopWidth: 1, borderTopColor: neutral.border },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingVertical: 6, paddingHorizontal: 8,
  },
  rowError: { backgroundColor: '#FCE4E4' },
  icon: { fontSize: 14, width: 18, textAlign: 'center', marginTop: 1 },
  rowMain: { flex: 1 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolName: { ...type.caption, color: neutral.ink, fontWeight: '600' },
  duration: { ...type.captionSm, color: neutral.inkMuted, marginLeft: 'auto' },
  durationError: { color: '#DC2626' },
  preview: { ...type.captionSm, color: neutral.inkMuted, marginTop: 1, fontFamily: 'Courier' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#007AFF' },
});
