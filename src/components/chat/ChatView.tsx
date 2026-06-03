import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform,
  KeyboardAvoidingView, TextInput, Animated, Easing,
} from 'react-native';
import { neutral, type, space, radius, useTheme } from '../../theme';
import { Button } from '../win95';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './EmptyState';
import { ApprovalModal } from '../ApprovalModal';
import { QuickActionSheet } from './QuickActionSheet';
import { useAppStore } from '../../store/app';
import { FileCard } from './FileCard';
import { useChatController } from '../../features/chat/useChatController';
import { isNarrow } from '../../utils/platform';
import { haptic } from '../../utils/haptic';
import type { ToolEvent } from '../../types';

export const ChatView: React.FC<{ onOpenDrawer?: () => void }> = () => {
  const accent = useTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const {
    conversationId,
    messages,
    providerOk,
    settings,
    pendingApproval,
    activeRunStartedAtRef,
    input,
    setInput,
    inputFocused,
    setInputFocused,
    pendingFiles,
    expandedFile,
    setExpandedFile,
    streaming,
    streamError,
    setStreamError,
    voiceOn,
    voicePartial,
    createConversation,
    toggleVoice,
    startVoicePtt,
    stopVoicePttAndSend,
    attachFile,
    removeFile,
    resolveApproval,
    syncFromHermes,
    send,
    handleEditUserMessage,
    onKeyPress,
    onStop,
    scheduleStickToBottom,
  } = useChatController();

  const stickToBottom = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  // EmptyState quick action sheet — when the user taps a primary card
  // (Jobs / Tool / Activity), we open a bottom sheet listing the
  // relevant items. "last-turns" instead scrolls to the bottom of
  // the current conversation (no sheet).
  type EmptySheet = 'jobs' | 'tool' | 'activity' | null;
  const [openSheet, setOpenSheet] = useState<EmptySheet>(null);

  const scrollToLastTurns = useCallback(() => {
    if (messages.length === 0) return;
    stickToBottom();
  }, [messages.length, stickToBottom]);

  // Pull Hermes snapshot for the Jobs / Tool / Activity sheets. We
  // read the live state directly (not a hook subscription) because
  // the sheets are short-lived and we want a fresh snapshot on open.
  const hermesSnapshot = useAppStore((s) => s.hermesSnapshot);
  const conversations = useAppStore((s) => s.conversations);
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const recentSessions = (hermesSnapshot?.sessions ?? [])
    .filter((s) => Date.now() - (s.updatedAt ?? 0) < 60 * 60 * 1000)
    .slice(0, 8);
  const failedOrQueuedJobs = (hermesSnapshot?.jobs ?? [])
    .filter((j) => j.state === 'failed' || j.state === 'queued')
    .slice(0, 8);
  const toolsets = (hermesSnapshot?.toolsets ?? []).slice(0, 12);
  const lastTurnsCount = Math.max(0, messages.length - 1);

  useEffect(() => {
    if (messages.length > 0) stickToBottom();
  }, [messages.length, stickToBottom]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.status === 'streaming') {
      scheduleStickToBottom(stickToBottom);
    }
  }, [messages, scheduleStickToBottom, stickToBottom]);

  const visibleMessages = messages.filter((message) => message.role !== 'system');
  const isMobile = isNarrow;

  return (
    <>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={isMobile ? 0 : 0}
      >
        <View style={styles.canvas}>
          <RunHeader
            streaming={streaming}
            pendingApproval={pendingApproval}
            runStartedAtRef={activeRunStartedAtRef}
            onStop={onStop}
            activeTools={streaming
              ? (messages.find((message) => message.status === 'streaming')?.toolEvents ?? []).filter((tool) => tool.status === 'running')
              : []}
          />
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={stickToBottom}
          >
            {visibleMessages.length === 0 ? (
              <EmptyState
                status={providerOk === null ? 'connecting' : providerOk.ok ? 'idle' : providerOk.status === 'no-auth' ? 'auth-needed' : 'offline'}
                badges={{
                  jobs: failedOrQueuedJobs.length > 0 ? String(failedOrQueuedJobs.length) : undefined,
                  tool: toolsets.length > 0 ? String(toolsets.length) : undefined,
                  activity: recentSessions.length > 0 ? String(recentSessions.length) : undefined,
                  'last-turns': lastTurnsCount > 0 ? String(lastTurnsCount) : undefined,
                }}
                onAction={(id) => {
                  if (id === 'voice') toggleVoice();
                  else if (id === 'photo') attachFile();
                  else if (id === 'last-turns') scrollToLastTurns();
                  else if (id === 'jobs') setOpenSheet('jobs');
                  else if (id === 'tool') setOpenSheet('tool');
                  else if (id === 'activity') setOpenSheet('activity');
                }}
              />
            ) : (
              visibleMessages.map((message, index, arr) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isLast={index === arr.length - 1}
                  onSyncToHermes={message.role !== 'user' ? syncFromHermes : undefined}
                  onSend={message.role !== 'user' ? (text) => { setInput(''); setTimeout(() => send(text, { files: [] }), 50); } : undefined}
                  onEdit={message.role === 'user' ? (text) => handleEditUserMessage(message.id, text) : undefined}
                />
              ))
            )}
          </ScrollView>
        </View>

        {streamError ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText} numberOfLines={2}>⚠ {streamError}</Text>
            <Pressable onPress={() => setStreamError(null)} hitSlop={8}>
              <Text style={styles.errorDismiss}>×</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.composerWrap}>
          {pendingFiles.length > 0 ? (
            <ScrollView horizontal style={styles.fileStrip} contentContainerStyle={styles.fileStripContent}>
              {pendingFiles.map((file) => (
                <View key={file.uri} style={styles.fileChip}>
                  <FileCard
                    name={file.name}
                    kind={file.kind}
                    size={file.size}
                    uri={file.uri}
                    expanded={expandedFile === file.uri}
                    onToggle={() => setExpandedFile(expandedFile === file.uri ? null : file.uri)}
                    onRemove={() => removeFile(file.uri)}
                    previewContent={file.previewContent}
                  />
                </View>
              ))}
            </ScrollView>
          ) : null}
          {voiceOn && voicePartial ? (
            <Text style={[styles.voicePartial, { color: accent.accent.fg }]} numberOfLines={2}>🎙 {voicePartial}…</Text>
          ) : null}
          <View style={styles.composerInputRow}>
            <ToolBtn emoji="📎" onPress={attachFile} onHaptic={haptic} />
            <View style={[styles.composerInputBox, inputFocused ? styles.composerInputBoxFocused : null, { borderColor: inputFocused ? accent.accent.fg : neutral.border }]}>
              <TextInput
                value={input}
                onChangeText={setInput}
                onKeyPress={onKeyPress}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={isMobile ? 'Message Hermes…' : 'Type a message...  (Enter to send, Shift+Enter for newline)'}
                placeholderTextColor={neutral.inkMuted}
                multiline
                style={styles.composerInput}
              />
            </View>
            <ToolBtn
              emoji={voiceOn ? '⏹' : '🎙'}
              onPress={toggleVoice}
              onPressIn={isMobile ? startVoicePtt : undefined}
              onPressOut={isMobile ? stopVoicePttAndSend : undefined}
              onHaptic={haptic}
              active={voiceOn}
              activeColor={neutral.err}
            />
          </View>
          <View style={styles.composerRow}>
            <Text style={styles.hint} numberOfLines={1}>
              {streaming
                ? 'Hermes is typing…'
                : pendingFiles.length > 0
                  ? `${pendingFiles.length} file(s) attached`
                  : conversationId
                    ? `→ ${settings.llmProvider === 'hermes-gateway' ? 'Hermes' : settings.llmProvider} · ${conversationId.slice(-6)}`
                    : isMobile ? '' : 'Press Enter to send'}
            </Text>
            {streaming ? (
              <Button label="Stop" onPress={onStop} small />
            ) : (
              <Button label="Send" default onPress={() => send()} disabled={!input.trim()} small />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <ApprovalModal
        open={!!pendingApproval}
        runId={pendingApproval?.runId ?? null}
        approvalId={pendingApproval?.approvalId ?? null}
        prompt={pendingApproval?.prompt ?? ''}
        tool={pendingApproval?.tool ?? ''}
        args={pendingApproval?.args}
        onResolve={resolveApproval}
      />

      {/* Quick action sheets — bottom-sheet modals for Jobs / Tool /
          Activity. The sheet items are sourced from the live Hermes
          snapshot (30s polling) and dispatch straight to existing
          flows: jobs are a no-op for now (Phase 65+), tools dispatch
          a "run tool" prompt via the chat send bus, sessions activate
          a local conversation with the same id (creating it locally
          if missing so the user can write to it). */}
      <QuickActionSheet
        visible={openSheet === 'jobs'}
        title="Background jobs"
        subtitle={failedOrQueuedJobs.length === 0
          ? 'Nothing queued or failed. All clear on your computer.'
          : `${failedOrQueuedJobs.length} need your attention`}
        items={failedOrQueuedJobs.map((j) => ({
          id: j.id,
          emoji: j.state === 'failed' ? '⚠' : '⏰',
          title: j.title || j.id,
          subtitle: `state: ${j.state}${j.nextRunAt ? ` · next ${new Date(j.nextRunAt).toLocaleString()}` : ''}`,
          badge: j.state,
          onPress: () => {
            // Phase 65+ will implement a real "Run now" path. For
            // now we just nudge the user back into the chat with a
            // natural-language prompt that the agent can act on.
            const prompt = `Run the job \`${j.id}\` (${j.title ?? 'untitled'}) now.`;
            (window as any).hermes?.chat?.send?.(prompt).catch(() => undefined);
          },
        }))}
        onClose={() => setOpenSheet(null)}
        emptyText="No background jobs running. Your computer is idle. ✨"
      />

      <QuickActionSheet
        visible={openSheet === 'tool'}
        title="Run a tool"
        subtitle={toolsets.length === 0
          ? 'Hermes hasn\'t reported any tools yet. Make sure the gateway is online.'
          : `${toolsets.length} tools available`}
        items={toolsets.map((t) => ({
          id: t.id,
          emoji: '🔧',
          title: t.name,
          subtitle: t.description,
          onPress: () => {
            const prompt = `Run toolset \`${t.name}\` with empty args. Briefly say what it does first.`;
            (window as any).hermes?.chat?.send?.(prompt).catch(() => undefined);
          },
        }))}
        onClose={() => setOpenSheet(null)}
        emptyText="No tools available right now. ✦"
      />

      <QuickActionSheet
        visible={openSheet === 'activity'}
        title="Recent activity"
        subtitle={recentSessions.length === 0
          ? 'Nothing in the last hour.'
          : `${recentSessions.length} sessions touched your computer in the last hour`}
        items={recentSessions.map((s) => ({
          id: s.id,
          emoji: '📂',
          title: s.title || s.id.slice(0, 12),
          subtitle: `${s.messageCount ?? '?'} msg · ${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : 'just now'}`,
          onPress: () => {
            // If we already have a local copy of this conversation,
            // activate it. Otherwise create a new one with the
            // matching id so future sync merges correctly.
            if (conversations[s.id]) {
              setActiveConversation(s.id);
            } else {
              createConversation(s.title);
            }
          },
        }))}
        onClose={() => setOpenSheet(null)}
        emptyText="No activity in the last hour. ✦"
      />
    </>
  );
};

