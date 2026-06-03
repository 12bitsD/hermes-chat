export type Role = 'user' | 'assistant' | 'system';

export type MessageStatus = 'streaming' | 'done' | 'error' | 'awaiting-approval';

export interface ToolEvent {
  /** Unique id so React can key events in the same message. */
  id: string;
  tool: string;
  status: 'running' | 'done' | 'error';
  startedAt: number;
  finishedAt?: number;
  preview?: string;
  durationMs?: number;
}

export interface ApprovalRequest {
  approvalId: string;
  prompt: string;
  tool: string;
  args: unknown;
}

export interface Message {
  id: string;
  role: Role;
  content: string; // markdown-flavored text
  status: MessageStatus;
  createdAt: number;
  attachments?: Attachment[];
  toolEvents?: ToolEvent[];
  approval?: ApprovalRequest;
}

export interface Attachment {
  id: string;
  name: string;
  kind: 'pdf' | 'ppt' | 'image' | 'text' | 'other';
  size: number;
  uri: string;
  previewUri?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  pinned?: boolean;
}

export interface PromptTemplate {
  id: string;
  title: string;
  body: string;
  category?: string;
  pinned?: boolean;
  usageCount: number;
  lastUsedAt?: number;
  createdAt: number;
}

export type LLMProvider = 'hermes-gateway';
export type Accent = 'mono' | 'ocean' | 'sakura' | 'forest';

export interface AppSettings {
  /** Visual accent: mono | blue | pink | green */
  accent: Accent;
  showSidebar: boolean;
  showIllustrations: boolean;
  fontSize: number;
  streamChunkMs: number;
  enableHaptics: boolean;
  /** LLM provider selection — default Hermes gateway, fallback presets available */
  llmProvider: LLMProvider;
  /** Hermes gateway endpoint (OpenAI-compatible chat completions) */
  llmEndpoint: string;
  /** Optional API key for the gateway */
  llmApiKey: string;
  /** Model id passed to the gateway; "default" means use whatever the gateway routes to */
  llmModel: string;
  /** System prompt prepended to every conversation */
  systemPrompt: string;
  /** Temperature 0-1; undefined = server default */
  temperature?: number;
  /** Optional max tokens; undefined = server default */
  maxTokens?: number;
  /** Hermes-only: scopes long-term memory via X-Hermes-Session-Key */
  sessionKey?: string;
  /**
   * Hermes-only: when true, ChatView talks to /v1/runs instead of
   * /v1/chat/completions so the gateway can surface tool events and
   * approval prompts. Falls back to the chat-completions path on any
   * network error so the user is never locked out.
   */
  useRunsMode?: boolean;
}
