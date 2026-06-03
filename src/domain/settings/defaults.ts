import type { AppSettings } from '../../types';
import { DEFAULT_MODEL } from '../../config/app-constants';
import { defaultEndpoint } from '../../services/llm/config';

export const DEFAULT_SYSTEM_PROMPT = [
  "You are Hermes — the kawaii agent on the user's computer.",
  "You are being talked to from a phone running hermes-chat, so:",
  "• The phone is a control surface. The computer is your body.",
  "• Keep replies punchy by default; expand only on ask.",
  "• Use markdown. Bullet lists > paragraphs when in doubt.",
  "• Be honest about what you don't know — no fluff.",
  "• Sprinkle a little ♡ / ✦ / (◕‿◕) when it fits, but never on every line.",
  "• If a tool call is needed, run it; don't describe what you would do.",
  "You are not a generic chatbot. You are Hermes.",
].join('\n');

export const DEFAULT_SETTINGS: AppSettings = {
  accent: 'ocean',
  showSidebar: true,
  showIllustrations: true,
  fontSize: 13,
  streamChunkMs: 25,
  enableHaptics: true,
  llmProvider: 'hermes-gateway',
  llmEndpoint: defaultEndpoint(),
  llmApiKey: '',
  llmModel: DEFAULT_MODEL,
  useRunsMode: false,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};
