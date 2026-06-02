import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Keyboard, Platform, KeyboardAvoidingView, Image, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { neutral, type, space, radius, useTheme } from '../../theme';
import { TextField, Button } from '../win95';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './EmptyState';
import { ApprovalModal } from '../ApprovalModal';
import { AttachZone, PickedFile, FileCard } from './FileCard';
import { useAppStore } from '../../store/app';
import { getLLMClient } from '../../store/persistence';
import type { LLMClient } from '../../services/llm';
import { makeUserMessage, makeAssistantMessage } from '../../services/mock-llm';
import { isNarrow } from '../../utils/platform';
import { haptic } from '../../utils/haptic';
import { throttle } from '../../utils/perf';
import { startVoice, requestVoicePermission } from '../../utils/voice';
import { getHermesClient } from '../../services/llm';

/**
 * Scroll-to-bottom smoothing target. RN ScrollView can't animate to "the
 * very bottom" in one shot while content height is changing (streaming),
 * so we keep nudging for a couple of frames after the last chunk.
 */
const STICK_TO_BOTTOM_MS = 120;

function guessKindFromName(name: string, mime: string): 'pdf' | 'ppt' | 'image' | 'text' | 'other' {
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (mime.includes('presentation') || /\.(pptx|ppt)$/i.test(name)) return 'ppt';
  if (mime.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name)) return 'image';
  if (mime.startsWith('text/') || /\.(md|txt|json|js|ts|py|css|html|xml|yaml|yml|csv)$/i.test(name)) return 'text';
  return 'other';
}

/** Read the current tool events on a message directly from the store. */
function getCurrentToolEvents(conversationId: string, messageId: string) {
  const c = useAppStore.getState().conversations[conversationId];
  if (!c) return [];
  const m = c.messages.find((x) => x.id === messageId);
  return m?.toolEvents ?? [];
}

