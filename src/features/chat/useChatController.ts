import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform } from 'react-native';
import { STICK_TO_BOTTOM_MS } from '../../config/app-constants';
import { dispatchChatSend, subscribeChatSend } from '../../lib/chatSendBus';
import { publishCli } from '../../lib/hermesCliBus';
import { enqueue, list as listQueued, dequeue, bumpRetry, nextBackoffMs } from '../../services/queue/messageQueue';
import { toolRiskLevel } from '../../domain/tools/risk';
import { buildChatHistory } from '../../domain/chat/history';
import { makeAssistantMessage, makeUserMessage } from '../../domain/chat/messages';
import { pickFile, type PickedFile } from '../attachments/filePicker';
import { createHermesPort, createSessionsClient, buildLLMConfig } from '../../services/llm/factory';
import { runChatTurn } from './chatTurnService';
import { useAppStore } from '../../store/app';
import { getLLMClient } from '../../store/persistence';
import { haptic } from '../../utils/haptic';
import { requestVoicePermission, startVoice } from '../../utils/voice';

export interface PendingApproval {
  runId: string;
  approvalId: string;
  prompt: string;
  tool: string;
  args: unknown;
}

function getCurrentToolEvents(conversationId: string, messageId: string) {
  const c = useAppStore.getState().conversations[conversationId];
  if (!c) return [];
  const m = c.messages.find((x) => x.id === messageId);
  return m?.toolEvents ?? [];
}

