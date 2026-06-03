/**
 * mascotState — maps a message's lifecycle state to one of the
 * committed mascot PNGs in `assets/illustrations/`.
 *
 * Why a separate module: keeps the PNG require() map out of
 * MessageBubble (which is already 700+ lines) and gives other
 * surfaces (EmptyState, ChatView hero, future settings) a single
 * place to pick the right mascot.
 *
 * The state derivation prefers the most specific signal available:
 *   1. error / failed-queued       -> confused
 *   2. any tool event is running    -> running
 *   3. status === 'streaming'       -> thinking
 *   4. status === 'awaiting-approval'-> thinking
 *   5. status === 'done'            -> celebrate
 *   6. (caller passes a custom state) -> that
 *   7. fallback                     -> sleeping
 *
 * The default 'idle' is the static avatar.png (the same one we
 * always showed before Phase 69), so unrelated callers don't have
 * to know about this util.
 */
import type { Message, MessageStatus, ToolEvent } from '../../types';

export type MascotState =
  | 'idle'        // default avatar
  | 'thinking'    // assistant is mid-stream
  | 'running'     // a tool call is in flight
  | 'celebrate'   // assistant finished, all good
  | 'confused'    // error or failed-queued
  | 'sleeping';   // long-idle (not used yet, reserved)

/** Static map of state -> require()'d asset. `require` is used
 *  so the bundler hashes the file at build time and we don't
 *  ship unused bytes. */
export const MASCOT_PNG = {
  idle:      require('../../../assets/illustrations/avatar.png'),
  thinking:  require('../../../assets/illustrations/mascot-thinking.png'),
  running:   require('../../../assets/illustrations/mascot-running.png'),
  celebrate: require('../../../assets/illustrations/mascot-celebrate.png'),
  confused:  require('../../../assets/illustrations/mascot-confused.png'),
  sleeping:  require('../../../assets/illustrations/mascot-sleeping.png'),
} as const;

/** Derive the right mascot state for a given assistant message. */
export function deriveMascotState(message: Message): MascotState {
  if (message.role === 'user') return 'idle';
  if (message.status === 'error' || message.status === 'failed-queued') return 'confused';
  if (message.status === 'queued') return 'sleeping';
  // running: at least one tool event is in flight
  const hasRunningTool = (message.toolEvents ?? []).some((t: ToolEvent) => t.status === 'running');
  if (hasRunningTool) return 'running';
  if (message.status === 'streaming' || message.status === 'awaiting-approval') return 'thinking';
  if (message.status === 'done') return 'celebrate';
  return 'idle';
}

/** Helper for a "what state should the hero mascot be in" check,
 *  used by the EmptyState / ChatView hero when there's no message
 *  to derive from. */
export function mascotStateForAppState(
  status: MessageStatus | null | undefined,
  hasRunningTool: boolean,
): MascotState {
  if (status === 'streaming' || status === 'awaiting-approval') return 'thinking';
  if (hasRunningTool) return 'running';
  if (status === 'error' || status === 'failed-queued') return 'confused';
  return 'idle';
}
