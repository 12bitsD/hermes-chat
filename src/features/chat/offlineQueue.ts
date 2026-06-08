import {
  OFFLINE_QUEUE_ASSISTANT_TEXT,
  OFFLINE_QUEUE_FAILED_TEXT,
  OFFLINE_QUEUE_NOTICE,
  QUEUE_CONVERSATION_SWITCH_SETTLE_MS,
} from '../../config/app-constants';
import type { ChatSendRequest, ChatSendResult } from '../../lib/chatSendBus';
import { bumpRetry, dequeue, enqueue, list as listQueued, nextBackoffMs } from '../../services/queue/messageQueue';
import type { Conversation, Message } from '../../types';
import type { PickedFile } from '../attachments/filePicker';

type UpdateMessage = (conversationId: string, messageId: string, patch: Partial<Message>) => void;

export interface QueueOfflineTurnArgs {
  conversationId: string;
  userMessageId: string | null;
  assistantMessageId: string;
  text: string;
  files: PickedFile[];
  updateMessage: UpdateMessage;
  setStreamError: (message: string) => void;
}

export async function queueOfflineTurn({
  conversationId,
  userMessageId,
  assistantMessageId,
  text,
  files,
  updateMessage,
  setStreamError,
}: QueueOfflineTurnArgs): Promise<boolean> {
  if (!userMessageId) return false;
  await enqueue({
    id: userMessageId,
    assistantMessageId,
    conversationId,
    text,
    files: files.map((file) => ({ ...file })),
  });
  updateMessage(conversationId, userMessageId, { status: 'queued' });
  updateMessage(conversationId, assistantMessageId, {
    content: OFFLINE_QUEUE_ASSISTANT_TEXT,
    status: 'queued',
  });
  setStreamError(OFFLINE_QUEUE_NOTICE);
  return true;
}

export interface FlushQueuedTurnsArgs {
  isStreaming: () => boolean;
  getActiveConversationId: () => string | null;
  getConversation: (conversationId: string) => Conversation | undefined;
  setActiveConversation: (conversationId: string) => void;
  updateMessage: UpdateMessage;
  dispatchSend: (request: ChatSendRequest) => Promise<ChatSendResult>;
  wait?: (ms: number) => Promise<void>;
}

export async function flushQueuedTurns({
  isStreaming,
  getActiveConversationId,
  getConversation,
  setActiveConversation,
  updateMessage,
  dispatchSend,
  wait = sleep,
}: FlushQueuedTurnsArgs): Promise<void> {
  if (isStreaming()) return;
  const items = await listQueued();
  if (items.length === 0) return;

  for (const entry of items) {
    if (isStreaming()) return;
    const backoff = nextBackoffMs(entry);
    if (backoff === null) {
      markQueuedTurnFailed(entry.conversationId, entry.id, entry.assistantMessageId, getConversation, updateMessage);
      await dequeue(entry.id);
      continue;
    }

    await wait(backoff);
    if (isStreaming()) return;

    if (entry.conversationId !== getActiveConversationId()) {
      setActiveConversation(entry.conversationId);
      await wait(QUEUE_CONVERSATION_SWITCH_SETTLE_MS);
      if (isStreaming()) return;
    }

    const conversation = getConversation(entry.conversationId);
    const hasUserMessage = !!conversation?.messages.some((message) => message.id === entry.id);
    const hasAssistantMessage = !!(entry.assistantMessageId
      && conversation?.messages.some((message) => message.id === entry.assistantMessageId));

    const result = await dispatchSend({
      text: entry.text,
      opts: {
        appendUserMessage: !hasUserMessage,
        userMessageId: hasUserMessage ? entry.id : undefined,
        assistantMessageId: hasAssistantMessage ? entry.assistantMessageId : undefined,
        files: entry.files,
      },
    });

    if (result.ok) await dequeue(entry.id);
    else await bumpRetry(entry.id);
  }
}

function markQueuedTurnFailed(
  conversationId: string,
  userMessageId: string,
  assistantMessageId: string | undefined,
  getConversation: (conversationId: string) => Conversation | undefined,
  updateMessage: UpdateMessage,
) {
  const conversation = getConversation(conversationId);
  if (!conversation) return;

  const assistant = assistantMessageId
    ? conversation.messages.find((message) => message.id === assistantMessageId)
    : null;
  const user = conversation.messages.find((message) => message.id === userMessageId);

  if (assistant?.status === 'queued') {
    updateMessage(conversationId, assistant.id, {
      content: OFFLINE_QUEUE_FAILED_TEXT,
      status: 'failed-queued',
    });
  }
  if (user?.status === 'queued') {
    updateMessage(conversationId, user.id, { status: 'failed-queued' });
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