export const ChatView: React.FC<{ onOpenDrawer?: () => void }> = ({ onOpenDrawer }) => {
  const insets = useSafeAreaInsets();
  const accent = useTheme();
  const conversationId = useAppStore((s) => s.activeConversationId);
  const messages = useAppStore((s) => s.getActiveMessages());
  const appendMessage = useAppStore((s) => s.appendMessage);
  const updateMessage = useAppStore((s) => s.updateMessage);
  const createConv = useAppStore((s) => s.createConversation);
  const providerOk = useAppStore((s) => s.gatewayReachable);
  const settings = useAppStore((s) => s.settings);
  const systemPrompt = useAppStore((s) => s.settings.systemPrompt);
  const maxTokens = useAppStore((s) => s.settings.maxTokens);
  const sessionKey = useAppStore((s) => s.settings.sessionKey);
  const useRunsMode = useAppStore((s) => (s.settings as any).useRunsMode ?? false);

  const [pendingApproval, setPendingApproval] = useState<{
    runId: string; approvalId: string; prompt: string; tool: string; args: unknown;
  } | null>(null);

  // Latest runId — held in a ref so onStop (and other imperative handlers)
  // can reach it without threading through state. Stays empty outside
  // an active /v1/runs run.
  const activeRunIdRef = useRef<string | null>(null);

  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PickedFile[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voicePartial, setVoicePartial] = useState('');
  const voiceStopRef = useRef<null | (() => Promise<string | null>)>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const stickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stickToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: true });
    }
  }, []);

  // Voice toggle
  const toggleVoice = useCallback(async () => {
    if (voiceOn) {
      voiceStopRef.current?.();
      voiceStopRef.current = null;
      setVoiceOn(false);
      setVoicePartial('');
      return;
    }
    const ok = await requestVoicePermission();
    if (!ok) {
      Alert.alert('Voice input', 'Microphone permission was denied.');
      return;
    }
    const stop = await startVoice(
      (text, isFinal) => {
        setVoicePartial(text);
        if (isFinal) {
          setInput((cur) => (cur ? cur + ' ' + text : text));
          setVoicePartial('');
        }
      },
      (err) => {
        setVoiceOn(false);
        setVoicePartial('');
        Alert.alert('Voice input', err.message);
      },
    );
    if (stop) {
      voiceStopRef.current = stop;
      setVoiceOn(true);
      haptic('light');
    }
  }, [voiceOn]);

  // Stop voice on unmount
  useEffect(() => {
    return () => { voiceStopRef.current?.(); };
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

  /**
   * Send a resolution back to the gateway when the user approves/denies.
   * The agent run continues / stops accordingly. We do this async;
   * no need to block the UI.
   */
  const resolveApproval = useCallback(async (decision: 'approve' | 'deny', note?: string) => {
    if (!pendingApproval) return;
    const { runId, approvalId } = pendingApproval;
    setPendingApproval(null);
    if (!useRunsMode) return;
    const hermes = getHermesClient();
    if (!hermes) return;
    const { HermesRunsClient } = await import('../../services/llm');
    const runs = new HermesRunsClient({
      provider: 'hermes-gateway',
      endpoint: (settings as any).llmEndpoint,
      apiKey: (settings as any).llmApiKey,
      defaultModel: (settings as any).llmModel,
    });
    await runs.resolveApproval(runId, approvalId, decision, note).catch(() => undefined);
    if (decision === 'deny') {
      await runs.stopRun(runId).catch(() => undefined);
    }
    haptic(decision === 'approve' ? 'success' : 'warning');
  }, [pendingApproval, useRunsMode, settings.llmEndpoint, settings.llmApiKey, settings.llmModel]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !conversationId) return;
    // Defensive: cancel any previous in-flight stream before starting a new one
    abortRef.current?.abort();
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
      // Hermes-aware: forward the conversation id as a session id, and the
      // user-configured session key for long-term memory scoping. Plain
      // OpenAI-compatible backends will just ignore these headers.
      const hermes = getHermesClient();

      // === Agent runs mode (POST /v1/runs) — tool events + approval flow
      if (useRunsMode && hermes) {
        const { HermesRunsClient } = await import('../../services/llm');
        const runs = new HermesRunsClient({
          provider: 'hermes-gateway',
          endpoint: (settings as any).llmEndpoint,
          apiKey: (settings as any).llmApiKey,
          defaultModel: (settings as any).llmModel,
        });
        try {
          const runId = await runs.startRun({
            input: text,
            instructions: systemPrompt && systemPrompt.trim() ? systemPrompt : undefined,
            conversationHistory: historyMessages as any,
            model: (settings as any).llmModel,
            sessionId: conversationId,
            sessionKey,
            signal: ctrl.signal,
          });
          activeRunIdRef.current = runId;
          for await (const ev of runs.subscribeEvents(runId, ctrl.signal)) {
            if (ctrl.signal.aborted) break;
            if (ev.event === 'message.delta') {
              acc += ev.delta;
              pendingAcc = acc;
              scheduleFlush();
            } else if (ev.event === 'tool.started') {
              const toolEv = {
                id: `${runId}-${ev.timestamp}`,
                tool: ev.tool,
                status: 'running' as const,
                startedAt: ev.timestamp * 1000,
                preview: ev.preview,
              };
              updateMessage(conversationId, assistantMsg.id, {
                toolEvents: [...getCurrentToolEvents(conversationId, assistantMsg.id), toolEv],
              });
            } else if (ev.event === 'tool.completed') {
              const existing = getCurrentToolEvents(conversationId, assistantMsg.id);
              const updated = existing.map((t) =>
                t.tool === ev.tool && t.status === 'running'
                  ? { ...t, status: ev.error ? ('error' as const) : ('done' as const), finishedAt: ev.timestamp * 1000, durationMs: ev.duration * 1000 }
                  : t,
              );
              updateMessage(conversationId, assistantMsg.id, { toolEvents: updated });
            } else if (ev.event === 'completed') {
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              const finalText = ev.final_response || acc;
              updateMessage(conversationId, assistantMsg.id, { content: finalText, status: 'done' });
              haptic('success');
            } else if (ev.event === 'failed') {
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              updateMessage(conversationId, assistantMsg.id, {
                content: acc + (acc ? '\n\n' : '') + `**Error**: ${ev.error.message}`,
                status: 'error',
              });
              haptic('error');
            } else if (ev.event === 'stopped') {
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              updateMessage(conversationId, assistantMsg.id, { content: acc, status: 'done' });
            } else if (ev.event === 'approval.required') {
              // Surface the approval prompt as a modal
              setPendingApproval({
                runId, approvalId: ev.approval_id, prompt: ev.prompt, tool: ev.tool, args: ev.args,
              });
              updateMessage(conversationId, assistantMsg.id, { status: 'awaiting-approval' });
            } else if (ev.event === 'reasoning.available') {
              // Optional: stash as a toolEvents entry so user can see it
              const existing = getCurrentToolEvents(conversationId, assistantMsg.id);
              updateMessage(conversationId, assistantMsg.id, {
                toolEvents: [
                  ...existing,
                  {
                    id: `${runId}-reasoning-${ev.timestamp}`,
                    tool: 'reasoning',
                    status: 'done' as const,
                    startedAt: ev.timestamp * 1000,
                    finishedAt: ev.timestamp * 1000,
                    preview: ev.text,
                  },
                ],
              });
            }
          }
        } catch (e: any) {
          if (ctrl.signal.aborted) return;
          // Falls back to plain chat on any runs-mode failure so user is never locked out
          console.warn('[runs mode] failed, falling back to chat completions', e);
          await client.streamChat(
            {
              conversationId,
              messages: historyMessages,
              signal: ctrl.signal,
              maxTokens,
              temperature: settings.temperature,
            },
            {
              onChunk: (chunk) => {
                if (ctrl.signal.aborted) return;
                acc += chunk;
                pendingAcc = acc;
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
                updateMessage(conversationId, assistantMsg.id, {
                  content: acc + (acc ? '\n\n' : '') + `**Error**: ${msg}`,
                  status: 'error',
                });
                haptic('error');
              },
            },
            { sessionId: conversationId, sessionKey },
          );
        }
      } else {
        // === Default: OpenAI Chat Completions streaming ===
        const streamCtx = hermes
          ? { sessionId: conversationId, sessionKey }
          : undefined;
        await client.streamChat(
          {
            conversationId,
            messages: historyMessages,
            signal: ctrl.signal,
            maxTokens,
            temperature: settings.temperature,
          },
          {
            onChunk: (chunk) => {
              if (ctrl.signal.aborted) return; // ignore late chunks after stop
              acc += chunk;
              pendingAcc = acc;
              // Update local state for the in-flight buffer used by error path
              scheduleFlush();
            },
            onDone: () => {
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              if (!ctrl.signal.aborted) {
                updateMessage(conversationId, assistantMsg.id, { content: acc, status: 'done' });
                haptic('success');
              } else {
                // user stopped — keep partial content, mark as done (not error)
                updateMessage(conversationId, assistantMsg.id, { content: acc, status: 'done' });
              }
            },
            onError: (err) => {
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              if (ctrl.signal.aborted) return; // user-initiated stop, not a real error
              const msg = err?.message ?? String(err);
              setStreamError(msg);
              updateMessage(conversationId, assistantMsg.id, {
                content: acc + (acc ? '\n\n' : '') + `**Error**: ${msg}`,
                status: 'error',
              });
              haptic('error');
            },
          },
          streamCtx,
        );
      }
    } catch (e: any) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      if (ctrl.signal.aborted) return; // stop path — no error UI
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
      activeRunIdRef.current = null;
    }
  }, [input, streaming, conversationId, appendMessage, updateMessage, pendingFiles, systemPrompt, maxTokens, sessionKey, settings.temperature, settings.llmEndpoint, settings.llmApiKey, settings.llmModel, useRunsMode]);

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

  const onStop = useCallback(async () => {
    haptic('warning');
    abortRef.current?.abort();
    if (useRunsMode && activeRunIdRef.current) {
      try {
        const { HermesRunsClient } = await import('../../services/llm');
        const runs = new HermesRunsClient({
          provider: 'hermes-gateway',
          endpoint: (settings as any).llmEndpoint,
          apiKey: (settings as any).llmApiKey,
          defaultModel: (settings as any).llmModel,
        });
        await runs.stopRun(activeRunIdRef.current).catch(() => undefined);
      } catch { /* ignore */ }
      activeRunIdRef.current = null;
    }
  }, [useRunsMode, settings.llmEndpoint, settings.llmApiKey, settings.llmModel]);

  const pickImage = useCallback(async () => {
    // Try a document picker first (any file). If only the image picker is
    // available, fall back to that. We deliberately do this without a
    // long-press / action sheet to keep the surface area minimal.
    try {
      const mod = require('expo-document-picker');
      const M = mod?.getDocumentAsync ?? mod?.default?.getDocumentAsync;
      if (M) {
        const res = await M({ copyToCacheDirectory: true, multiple: false });
        if (!res.canceled && res.assets?.[0]) {
          const a = res.assets[0];
          const name = a.name ?? 'file';
          const size = a.size ?? 0;
          const kind = guessKindFromName(name, a.mimeType ?? '');
          onFilePicked({ uri: a.uri, name, size, kind } as PickedFile);
          haptic('light');
          return;
        }
      }
    } catch {
      // fall through to image picker
    }
    try {
      const mod = require('expo-image-picker');
      const M = mod?.launchImageLibraryAsync ?? mod?.default?.launchImageLibraryAsync;
      if (!M) throw new Error('expo-image-picker not available');
      const res = await M({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const uri = a.uri;
      const name = uri.split('/').pop() ?? 'image.jpg';
      const size = a.fileSize ?? 0;
      onFilePicked({ uri, name, kind: 'image', size, previewContent: undefined } as PickedFile);
      haptic('light');
    } catch (e: any) {
      Alert.alert('Attach file', e?.message ?? String(e));
    }
  }, [onFilePicked]);

  const isMobile = isNarrow;

  return (
    <>
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
            <EmptyState
              status={providerOk === false ? 'offline' : providerOk === null ? 'connecting' : 'idle'}
              onAction={(id) => {
                if (id === 'voice') toggleVoice();
                else if (id === 'photo') pickImage();
                else if (id === 'new-session') createConv();
                else if (id === 'open-existing') onOpenDrawer?.();
              }}
            />
          ) : (
            messages
              .filter((m) => m.role !== 'system')
              .map((m, i, arr) => (
                <MessageBubble key={m.id} message={m} isLast={i === arr.length - 1} />
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
        {voiceOn && voicePartial ? (
          <Text style={[styles.voicePartial, { color: accent.accent.fg }]} numberOfLines={2}>🎙 {voicePartial}…</Text>
        ) : null}
        <View style={styles.composerInputRow}>
          <Pressable onPress={pickImage} hitSlop={8} style={styles.toolBtn}>
            <Image
              source={require('../../../assets/illustrations/camera.png')}
              style={styles.micGlyph}
              resizeMode="contain"
            />
          </Pressable>
          <View style={[styles.composerInputBox, { borderColor: neutral.border }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              onKeyPress={onKeyPress}
              placeholder={isMobile ? 'Message Hermes…' : 'Type a message...  (Enter to send, Shift+Enter for newline)'}
              placeholderTextColor={neutral.inkMuted}
              multiline
              style={styles.composerInput}
            />
          </View>
          <Pressable
            onPress={toggleVoice}
            hitSlop={8}
            style={[styles.toolBtn, voiceOn ? styles.toolBtnOn : null]}
          >
            {voiceOn ? (
              <Text style={[styles.toolBtnText, styles.toolBtnTextOn]}>■</Text>
            ) : (
              <Image
                source={require('../../../assets/illustrations/mic.png')}
                style={styles.micGlyph}
                resizeMode="contain"
              />
            )}
          </Pressable>
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
            <Button label="Send" default onPress={send} disabled={!input.trim()} small />
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
    </>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1, backgroundColor: neutral.bg, margin: 0, padding: 0 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: space.sm, paddingBottom: space.lg },
  illustration: { alignItems: 'center', marginTop: space.lg, opacity: 0.6 },
  illustrationEmoji: { fontSize: 48 },
  illustrationCaption: { ...type.caption, color: neutral.inkMuted, marginTop: 4, fontStyle: 'italic' },
  composerWrap: { paddingHorizontal: space.sm, paddingTop: space.xs, paddingBottom: space.sm, backgroundColor: neutral.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: neutral.border },
  fileStrip: { maxHeight: 140, marginBottom: 4 },
  fileStripContent: { paddingRight: 8 },
  fileChip: { marginRight: 4, minWidth: 180, maxWidth: 240 },
  composerInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, marginTop: space.xs },
  composerInputBox: {
    flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.sm, paddingVertical: 2, backgroundColor: neutral.surface, minHeight: 40, justifyContent: 'center',
  },
  composerInput: { ...type.body, color: neutral.ink, padding: 0, minHeight: 32, maxHeight: 140 },
  toolBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: neutral.surface,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: neutral.border,
  },
  toolBtnText: { fontSize: 18, color: neutral.ink, lineHeight: 22 },
  toolBtnOn: { backgroundColor: neutral.err, borderColor: neutral.err },
  toolBtnTextOn: { color: '#fff' },
  micGlyph: { width: 22, height: 22 },
  voicePartial: { fontSize: 12, fontStyle: 'italic', marginBottom: 4 }, // color applied inline via accent
  composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 4 },
  hint: { ...type.caption, color: neutral.inkMuted, flex: 1, marginRight: 8 },
  errorBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: neutral.err, paddingHorizontal: 8, paddingVertical: 4, marginHorizontal: space.sm, marginTop: 4, borderRadius: radius.sm,
  },
  errorText: { ...type.caption, color: '#fff', flex: 1, marginRight: 8 },
  errorDismiss: { color: '#fff', fontSize: 18, paddingHorizontal: 4 },
});