const RunHeader: React.FC<{
  streaming: boolean;
  pendingApproval: unknown;
  runStartedAtRef: React.MutableRefObject<number | null>;
  onStop: () => void;
  activeTools?: ToolEvent[];
}> = ({ streaming, pendingApproval, runStartedAtRef, onStop, activeTools }) => {
  const accent = useTheme();
  const [, force] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!streaming) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ]),
    );
    loop.start();
    return () => { clearInterval(t); loop.stop(); };
  }, [streaming, pulse]);

  if (!streaming && !pendingApproval) return null;

  const isApproval = !!pendingApproval;
  const startedAt = runStartedAtRef.current;
  const elapsed = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  const elapsedStr = mm > 0 ? `${mm}:${ss.toString().padStart(2, '0')}` : `0:${ss.toString().padStart(2, '0')}`;

  const bg = isApproval
    ? { backgroundColor: '#FBBF24' }
    : { backgroundColor: accent.accent.soft, borderColor: accent.accent.fg, borderWidth: 1 };

  const fg = isApproval
    ? { color: '#000' }
    : { color: accent.accent.fg };

  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  const summarize = (tool: ToolEvent) => {
    const raw = (tool.preview ?? '').replace(/\s+/g, ' ').trim();
    if (raw) return raw.length > 40 ? raw.slice(0, 40) + '…' : raw;
    return 'running…';
  };

  return (
    <View>
      <View style={[runStyles.bar, bg]}>
        <Animated.View style={[runStyles.dot, { opacity: dotOpacity }]} />
        <Text style={[runStyles.label, fg]} numberOfLines={1}>
          {isApproval ? '🔑 awaiting your approval' : activeTools && activeTools.length > 0
            ? `⚡ ${activeTools.length} tool${activeTools.length === 1 ? '' : 's'} running`
            : '⚡ Hermes is running'}
        </Text>
        {!isApproval ? <Text style={[runStyles.elapsed, fg]}>{elapsedStr}</Text> : null}
        <Pressable onPress={onStop} hitSlop={8} style={runStyles.stopBtn}>
          <Text style={[runStyles.stopText, fg]}>■ Stop</Text>
        </Pressable>
      </View>
      {!isApproval && activeTools && activeTools.length > 0 ? (
        <View style={runStyles.toolList}>
          {activeTools.map((tool) => (
            <Text key={tool.id} style={runStyles.toolRow} numberOfLines={1}>
              <Text style={runStyles.toolName}>🔧 {tool.tool}</Text>
              {tool.preview ? <Text style={runStyles.toolPreview}>  {summarize(tool)}</Text> : null}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const runStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, marginHorizontal: 8, marginTop: 4, marginBottom: 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FBBF24' },
  label: { ...type.body, fontSize: 12, fontWeight: '600', flex: 1 },
  elapsed: { ...type.captionSm, fontSize: 11, fontFamily: 'Courier' },
  stopBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#00000022' },
  stopText: { ...type.captionSm, fontSize: 11, fontWeight: '700' },
  toolList: {
    marginHorizontal: 8, marginTop: 2, marginBottom: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#0000000d', borderRadius: 6,
  },
  toolRow: { ...type.captionSm, fontSize: 11, lineHeight: 16 },
  toolName: { fontWeight: '700', color: '#0E7490' },
  toolPreview: { color: '#444', fontStyle: 'italic' },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1, backgroundColor: neutral.bg, margin: 0, padding: 0 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: space.sm, paddingBottom: space.lg },
  composerWrap: {
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8,
    backgroundColor: neutral.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: neutral.border,
  },
  fileStrip: { maxHeight: 140, marginBottom: 4 },
  fileStripContent: { paddingRight: 8 },
  fileChip: { marginRight: 4, minWidth: 180, maxWidth: 240 },
  composerInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, marginTop: space.xs },
  composerInputBox: {
    flex: 1, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 2, backgroundColor: neutral.surface, minHeight: 40, justifyContent: 'center',
  },
  composerInputBoxFocused: {
    backgroundColor: '#FFF',
    shadowColor: '#FFB6C1', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 2,
  },
  composerInput: { ...type.body, color: neutral.ink, padding: 0, minHeight: 32, maxHeight: 140 },
  voicePartial: { ...type.captionSm, fontStyle: 'italic', marginBottom: 4 },
  errorDismiss: { color: '#fff', fontSize: 18, paddingHorizontal: 4 },
  composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 4 },
  hint: { ...type.caption, color: neutral.inkMuted, flex: 1, marginRight: 8 },
  errorBar: {
    backgroundColor: neutral.err, paddingHorizontal: 8, paddingVertical: 4, marginHorizontal: space.sm, marginTop: 4, borderRadius: radius.sm,
  },
  errorText: { ...type.caption, color: '#fff', flex: 1, marginRight: 8 },
});

const ToolBtn: React.FC<{
  emoji: string;
  onPress: () => void;
  onHaptic?: (kind?: 'light' | 'medium' | 'heavy') => void;
  active?: boolean;
  activeColor?: string;
  accessibilityLabel?: string;
  /**
   * Optional press-in / press-out hooks. When provided, the button
   * also exposes the gesture lifecycle (used for push-to-talk on
   * the voice button — onPressIn starts recording, onPressOut
   * commits and sends). The existing onPress still fires on a
   * normal tap, so this is backward-compatible.
   */
  onPressIn?: () => void;
  onPressOut?: () => void;
}> = ({ emoji, onPress, onHaptic, active, activeColor, accessibilityLabel, onPressIn, onPressOut }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const [focused, setFocused] = useState(false);

  const animateTo = (to: number) => {
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      friction: 6,
      tension: 220,
    }).start();
  };

  const handlePressIn = () => {
    animateTo(0.86);
    onHaptic?.('light');
    onPressIn?.();
  };
  const handlePressOut = () => {
    animateTo(1);
    onPressOut?.();
  };

  const activeBg = active ? (activeColor ?? neutral.err) : null;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? emoji}
        style={[
          toolBtnStyles.base,
          activeBg ? { backgroundColor: activeBg, borderColor: activeBg } : null,
          focused ? toolBtnStyles.focused : null,
        ]}
      >
        <Text style={[toolBtnStyles.emoji, active ? toolBtnStyles.emojiActive : null]}>{emoji}</Text>
      </Pressable>
    </Animated.View>
  );
};

const toolBtnStyles = StyleSheet.create({
  base: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: neutral.surface,
    borderRadius: 22,
    borderWidth: 1, borderColor: neutral.border,
  },
  emoji: { fontSize: 22, color: neutral.ink, lineHeight: 26 },
  emojiActive: { color: '#fff' },
  focused: {
    borderColor: '#FFB6C1',
    shadowColor: '#FFB6C1', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 6, elevation: 2,
  },
});
