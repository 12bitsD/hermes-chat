import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform } from 'react-native';
import { STICK_TO_BOTTOM_MS } from '../../config/app-constants';
import { dispatchChatSend, subscribeChatSend } from '../../lib/chatSendBus';
import { publishCli } from '../../lib/hermesCliBus';
import { toolRiskLevel } from '../../domain/tools/risk';
import { buildChatHistory } from '../../domain/chat/history';
import { makeAssistantMessage, makeUserMessage } from '../../domain/chat/messages';
import { isAttachmentKind, pickFile, type PickedFile } from '../attachments/filePicker';
import { createHermesPort, createSessionsClient, buildLLMConfig } from '../../services/llm/factory';
import { runChatTurn } from './chatTurnService';
import { flushQueuedTurns, queueOfflineTurn } from './offlineQueue';
import { appendReasoningEvent, appendToolStarted, completeLatestRunningTool } from './toolEvents';
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

function attachmentsFromFiles(files: PickedFile[]) {
  return files.map((file) => ({
    id: file.uri,
    name: file.name,
    kind: file.kind,
    size: file.size,
    uri: file.uri,
    previewUri: file.kind === 'image' ? file.uri : undefined,
  }));
}

function pickedFilesFromUnknown(files: unknown[] | undefined): PickedFile[] {
  return (files ?? []).filter((file): file is PickedFile => {
    if (!file || typeof file !== 'object') return false;
    const candidate = file as Partial<PickedFile>;
    return typeof candidate.name === 'string'
      && typeof candidate.size === 'number'
      && typeof candidate.uri === 'string'
      && isAttachmentKind(candidate.kind);
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

  // Phase 66 #4: push-to-talk (mobile). startVoicePtt kicks off the
  // same recording pipeline as toggleVoice; stopVoicePttAndSend
  // stops recording and **sends the captured text immediately**,
  // not just appends it to the composer. We use a 200ms short-press
  // cancel window to avoid accidental short taps turning into
  // empty sends.
  const voicePttTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startVoicePtt = useCallback(async () => {
    if (voiceOn) return;
    if (voicePttTimerRef.current) {
      clearTimeout(voicePttTimerRef.current);
    }
    // 200ms grace period — short presses are cancels, not starts.
    // This avoids stray taps from triggering the long-press UI.
    voicePttTimerRef.current = setTimeout(async () => {
      voicePttTimerRef.current = null;
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
        haptic('medium');
      }
    }, 200);
  }, [voiceOn]);

  const stopVoicePttAndSend = useCallback(async () => {
    if (voicePttTimerRef.current) {
      // Short press — cancel the pending start, do nothing.
      clearTimeout(voicePttTimerRef.current);
      voicePttTimerRef.current = null;
      return;
    }
    if (!voiceOn) return;
    voiceStopRef.current?.();
    voiceStopRef.current = null;
    setVoiceOn(false);
    setVoicePartial('');
    // Pull the current input (final text) and send it.
    if (input.trim()) {
      haptic('light');
      // Defer one tick so the input state commit settles. Read
      // the latest send closure from a ref to avoid the TDZ
      // problem (send is defined further down in the hook).
      const fn = sendRef.current;
      if (fn) setTimeout(() => void fn(input, { appendUserMessage: true, files: [] }), 30);
    }
  }, [voiceOn, input]);

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
  const sendRef = useRef<((text: string, opts?: {
    appendUserMessage?: boolean;
    userMessageId?: string;
    assistantMessageId?: string;
    files?: PickedFile[];
  }) => Promise<void> | null)>(null);
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
      if (send) {
        void send(text, {
          appendUserMessage: req.opts?.appendUserMessage ?? true,
          userMessageId: req.opts?.userMessageId,
          assistantMessageId: req.opts?.assistantMessageId,
          files: pickedFilesFromUnknown(req.opts?.files),
        });
      }
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
    if (!useRunsMode) {
      setPendingApproval(null);
      return;
    }
    const port = createHermesPort(llmConfig, getLLMClient());
    try {
      await port.resolveApproval(runId, approvalId, decision, note);
      setPendingApproval(null);
      if (decision === 'deny') {
        await port.stopRun(runId).catch(() => undefined);
      }
      haptic(decision === 'approve' ? 'success' : 'warning');
    } catch (error) {
      setStreamError(`Approval failed: ${errorMessage(error)}`);
      haptic('error');
    }
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
    opts: { appendUserMessage?: boolean; userMessageId?: string; assistantMessageId?: string; files?: PickedFile[] } = {},
  ) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming || !conversationId) return;
    const appendUserMessage = opts.appendUserMessage ?? true;
    const files = opts.files ?? pendingFiles;
    let turnUserMessageId = opts.userMessageId ?? null;

    abortRef.current?.abort();
    Keyboard.dismiss();
    setInput('');
    setStreamError(null);

    if (appendUserMessage) {
      const userMsg = makeUserMessage(text);
      if (files.length > 0) userMsg.attachments = attachmentsFromFiles(files);
      turnUserMessageId = userMsg.id;
      appendMessage(conversationId, userMsg);
    }

    const assistantMsg = opts.assistantMessageId ? null : makeAssistantMessage('');
    const assistantMessageId = opts.assistantMessageId ?? assistantMsg?.id;
    if (!assistantMessageId) return;
    if (assistantMsg) {
      appendMessage(conversationId, assistantMsg);
    } else {
      updateMessage(conversationId, assistantMessageId, {
        content: '',
        status: 'streaming',
        toolEvents: [],
      });
    }
    if (!appendUserMessage && turnUserMessageId) {
      updateMessage(conversationId, turnUserMessageId, { status: 'done' });
    }
    if (appendUserMessage) setPendingFiles([]);

    setStreaming(true);
    haptic('light');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    activeRunStartedAtRef.current = Date.now();

    const historyMessages = buildChatHistory(
      useAppStore.getState().getActiveMessages(),
      { systemPrompt, skipMessageId: assistantMessageId },
    );

    const queueTurn = async () => {
      const queued = await queueOfflineTurn({
        conversationId,
        userMessageId: turnUserMessageId,
        assistantMessageId,
        text,
        files,
        updateMessage,
        setStreamError,
      });
      if (queued) haptic('warning');
      return queued;
    };

    try {
      const turnResult = await runChatTurn(
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
            updateMessage(conversationId, assistantMessageId, { content });
          },
          onToolStarted: (event) => {
            updateMessage(conversationId, assistantMessageId, {
              toolEvents: appendToolStarted(
                getCurrentToolEvents(conversationId, assistantMessageId),
                event,
              ),
            });
            publishCli({ type: 'tool:started', runId: event.runId, tool: event.tool, preview: event.preview });
          },
          onToolCompleted: (event) => {
            const existing = getCurrentToolEvents(conversationId, assistantMessageId);
            updateMessage(conversationId, assistantMessageId, {
              toolEvents: completeLatestRunningTool(existing, event),
            });
            publishCli({
              type: 'tool:completed',
              runId: activeRunIdRef.current ?? `${conversationId}-${Date.now()}`,
              tool: event.tool,
              durationMs: event.duration * 1000,
              ok: !event.error,
            });
          },
          onReasoning: (event) => {
            updateMessage(conversationId, assistantMessageId, {
              toolEvents: appendReasoningEvent(
                getCurrentToolEvents(conversationId, assistantMessageId),
                event,
              ),
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
              void port.resolveApproval(event.runId, event.approvalId, 'approve').catch((error) => {
                setPendingApproval({
                  runId: event.runId,
                  approvalId: event.approvalId,
                  prompt: event.prompt,
                  tool: event.tool,
                  args: event.args,
                });
                updateMessage(conversationId, assistantMessageId, { status: 'awaiting-approval' });
                setStreamError(`Auto-approval failed: ${errorMessage(error)}`);
                haptic('warning');
              });
              return;
            }
            setPendingApproval({
              runId: event.runId,
              approvalId: event.approvalId,
              prompt: event.prompt,
              tool: event.tool,
              args: event.args,
            });
            updateMessage(conversationId, assistantMessageId, { status: 'awaiting-approval' });
            publishCli({
              type: 'approval:required',
              runId: event.runId,
              approvalId: event.approvalId,
              tool: event.tool,
              prompt: event.prompt,
            });
          },
          onDone: (finalText) => {
            updateMessage(conversationId, assistantMessageId, { content: finalText, status: 'done' });
            if (turnUserMessageId) updateMessage(conversationId, turnUserMessageId, { status: 'done' });
            haptic('success');
            const runId = activeRunIdRef.current ?? `${conversationId}-${Date.now()}`;
            publishCli({ type: 'run:completed', conversationId, runId, content: finalText });
          },
          onStopped: (finalText) => {
            updateMessage(conversationId, assistantMessageId, { content: finalText, status: 'done' });
            if (turnUserMessageId) updateMessage(conversationId, turnUserMessageId, { status: 'done' });
          },
          onError: (message, accumulated, options) => {
            if (options?.surface) setStreamError(message);
            updateMessage(conversationId, assistantMessageId, {
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

      if (turnResult.outcome === 'error' && turnResult.queueableNetworkError) {
        const queued = await queueTurn();
        if (!queued) {
          setStreamError('Offline — reconnect and try again.');
          haptic('warning');
        }
      }
    } catch (err: any) {
      const isNetwork = err instanceof TypeError || /network|fetch/i.test(String(err?.message ?? err));
      if (isNetwork && await queueTurn()) {
        // queued by the explicit offline path
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
    const getState = useAppStore.getState;
    await flushQueuedTurns({
      isStreaming: () => streamingRef.current,
      getActiveConversationId: () => getState().activeConversationId,
      getConversation: (id) => getState().conversations[id],
      setActiveConversation: (id) => getState().setActiveConversation(id),
      updateMessage: (id, messageId, patch) => getState().updateMessage(id, messageId, patch),
      dispatchSend: dispatchChatSend,
    });
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
  };
}
