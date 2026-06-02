# Hermes Chat — Development Log

This file tracks what was built, in what order, and what decisions
were made along the way. The intent is to make a future agent
(or you, in a few weeks) able to skim this and understand the
codebase without re-reading the entire git log.

## Phase 0 — Foundation (initial commit)

- Expo SDK 56 + RN 0.85 + zustand + AsyncStorage
- Win95-styled shell: TitleBar, Panel, Window, Button, TextField, MenuBar
- Multi-conversation rail, prompt-template navigator
- In-house markdown renderer (no external dependency, kept bundle small)
- Mock streaming LLM (char-by-char, with abort signal)

## Phase 1 — Mobile-first rewrite + LLM abstraction

The original Win95 shell worked on the web, but the brief is **mobile**.
Reworked the whole shell into:

- Mobile-first layout: app bar / drawer / bottom sheet instead of
  desktop windows + menu bars
- `isNarrow` / `isAndroid` / `isNative` utilities drive the breakpoint
- SafeAreaProvider + KeyboardAvoidingView
- Hermes gateway client is a separate concern from UI:
  - `src/services/llm/types.ts` — LLMClient interface (mock or gateway)
  - `src/services/llm/hermes-client.ts` — OpenAI-compatible SSE stream
  - `src/services/llm/mock-client.ts` — char-by-char fake stream
  - `src/services/llm/index.ts` — factory driven by settings

The seam between UI and backend is **stable**. Toggling between mock
and a real gateway is a one-line config flip.

## Phase 2 — Settings panel + real-gateway plumbing

- Bottom-sheet settings panel (Modal + ScrollView)
- Probe button calls `isReachable()` against the configured endpoint
- Status dot in the app bar (cyan=mock, green=ok, red=down, gray=probing)
- Reachability probed every 30 s + on every settings change
- Persisted in AsyncStorage with a 400 ms debounce
- Sets `llmProvider/Endpoint/ApiKey/Model/systemPrompt/temperature`

## Phase 3 — iMessage-style bubbles + EmptyState

- `MessageBubble` got a per-message avatar (mascot) on assistant side
- `EmptyState` (welcome screen) replaced the old system-welcome message
- 4 suggested-prompt cards, tappable to fill the composer
- TypingDots animation while streaming empty content
- Blinking ▍ cursor while content streams in
- "Long-press to delete" on conversation rail

## Phase 4 — Performance

- `MessageBubble` is `React.memo` with explicit areEqual
- Streaming store updates are throttled to 60 ms (≈17 Hz)
- onDone / onError bypass the throttle so the final content always lands
- onContentSizeChange on the message ScrollView keeps the tail in view
  during streaming

## Phase 5 — Mobile gesture polish

- `SessionDrawer` slides in from the left with an animated translateX
- `PromptSheet` slides up from the bottom with a drag handle
- Backdrop taps close both
- Mobile-only app-bar buttons (drawer, prompts, settings, +new)
- Active insets handling for iPhone notch + home indicator

## Phase 6 — 4 themes

Theme was first Win95 (3D bevels, dotted focus rings). The user said
*"太复古"* — too retro — so it was rewritten as a flat, low-noise
design closer to iMessage / Linear / Notion.

4 accent variants: `mono` / `ocean` / `sakura` / `forest`. Each is
just an fg / fgOn / soft / line palette; everything else is gray.

`useTheme()` is a hook that subscribes to `settings.accent` and
returns the FlatTheme. All visible chrome uses the hook so a switch
re-paints the whole UI in one frame.

## Phase 7 — Native peripherals

- `expo-image-picker` for photo attach
- `expo-speech-recognition` for voice input
- `expo-document-picker` for arbitrary file attach
- All wrapped in lazy `require()`s so the web bundle isn't bloated
- iOS + Android native permission strings added to `app.json`

## Phase 8 — Polish round

- `Button` small variant re-tuned (padding / fontSize) so "Send" label
  never clips on narrow viewports
- Tsc + bundle + manual verify on a 400×820 iframe phone preview

## Phase 9 — Kawaii concentration: GPT-Image-2 illustrations

User asked to push the kawaii density up. Generated four illustrations
via `image_generate` (gpt-image-2-high):

- `assets/illustrations/mascot.png` (512×512) — pink twintail girl in
  a sakura dress. Used in `EmptyState` hero.
- `assets/illustrations/avatar.png` (256×256) — chibi face. Used in
  `MessageBubble` assistant avatar.
- `assets/illustrations/launcher-icon.png` (1024×1024) — wink + V sign.
- `assets/illustrations/sakura-bg.png` (1024×1536) — soft petal field.

Each was resized with `sips` to keep the bundle small.

## Phase 10 — Kawaii density + avatar clipping fix

- App bar: `🌸 {title} ✦` and `n sessions ♡`
- Suggestion cards: titles got kawaii flair ('(。•ω•)', '✦', '♡')
- New SakuraRain: full-screen ambient petal layer (6–14 petals, low
  opacity, pointerEvents none so it never blocks input)
- **Bug fix**: `MascotAvatar` had no `overflow: 'hidden'`, so the
  rectangular 256×256 PNG was rendering as a square preview instead
  of being clipped to the circle. Fixed.

Seed conversation rewritten to a kawaii demo: user says
"Hello cutie! ✨" and the assistant replies with (◕‿◕), ♡, italic,
bold, and a blockquote — so the avatar and kawaii density are
visible on first launch.

## Phase 11 — Agent-friendly endpoint configuration

Read `/Users/bytedance/Desktop/hermes-agent/gateway/platforms/api_server.py`
(4228 lines) to understand the real protocol. Surfaced every capability:

