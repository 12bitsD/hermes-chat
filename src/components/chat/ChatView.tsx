import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Keyboard, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, type, space, bevel } from '../../theme';
import { TextField, Button } from '../win95';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './EmptyState';
import { AttachZone, PickedFile, FileCard } from './FileCard';
import { useAppStore } from '../../store/app';
import { getLLMClient } from '../../store/persistence';
import type { LLMClient } from '../../services/llm';
import { makeUserMessage, makeAssistantMessage } from '../../services/mock-llm';
import { isNarrow } from '../../utils/platform';
import { haptic } from '../../utils/haptic';
import { throttle } from '../../utils/perf';

/**
 * Scroll-to-bottom smoothing target. RN ScrollView can't animate to "the
 * very bottom" in one shot while content height is changing (streaming),
 * so we keep nudging for a couple of frames after the last chunk.
 */
const STICK_TO_BOTTOM_MS = 120;

export const ChatView: React.FC = () => {
  const insets = useSafeAreaInsets();
  const conversationId = useAppStore((s) => s.activeConversationId);
  const messages = useAppStore((s) => s.getActiveMessages());
  const appendMessage = useAppStore((s) => s.appendMessage);
  const updateMessage = useAppStore((s) => s.updateMessage);
  const showIllustrations = useAppStore((s) => s.settings.showIllustrations);
  const systemPrompt = useAppStore((s) => s.settings.systemPrompt);

  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PickedFile[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const stickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stickToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: true });
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      stickToBottom();
    }
  }, [messages.length, stickToBottom]);

  useEffect(() => {
    if (stickTimer.current) clearTimeout(stickTimer.current);
    const last = messages[messages.length - 1];
    if (last?.status === 'streaming') {
      // Keep nudging for a moment after the last update, in case more chunks are about to arrive
      stickTimer.current = setTimeout(stickToBottom, STICK_TO_BOTTOM_MS);
    }
    return () => {
      if (stickTimer.current) clearTimeout(stickTimer.current);
    };
  }, [messages, stickToBottom]);

  // Listen for prompt-template inserts from PromptNavigator
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onInsert = (e: Event) => {
      const body = (e as CustomEvent<string>).detail ?? '';
      if (!body) return;
      setInput((cur) => (cur ? cur + '\n\n' + body : body));
    };
    window.addEventListener('hermes:insert-prompt', onInsert);
    return () => window.removeEventListener('hermes:insert-prompt', onInsert);
  }, []);

  const onFilePicked = useCallback((f: PickedFile) => {
    setPendingFiles((cur) => [...cur, f]);
  }, []);

  const removeFile = useCallback((uri: string) => {
    setPendingFiles((cur) => cur.filter((f) => f.uri !== uri));
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !conversationId) return;
    Keyboard.dismiss();
    setInput('');
    setStreamError(null);

    const userMsg = makeUserMessage(text);
    if (pendingFiles.length > 0) {
      userMsg.attachments = pendingFiles.map((f) => ({
        id: f.uri,
        name: f.name,
        kind: f.kind,
        size: f.size,
        uri: f.uri,
        previewUri: f.kind === 'image' ? f.uri : undefined,
      }));
    }
    const assistantMsg = makeAssistantMessage('');

    appendMessage(conversationId, userMsg);
    appendMessage(conversationId, assistantMsg);
    setPendingFiles([]);

    setStreaming(true);
    haptic('light');
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Throttle store updates so a high-frequency stream doesn't re-render the
    // whole list on every char. We still flush the very last update on done/error
    // so the user always sees the full content.
    const STREAM_FLUSH_MS = 60;
    let pendingAcc = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (pendingAcc) {
        updateMessage(conversationId, assistantMsg.id, { content: pendingAcc });
        pendingAcc = '';
      }
    };
    const scheduleFlush = throttle(() => flush(), STREAM_FLUSH_MS);

    // Build the conversation history to send upstream
    const prev = useAppStore.getState().getActiveMessages();
    const historyMessages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
    if (systemPrompt && systemPrompt.trim()) {
      historyMessages.push({ role: 'system', content: systemPrompt });
    }
    for (const m of prev) {
      if (m.id === assistantMsg.id) continue; // skip the empty placeholder we just added
      if (m.role === 'user' || m.role === 'assistant') {
        historyMessages.push({ role: m.role, content: m.content });
      }
    }

    let acc = '';
    try {
      const client: LLMClient = getLLMClient();
      await client.streamChat(
        {
          conversationId,
          messages: historyMessages,
          signal: ctrl.signal,
        },
        {
          onChunk: (chunk) => {
            acc += chunk;
            pendingAcc = acc;
            // Update local state for the in-flight buffer used by error path
            scheduleFlush();
          },
          onDone: () => {
            if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
            updateMessage(conversationId, assistantMsg.id, { content: acc, status: 'done' });
            haptic('success');
          },
          onError: (err) => {
            if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
            const msg = err?.message ?? String(err);
            setStreamError(msg);
            updateMessage(conversationId, assistantMsg.id, {
              content: acc + (acc ? '\n\n' : '') + `**Error**: ${msg}`,
              status: 'error',
            });
            haptic('error');
          },
        },
      );
    } catch (e: any) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      const msg = e?.message ?? String(e);
      setStreamError(msg);
      updateMessage(conversationId, assistantMsg.id, {
        content: acc + (acc ? '\n\n' : '') + `**Error**: ${msg}`,
        status: 'error',
      });
      haptic('error');
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, conversationId, appendMessage, updateMessage, pendingFiles, systemPrompt]);

  const onKeyPress = useCallback(
    (e: any) => {
      // Enter to send on web; mobile keyboards just insert a newline + Send button
      if ((e?.nativeEvent?.key === 'Enter') && !e?.nativeEvent?.shiftKey && Platform.OS === 'web') {
        e.preventDefault?.();
        send();
      }
    },
    [send],
  );

  const onStop = () => { haptic('warning'); abortRef.current?.abort(); };

  const isMobile = isNarrow;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={isMobile ? 0 : 0}
    >
      {/* Message canvas */}
      <View style={styles.canvas}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={stickToBottom}
        >
          {messages.filter((m) => m.role !== 'system').length === 0 ? (
            <EmptyState onPick={(body) => setInput(body)} />
          ) : (
            messages
              .filter((m) => m.role !== 'system')
              .map((m, i, arr) => (
                <MessageBubble key={m.id} message={m} isLast={i === arr.length - 1} />
              ))
          )}
          {messages.filter((m) => m.role !== 'system').length === 0 && showIllustrations ? (
            <View style={styles.illustration}>
              <Text style={styles.illustrationEmoji}>🌸</Text>
              <Text style={styles.illustrationCaption}>少女立绘占位 — Phase 3 接入</Text>
            </View>
          ) : null}
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

      <AttachZone onFilePicked={onFilePicked} buttonLabel={Platform.OS === 'web' ? 'Drop / click' : 'Tap to attach'}>
        <View style={[styles.composer, { paddingBottom: isMobile ? Math.max(4, insets.bottom - 4) : 4 }]}>
          {pendingFiles.length > 0 ? (
            <ScrollView horizontal style={styles.fileStrip} contentContainerStyle={styles.fileStripContent}>
              {pendingFiles.map((f) => (
                <View key={f.uri} style={styles.fileChip}>
                  <FileCard
                    name={f.name}
                    kind={f.kind}
                    size={f.size}
                    uri={f.uri}
                    expanded={expandedFile === f.uri}
                    onToggle={() => setExpandedFile(expandedFile === f.uri ? null : f.uri)}
                    onRemove={() => removeFile(f.uri)}
                    previewContent={f.previewContent}
                  />
                </View>
              ))}
            </ScrollView>
          ) : null}
          <TextField
            value={input}
            onChangeText={setInput}
            onKeyPress={onKeyPress}
            placeholder={isMobile ? 'Type a message…' : 'Type a message...  (Enter to send, Shift+Enter for newline)'}
            multiline
            style={styles.composerInput}
          />
          <View style={styles.composerRow}>
            <Text style={styles.hint} numberOfLines={1}>
              {streaming
                ? 'Hermes is typing…'
                : pendingFiles.length > 0
                  ? `${pendingFiles.length} file(s) attached`
                  : isMobile ? 'tap send' : 'Press Enter to send'}
            </Text>
            {streaming ? (
              <Button label="Stop" onPress={onStop} small />
            ) : (
              <Button label="Send" default onPress={send} disabled={!input.trim()} small />
            )}
          </View>
        </View>
      </AttachZone>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1, backgroundColor: palette.canvas, margin: 0, padding: 0 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: space.sm, paddingBottom: space.lg },
  illustration: { alignItems: 'center', marginTop: space.lg, opacity: 0.6 },
  illustrationEmoji: { fontSize: 48 },
  illustrationCaption: { ...type.ui, color: palette.inkMuted, marginTop: 4, fontStyle: 'italic' },
  composer: { paddingHorizontal: space.xs },
  fileStrip: { maxHeight: 140, marginBottom: 4 },
  fileStripContent: { paddingRight: 8 },
  fileChip: { marginRight: 4, minWidth: 180, maxWidth: 240 },
  composerInput: { minHeight: 56, maxHeight: 140 },
  composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  hint: { ...type.ui, color: palette.inkMuted, fontStyle: 'italic', flex: 1, marginRight: 8 },
  errorBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: palette.err, paddingHorizontal: 8, paddingVertical: 4, marginHorizontal: space.xs,
  },
  errorText: { ...type.ui, color: '#fff', flex: 1, marginRight: 8 },
  errorDismiss: { color: '#fff', fontSize: 18, paddingHorizontal: 4 },
});