export function useChatController() {
  const conversationId = useAppStore((s) => s.activeConversationId);
  const messages = useAppStore((s) => s.getActiveMessages());
  const appendMessage = useAppStore((s) => s.appendMessage);
  const updateMessage = useAppStore((s) => s.updateMessage);
  const truncateMessagesAt = useAppStore((s) => s.truncateMessagesAt);
  const mergeRemoteMessages = useAppStore((s) => s.mergeRemoteMessages);
  const createConversation = useAppStore((s) => s.createConversation);
  const providerOk = useAppStore((s) => s.gatewayReachable);
  const settings = useAppStore((s) => s.settings);

  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const activeRunStartedAtRef = useRef<number | null>(null);

  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PickedFile[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voicePartial, setVoicePartial] = useState('');

  const voiceStopRef = useRef<null | (() => Promise<string | null>)>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const llmConfig = useMemo(
    () => buildLLMConfig(settings),
    [settings.llmEndpoint, settings.llmApiKey, settings.llmModel],
  );
  const systemPrompt = settings.systemPrompt;
  const maxTokens = settings.maxTokens;
  const sessionKey = settings.sessionKey;
  const useRunsMode = settings.useRunsMode ?? false;

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

  useEffect(() => {
    return () => { voiceStopRef.current?.(); };
  }, []);

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

  useEffect(() => {
    return () => {
      if (stickTimer.current) clearTimeout(stickTimer.current);
    };
  }, []);

  // Subscribe to the `window.hermes.chat.send` bus. When a script
  // outside React (devtools, Tampermonkey, another agent) calls
  // `await hermes.chat.send('foo')`, the dispatch lands here and we
  // hand off to the existing `send` callback. The bus returns a
  // `{ok: true}` once we accept the request — the actual run state
  // is published through hermesCliBus by the chatTurnService callbacks
  // (tool:started, run:completed, etc.).
  //
  // We use a ref to read the latest `send` value inside the
  // subscriber closure, so the bus is wired once on mount instead
  // of re-subscribing on every render. The ref is initialised to
  // null and filled in by the effect below (after `send` is defined).
  const sendRef = useRef<((text: string, opts?: { appendUserMessage?: boolean; files?: PickedFile[] }) => Promise<void> | null)>(null);
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;
  useEffect(() => {
    return subscribeChatSend(async (req) => {
      if (!conversationId) return { ok: false, reason: 'no-active-conversation' };
      if (streamingRef.current) return { ok: false, reason: 'already-streaming' };
      const text = (req.text ?? '').trim();
      if (!text) return { ok: false, reason: 'empty-text' };
      // Fire-and-forget — the bus caller wants immediate ack, not full turn.
      const send = sendRef.current;
      if (send) void send(text, { appendUserMessage: true, files: [] });
      else return { ok: false, reason: 'controller-not-ready' };
      return { ok: true };
    });
  }, [conversationId]);

  const scheduleStickToBottom = useCallback((stickToBottom: () => void) => {
    if (stickTimer.current) clearTimeout(stickTimer.current);
    stickTimer.current = setTimeout(stickToBottom, STICK_TO_BOTTOM_MS);
  }, []);

  const attachFile = useCallback(async () => {
    try {
      const file = await pickFile();
      if (!file) return;
      setPendingFiles((cur) => [...cur, file]);
      haptic('light');
    } catch (error: any) {
      Alert.alert('Attach file', error?.message ?? String(error));
    }
  }, []);

  const removeFile = useCallback((uri: string) => {
    setPendingFiles((cur) => cur.filter((file) => file.uri !== uri));
  }, []);

  const resolveApproval = useCallback(async (decision: 'approve' | 'deny', note?: string) => {
    if (!pendingApproval) return;
    const { runId, approvalId } = pendingApproval;
    setPendingApproval(null);
    if (!useRunsMode) return;
    const port = createHermesPort(llmConfig, getLLMClient());
    await port.resolveApproval(runId, approvalId, decision, note).catch(() => undefined);
    if (decision === 'deny') {
      await port.stopRun(runId).catch(() => undefined);
    }
    haptic(decision === 'approve' ? 'success' : 'warning');
  }, [pendingApproval, useRunsMode, llmConfig]);

  const syncFromHermes = useCallback(async () => {
    if (!conversationId) return;
    haptic('light');
    try {
      const messagesFromHermes = await createSessionsClient(llmConfig).messages(conversationId);
      if (!messagesFromHermes) {
        haptic('error');
        return;
      }
      const added = mergeRemoteMessages(conversationId, messagesFromHermes);
      haptic(added > 0 ? 'success' : 'warning');
    } catch {
      haptic('error');
    }
  }, [conversationId, llmConfig, mergeRemoteMessages]);

  const send = useCallback(async (
    overrideText?: string,
    opts: { appendUserMessage?: boolean; files?: PickedFile[] } = {},
  ) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming || !conversationId) return;
    const appendUserMessage = opts.appendUserMessage ?? true;
    const files = opts.files ?? pendingFiles;

    abortRef.current?.abort();
    Keyboard.dismiss();
    setInput('');
    setStreamError(null);

    if (appendUserMessage) {
      const userMsg = makeUserMessage(text);
      if (files.length > 0) {
        userMsg.attachments = files.map((file) => ({
          id: file.uri,
          name: file.name,
          kind: file.kind,
          size: file.size,
          uri: file.uri,
          previewUri: file.kind === 'image' ? file.uri : undefined,
        }));
      }
      appendMessage(conversationId, userMsg);
    }
    const assistantMsg = makeAssistantMessage('');
    appendMessage(conversationId, assistantMsg);
    if (appendUserMessage) setPendingFiles([]);

    setStreaming(true);
    haptic('light');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    activeRunStartedAtRef.current = Date.now();

    const historyMessages = buildChatHistory(
      useAppStore.getState().getActiveMessages(),
      { systemPrompt, skipMessageId: assistantMsg.id },
    );

    try {
      await runChatTurn(
        createHermesPort(llmConfig, getLLMClient()),
        {
          conversationId,
          input: text,
          historyMessages,
          instructions: systemPrompt && systemPrompt.trim() ? systemPrompt : undefined,
          model: llmConfig.defaultModel,
          sessionKey,
          useRunsMode,
          maxTokens,
          temperature: settings.temperature,
          signal: ctrl.signal,
        },
        {
          onRunStarted: (runId) => {
            activeRunIdRef.current = runId;
            activeRunStartedAtRef.current = Date.now();
            publishCli({ type: 'run:started', conversationId, runId });
          },
          onTextFlush: (content) => {
            updateMessage(conversationId, assistantMsg.id, { content });
          },
          onToolStarted: (event) => {
            const toolEv = {
              id: `${event.runId}-${event.timestamp}`,
              tool: event.tool,
              status: 'running' as const,
              startedAt: event.timestamp * 1000,
              preview: event.preview,
            };
            updateMessage(conversationId, assistantMsg.id, {
              toolEvents: [...getCurrentToolEvents(conversationId, assistantMsg.id), toolEv],
            });
            publishCli({ type: 'tool:started', runId: event.runId, tool: event.tool, preview: event.preview });
          },
          onToolCompleted: (event) => {
            const existing = getCurrentToolEvents(conversationId, assistantMsg.id);
            const updated = existing.map((tool) =>
              tool.tool === event.tool && tool.status === 'running'
                ? { ...tool, status: event.error ? ('error' as const) : ('done' as const), finishedAt: event.timestamp * 1000, durationMs: event.duration * 1000 }
                : tool,
            );
            updateMessage(conversationId, assistantMsg.id, { toolEvents: updated });
            publishCli({
              type: 'tool:completed',
              runId: activeRunIdRef.current ?? `${conversationId}-${Date.now()}`,
              tool: event.tool,
              durationMs: event.duration * 1000,
              ok: !event.error,
            });
          },
          onReasoning: (event) => {
            const existing = getCurrentToolEvents(conversationId, assistantMsg.id);
            updateMessage(conversationId, assistantMsg.id, {
              toolEvents: [
                ...existing,
                {
                  id: `${event.runId}-reasoning-${event.timestamp}`,
                  tool: 'reasoning',
                  status: 'done' as const,
                  startedAt: event.timestamp * 1000,
                  finishedAt: event.timestamp * 1000,
                  preview: event.text,
                },
              ],
            });
          },
          onApprovalRequired: (event) => {
            // Phase 63 #10: tool risk grading. Low-risk tools
            // (read_file, web_search, etc.) auto-approve so the
            // user isn't blocked on every search. The user can
            // still stop the run via RunHeader, or react to a
            // 6s toast if we ever add one (currently we just
            // publish a "auto-approved" event for observability).
            const risk = toolRiskLevel(event.tool);
            if (risk === 'low') {
              publishCli({
                type: 'approval:required',
                runId: event.runId,
                approvalId: event.approvalId,
                tool: event.tool,
                prompt: `auto-approve: low-risk tool ${event.tool}`,
              });
              // fire-and-forget; the run continues
              const port = createHermesPort(llmConfig, getLLMClient());
              void port.resolveApproval(event.runId, event.approvalId, 'approve').catch(() => undefined);
              return;
            }
            setPendingApproval({
              runId: event.runId,
              approvalId: event.approvalId,
              prompt: event.prompt,
              tool: event.tool,
              args: event.args,
            });
            updateMessage(conversationId, assistantMsg.id, { status: 'awaiting-approval' });
            publishCli({
              type: 'approval:required',
              runId: event.runId,
              approvalId: event.approvalId,
              tool: event.tool,
              prompt: event.prompt,
            });
          },
          onDone: (finalText) => {
            updateMessage(conversationId, assistantMsg.id, { content: finalText, status: 'done' });
            haptic('success');
            const runId = activeRunIdRef.current ?? `${conversationId}-${Date.now()}`;
            publishCli({ type: 'run:completed', conversationId, runId, content: finalText });
          },
          onStopped: (finalText) => {
            updateMessage(conversationId, assistantMsg.id, { content: finalText, status: 'done' });
          },
          onError: (message, accumulated, options) => {
            if (options?.surface) setStreamError(message);
            updateMessage(conversationId, assistantMsg.id, {
              content: accumulated + (accumulated ? '\n\n' : '') + `**Error**: ${message}`,
              status: 'error',
            });
            haptic('error');
            const runId = activeRunIdRef.current ?? `${conversationId}-${Date.now()}`;
            publishCli({ type: 'run:failed', conversationId, runId, error: message });
          },
          onFallback: (error) => {
            console.warn('[runs mode] failed, falling back to chat completions', error);
            activeRunIdRef.current = null;
          },
        },
      );
    } catch (err: any) {
      // Network failure (TypeError) → enqueue the user message so
      // we can retry it the next time the browser reports `online`.
      // Anything else (server 4xx/5xx, JSON parse, etc.) stays in
      // the existing `run:failed` path so the user sees the error
      // immediately and can fix it.
      const isNetwork = err instanceof TypeError || /network|fetch/i.test(String(err?.message ?? err));
      if (isNetwork) {
        const userMsg = makeUserMessage(text);
        if (files.length > 0) {
          userMsg.attachments = files.map((file) => ({
            id: file.uri,
            name: file.name,
            kind: file.kind,
            size: file.size,
            uri: file.uri,
            previewUri: file.kind === 'image' ? file.uri : undefined,
          }));
          userMsg.status = 'queued';
        }
        // mark assistant bubble as queued (will be filled on retry)
        updateMessage(conversationId, assistantMsg.id, {
          content: '⏳ Queued — waiting for connection…',
          status: 'queued',
        });
        enqueue({
          id: userMsg.id,
          conversationId,
          text,
          files: files.map((f) => ({ ...f })),
        }).catch(() => undefined);
        setStreamError('Offline — message will resend automatically when you reconnect.');
        haptic('warning');
      } else {
        setStreamError(err?.message ?? 'Send failed');
        haptic('error');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      activeRunIdRef.current = null;
      activeRunStartedAtRef.current = null;
    }
  }, [
    input,
    streaming,
    conversationId,
    appendMessage,
    updateMessage,
    pendingFiles,
    systemPrompt,
    maxTokens,
    sessionKey,
    settings.temperature,
    useRunsMode,
    llmConfig,
  ]);

  // Keep the bus subscriber's `send` ref pointing at the latest
  // closure so it picks up the freshly created user message, abort
  // controller, etc. on every send.
  useEffect(() => { sendRef.current = send; }, [send]);

  // Flush the offline queue. Tries each entry in FIFO order with
  // exponential backoff; drops entries that hit MAX_RETRIES.
  const flushQueueRef = useRef<(() => Promise<void>) | null>(null);
  flushQueueRef.current = async () => {
    if (streaming) return;
    const items = await listQueued();
    if (items.length === 0) return;
    for (const entry of items) {
      const backoff = nextBackoffMs(entry);
      if (backoff === null) {
        // exhausted retries — mark as failed-queued in the bubble
        const conv = useAppStore.getState().conversations[entry.conversationId];
        if (conv) {
          const last = conv.messages[conv.messages.length - 1];
          if (last?.status === 'queued') {
            useAppStore.getState().updateMessage(entry.conversationId, last.id, {
              content: '❌ Couldn\'t reconnect after 3 tries. Tap to retry.',
              status: 'failed-queued',
            });
          }
        }
        await dequeue(entry.id);
        continue;
      }
      // Replay the message by dispatching it through the same bus
      // that the composer uses. The bus subscriber will reuse the
      // `send` callback, which will now hit the network and either
      // succeed (dequeue) or re-enqueue (handled in send's catch).
      if (entry.conversationId !== useAppStore.getState().activeConversationId) {
        useAppStore.getState().setActiveConversation(entry.conversationId);
        // give React a tick to mount the new conversation before sending
        await new Promise((r) => setTimeout(r, 50));
      }
      const ok = await dispatchChatSend({ text: entry.text, opts: { files: entry.files } });
      if (ok.ok) {
        await dequeue(entry.id);
        // mark the bubble as streaming so the user sees activity
        const conv = useAppStore.getState().conversations[entry.conversationId];
        if (conv) {
          const last = conv.messages[conv.messages.length - 1];
          if (last?.status === 'queued' || last?.status === 'failed-queued') {
            useAppStore.getState().updateMessage(entry.conversationId, last.id, {
              content: '',
              status: 'streaming',
            });
          }
        }
      } else {
        await bumpRetry(entry.id);
      }
    }
  };

  // Flush on app start (if anything is queued) and on browser
  // 'online' events. The hook reads navigator.onLine so a
  // cold-start with the network already up triggers an immediate
  // flush. On native the effect is a no-op.
  useEffect(() => {
    let mounted = true;
    const tryFlush = () => {
      if (!mounted) return;
      void flushQueueRef.current?.();
    };
    if (typeof window !== 'undefined') {
      if (navigator.onLine) tryFlush();
      window.addEventListener('online', tryFlush);
      return () => {
        mounted = false;
        window.removeEventListener('online', tryFlush);
      };
    }
    return () => { mounted = false; };
  }, []);

  const handleEditUserMessage = useCallback(async (messageId: string, newText: string) => {
    if (!conversationId || streaming) return;
    const trimmed = newText.trim();
    if (!trimmed) return;
    haptic('light');
    truncateMessagesAt(conversationId, messageId);
    updateMessage(conversationId, messageId, {
      content: trimmed,
      status: 'done',
    });
    setInput('');
    setTimeout(() => send(trimmed, { appendUserMessage: false, files: [] }), 50);
  }, [conversationId, streaming, truncateMessagesAt, updateMessage, send]);

  const onKeyPress = useCallback((e: any) => {
    if ((e?.nativeEvent?.key === 'Enter') && !e?.nativeEvent?.shiftKey && Platform.OS === 'web') {
      e.preventDefault?.();
      send();
    }
  }, [send]);

  const onStop = useCallback(async () => {
    haptic('warning');
    abortRef.current?.abort();
    if (useRunsMode && activeRunIdRef.current) {
      try {
        const port = createHermesPort(llmConfig, getLLMClient());
        await port.stopRun(activeRunIdRef.current).catch(() => undefined);
      } catch {
        // best effort only
      }
      activeRunIdRef.current = null;
    }
  }, [useRunsMode, llmConfig]);

  return {
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
    attachFile,
    removeFile,
    resolveApproval,
    syncFromHermes,
    send,
    handleEditUserMessage,
    onKeyPress,
    onStop,
    scheduleStickToBottom,
  };
}
