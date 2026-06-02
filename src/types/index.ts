export type Role = 'user' | 'assistant' | 'system';

export type MessageStatus = 'streaming' | 'done' | 'error';

export interface Message {
  id: string;
  role: Role;
  content: string; // markdown-flavored text
  status: MessageStatus;
  createdAt: number;
  attachments?: Attachment[];
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

export type LLMProvider = 'mock' | 'hermes-gateway';
export type Accent = 'mono' | 'blue' | 'pink' | 'green';

export interface AppSettings {
  /** Visual accent: mono | blue | pink | green */
  accent: Accent;
  showSidebar: boolean;
  showIllustrations: boolean;
  fontSize: number;
  streamChunkMs: number;
  enableHaptics: boolean;
  /** LLM provider selection */
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
}

export const DEFAULT_SETTINGS: AppSettings = {
  accent: 'blue',
  showSidebar: true,
  showIllustrations: true,
  fontSize: 13,
  streamChunkMs: 25,
  enableHaptics: true,
  llmProvider: 'mock',
  llmEndpoint: '',
  llmApiKey: '',
  llmModel: 'default',
  systemPrompt: 'You are Hermes, a witty, helpful, anime-obsessed assistant. Keep responses concise unless asked to elaborate. Use markdown.',
};
