import type { RunEvent, RunRequest } from './runs-client';
import type { LLMClient, LLMStreamContext, LLMStreamHandlers, LLMStreamRequest, Reachability } from './types';

export interface HermesPort {
  isReachable(): Promise<Reachability>;
  streamChat(req: LLMStreamRequest, handlers: LLMStreamHandlers, ctx?: LLMStreamContext): Promise<void>;
  startRun(req: RunRequest): Promise<string>;
  subscribeRunEvents(runId: string, signal?: AbortSignal): AsyncGenerator<RunEvent, void, void>;
  stopRun(runId: string): Promise<void>;
  resolveApproval(runId: string, approvalId: string, decision: 'approve' | 'deny', note?: string): Promise<void>;
}

export function createHermesPort(chatClient: LLMClient, runsClient: {
  isReachable(): Promise<Reachability>;
  startRun(req: RunRequest): Promise<string>;
  subscribeEvents(runId: string, signal?: AbortSignal): AsyncGenerator<RunEvent, void, void>;
  stopRun(runId: string): Promise<void>;
  resolveApproval(runId: string, approvalId: string, decision: 'approve' | 'deny', note?: string): Promise<void>;
}): HermesPort {
  return {
    isReachable: () => chatClient.isReachable(),
    streamChat: (req, handlers, ctx) => chatClient.streamChat(req, handlers, ctx),
    startRun: (req) => runsClient.startRun(req),
    subscribeRunEvents: (runId, signal) => runsClient.subscribeEvents(runId, signal),
    stopRun: (runId) => runsClient.stopRun(runId),
    resolveApproval: (runId, approvalId, decision, note) => runsClient.resolveApproval(runId, approvalId, decision, note),
  };
}
