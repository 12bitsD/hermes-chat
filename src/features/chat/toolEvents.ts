import type { ToolEvent } from '../../types';
import type { ReasoningEvent, ToolCompletedEvent, ToolStartedEvent } from './chatTurnService';

export function appendToolStarted(existing: ToolEvent[], event: ToolStartedEvent): ToolEvent[] {
  return [
    ...existing,
    {
      id: `${event.runId}-${event.tool}-${event.timestamp}-${existing.length}`,
      tool: event.tool,
      status: 'running',
      startedAt: toMs(event.timestamp),
      preview: event.preview,
    },
  ];
}

export function completeLatestRunningTool(existing: ToolEvent[], event: ToolCompletedEvent): ToolEvent[] {
  const targetIndex = findLatestRunningToolIndex(existing, event.tool);
  if (targetIndex < 0) return existing;

  return existing.map((tool, index) => (
    index === targetIndex
      ? {
        ...tool,
        status: event.error ? 'error' : 'done',
        finishedAt: toMs(event.timestamp),
        durationMs: event.duration * 1000,
      }
      : tool
  ));
}

export function appendReasoningEvent(existing: ToolEvent[], event: ReasoningEvent): ToolEvent[] {
  return [
    ...existing,
    {
      id: `${event.runId}-reasoning-${event.timestamp}-${existing.length}`,
      tool: 'reasoning',
      status: 'done',
      startedAt: toMs(event.timestamp),
      finishedAt: toMs(event.timestamp),
      preview: event.text,
    },
  ];
}

function findLatestRunningToolIndex(events: ToolEvent[], toolName: string) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.tool === toolName && event.status === 'running') return index;
  }
  return -1;
}

function toMs(timestampSeconds: number) {
  return timestampSeconds * 1000;
}