- 4 endpoint presets: `mock` (offline) / `hermes-gateway` (port 8642) /
  `openai-compatible` (any LiteLLM / Open WebUI / etc.) / `ollama` (11434)
- Each preset has its own baseUrl + default model + capability flags
- `defaultEndpoint()` nudges Android emulator users to 10.0.2.2
- `LLMConfig` is now a real exported interface (was previously an
  inline shape hidden in persistence.ts)

**Hermes-aware headers** (forwarded by `HermesGatewayClient.streamChat`
when the user picks `hermes-gateway`):

- `X-Hermes-Session-Id` — the conversation id, so the gateway can
  stitch turns into a persisted session via SessionDB
- `X-Hermes-Session-Key` — optional, scopes long-term memory

Plain OpenAI-compatible servers ignore unknown headers, so the same
client works across the preset list.

`Settings` got a "Fetch models" button that calls `/v1/models` and
renders the result as pill chips. Tap a chip to select.

## Phase 12 — Hermes /v1/runs agent protocol

`/v1/runs` is the real agent lifecycle endpoint on the Hermes
gateway — it returns a `run_id` immediately (202) and streams
structured events over SSE:

- `message.delta` — token chunk
- `tool.started` / `tool.completed` — agent ran a tool
- `reasoning.available` — chain-of-thought text (optional)
- `approval.required` — agent wants user permission
- `completed` / `failed` / `stopped` — terminal

New layer: `src/services/llm/runs-client.ts` with `HermesRunsClient`
that:
- starts a run via POST /v1/runs
- subscribes to the SSE event stream as an `AsyncGenerator<RunEvent>`
- posts approvals to /v1/runs/{run_id}/approval
- stops via /v1/runs/{run_id}/stop
- gets current run status via /v1/runs/{run_id}

ChatView branches on `settings.useRunsMode`:
- true + hermes-gateway → HermesRunsClient path
- any error inside runs mode → automatic fallback to plain
  /v1/chat/completions so the user is never locked out
- For each RunEvent, the message is patched in real time:
  * `message.delta` → accumulate + flush (same as before)
  * `tool.started` → push a `ToolEvent` (status: 'running')
  * `tool.completed` → resolve the running ToolEvent
  * `approval.required` → open `ApprovalModal`
  * `completed` → final content + status: 'done'
  * `failed` → status: 'error'
  * `stopped` → keep partial content, status: 'done'

`ApprovalModal` (`src/components/ApprovalModal.tsx`) renders the
required-approval payload (run id, tool, prompt, args JSON, optional
note) and posts the user's decision back to the gateway. Deny also
fires `stopRun` so the agent doesn't keep running.

## Phase 13 — Tool-event UI + active run tracking

- `MessageBubble` renders `message.toolEvents` as a wrap of tool
  chips: status dot (◔ running / ✓ done / ✕ error, colored
  green/red/blue), tool name in monospace, optional duration
  (`· 0.42s`), and a 2-line preview of the tool's input/result
- `activeRunIdRef` holds the live `run_id` from /v1/runs. `onStop`
  now POSTs `/v1/runs/{run_id}/stop` so the server-side agent also
  stops (otherwise the gateway would keep running it)
- The ref is cleared in `finally`

## Design principles in force

1. **UI never imports a concrete LLM client.** It uses
   `getLLMClient()` and the `LLMClient` interface. Mock and gateway
   are interchangeable.
2. **Two persistence stores, no third one.** Conversations in
   `useAppStore` (zustand), settings serialized via a subscriber
   that debounces writes to AsyncStorage. Re-hydration on app launch
   syncs the LLM client.
3. **Tsc is the source of truth.** Bundle is just the artifact. If
   tsc is clean, the rest follows.
4. **RN StyleSheet wants `absoluteFill`, not `absoluteFillObject`**.
   This bites once. Keep a mental note.
5. **`overflow: 'hidden'` is required to clip a rectangular `<Image>`
   to a circle.** The `borderRadius` on the parent View only
   rounds the parent's own background — the Image overflows.

## Endpoint summary

| Preset            | URL                                      | Model | Auth | Notes                                |
|-------------------|------------------------------------------|-------|------|--------------------------------------|
| mock              | (none)                                   | mock  | none | Offline fake responses                |
| hermes-gateway    | http://127.0.0.1:8642/v1/chat/completions| default | optional API_SERVER_KEY | Full session / runs / approval |
| openai-compatible | (user provided)                          | user  | bearer| Any LiteLLM / Open WebUI / Together |
| ollama            | http://127.0.0.1:11434/v1/chat/completions| user  | none  | Ollama local                         |

## Files of interest

- `src/services/llm/` — the LLM client abstraction, gateway
  implementation, runs-mode protocol
- `src/services/llm/hermes-client.ts` — OpenAI Chat Completions streaming
- `src/services/llm/runs-client.ts` — Hermes /v1/runs protocol
- `src/services/llm/config.ts` — 4 endpoint presets
- `src/store/app.ts` — conversations, prompts, settings (zustand)
- `src/store/persistence.ts` — debounced AsyncStorage round-trip
- `src/components/ApprovalModal.tsx` — agent approval UI
- `src/components/chat/MessageBubble.tsx` — bubble + tool chip rendering
- `src/components/chat/EmptyState.tsx` — welcome hero
- `src/components/chat/ChatView.tsx` — main chat surface, runs-mode
  branching, approval plumbing
- `src/screens/MainScreen.tsx` — top-level layout, app bar, drawer,
  prompt sheet
- `src/theme/win95.ts` — flat design tokens (legacy filename kept for
  back-compat; this is the iMessage-style palette, not Win95)
