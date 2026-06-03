import { STREAM_FLUSH_MS } from '../../config/app-constants';
import type { ChatMessageInput } from '../../services/llm';
import type { HermesPort } from '../../services/llm/hermes-port';
import { throttle } from '../../utils/perf';

export interface ChatTurnRequest {
  conversationId: string;
  input: string;
  historyMessages: ChatMessageInput[];
  instructions?: string;
  model: string;
  sessionKey?: string;
  useRunsMode: boolean;
  maxTokens?: number;
  temperature?: number;
  signal: AbortSignal;
  flushMs?: number;
}

export interface ToolStartedEvent {
  runId: string;
  timestamp: number;
  tool: string;
  preview?: string;
}

export interface ToolCompletedEvent {
  timestamp: number;
  tool: string;
  duration: number;
  error: boolean;
}

export interface ReasoningEvent {
  runId: string;
  timestamp: number;
  text: string;
}

export interface ApprovalRequiredEvent {
  runId: string;
  approvalId: string;
  prompt: string;
  tool: string;
  args: unknown;
}

export interface ChatTurnCallbacks {
  onRunStarted?: (runId: string) => void;
  onTextFlush: (text: string) => void;
  onToolStarted?: (event: ToolStartedEvent) => void;
  onToolCompleted?: (event: ToolCompletedEvent) => void;
  onReasoning?: (event: ReasoningEvent) => void;
  onApprovalRequired?: (event: ApprovalRequiredEvent) => void;
  onDone: (finalText: string) => void;
  onStopped?: (finalText: string) => void;
  onError: (message: string, accumulated: string, options?: { surface?: boolean }) => void;
  onFallback?: (error: unknown) => void;
}

export async function runChatTurn(
  port: HermesPort,
  req: ChatTurnRequest,
  callbacks: ChatTurnCallbacks,
): Promise<void> {
  const flushMs = req.flushMs ?? STREAM_FLUSH_MS;
  let acc = '';
  let pendingAcc = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRunId: string | null = null;

  const clearFlush = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };
  const flush = () => {
    flushTimer = null;
    if (pendingAcc) {
      callbacks.onTextFlush(pendingAcc);
      pendingAcc = '';
    }
  };
  const scheduleFlush = throttle(() => flush(), flushMs);

  try {
    try {
      if (!req.useRunsMode) throw new Error('user disabled runs mode');
      activeRunId = await port.startRun({
        input: req.input,
        instructions: req.instructions,
        conversationHistory: req.historyMessages,
        model: req.model,
        sessionId: req.conversationId,
        sessionKey: req.sessionKey,
        signal: req.signal,
      });
      callbacks.onRunStarted?.(activeRunId);

      for await (const ev of port.subscribeRunEvents(activeRunId, req.signal)) {
        if (req.signal.aborted) break;
        if (ev.event === 'message.delta') {
          acc += ev.delta;
          pendingAcc = acc;
          scheduleFlush();
        } else if (ev.event === 'tool.started') {
          callbacks.onToolStarted?.({
            runId: activeRunId,
            timestamp: ev.timestamp,
            tool: ev.tool,
            preview: ev.preview,
          });
        } else if (ev.event === 'tool.completed') {
          callbacks.onToolCompleted?.({
            timestamp: ev.timestamp,
            tool: ev.tool,
            duration: ev.duration,
            error: ev.error,
          });
        } else if (ev.event === 'completed') {
          clearFlush();
          callbacks.onDone(ev.final_response || acc);
          return;
        } else if (ev.event === 'failed') {
          clearFlush();
          callbacks.onError(ev.error.message, acc);
          return;
        } else if (ev.event === 'stopped') {
          clearFlush();
          callbacks.onStopped?.(acc) ?? callbacks.onDone(acc);
          return;
        } else if (ev.event === 'approval.required') {
          callbacks.onApprovalRequired?.({
            runId: activeRunId,
            approvalId: ev.approval_id,
            prompt: ev.prompt,
            tool: ev.tool,
            args: ev.args,
          });
        } else if (ev.event === 'reasoning.available') {
          callbacks.onReasoning?.({
            runId: activeRunId,
            timestamp: ev.timestamp,
            text: ev.text,
          });
        }
      }

      clearFlush();
      if (acc) {
        callbacks.onDone(acc);
      } else {
        callbacks.onError('run stream closed before any content arrived', acc);
      }
      return;
    } catch (error) {
      if (req.signal.aborted) return;
      callbacks.onFallback?.(error);

      const fallbackCtrl = new AbortController();
      const onOuterAbort = () => fallbackCtrl.abort();
      req.signal.addEventListener('abort', onOuterAbort, { once: true });
      if (activeRunId) {
        port.stopRun(activeRunId).catch(() => undefined);
        activeRunId = null;
      }
      try {
        await port.streamChat(
          {
            conversationId: req.conversationId,
            messages: req.historyMessages,
            signal: fallbackCtrl.signal,
            maxTokens: req.maxTokens,
            temperature: req.temperature,
          },
          {
            onChunk: (chunk) => {
              if (fallbackCtrl.signal.aborted) return;
              acc += chunk;
              pendingAcc = acc;
              scheduleFlush();
            },
            onDone: () => {
              clearFlush();
              callbacks.onDone(acc);
            },
            onError: (err) => {
              clearFlush();
              callbacks.onError(err?.message ?? String(err), acc);
            },
          },
          { sessionId: req.conversationId, sessionKey: req.sessionKey },
        );
      } finally {
        req.signal.removeEventListener('abort', onOuterAbort);
      }
    }
  } catch (error: any) {
    clearFlush();
    if (req.signal.aborted) return;
    callbacks.onError(error?.message ?? String(error), acc, { surface: true });
  }
}
