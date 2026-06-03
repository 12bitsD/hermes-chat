export const HERMES_GATEWAY_PORT = 8642;
export const HERMES_CHAT_ENDPOINT_PATH = '/v1/chat/completions';
export const DEFAULT_MODEL = 'default';
export const DEFAULT_SESSION_TITLE = 'New conversation';
export const WELCOME_SESSION_TITLE = 'Welcome to Hermes Chat';

export const REACHABILITY_POLL_MS = 30_000;
export const SNAPSHOT_POLL_MS = 30_000;
export const SNAPSHOT_REQUEST_TIMEOUT_MS = 2_000;
export const PERSISTENCE_SAVE_DEBOUNCE_MS = 400;

export const STREAM_FLUSH_MS = 60;
export const SYNTHETIC_STREAM_CHUNK_SIZE = 30;
export const SYNTHETIC_STREAM_TICK_MS = 16;
export const STICK_TO_BOTTOM_MS = 120;
export const WELCOME_AUTO_DISMISS_MS = 8_000;

export const NARROW_BREAKPOINT = 768;

export const STORAGE_KEY = 'hermes-chat:state:v1';
export const WELCOME_SEEN_STORAGE_KEY = 'hermes-chat:welcome-seen';
