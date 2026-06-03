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

---

## Phase 14 — Bottom status bar with live provider state

The first time the app talks to a real LLM, the user has no
feedback loop. Was the request received? Is the API key wrong?
Is the gateway even up? Phase 14 adds a thin bar at the bottom
of the screen that always answers these questions, with a small
status dot (green/yellow/red) + a 1-line label. The visual
language: 12px caption, neutral background, accent border on
top — the bar is meant to be glanceable, not inspected.

This is the same status card pattern we still use in EmptyState
(Phase 53 / 60) and the system prompt (Phase 41). It's our
"trust surface" — wherever the user might wonder "is this
thing working", the status bar answers.

---

## Phase 15 — Quick value cuts

A round of subtraction: removed unused drawer pages, collapsed
nested menus, deleted experimental screens. The result is a
single-path UI: composer at the bottom, drawer for navigation,
settings as a sheet. Anywhere the user could "drill in 3 levels
to do one thing", they now do it in 1.

The principle (later made explicit in the 5-axis decomp):
**fewer screens, more actions per screen**. The empty state
should teach the product, not the navigation.

---

## Phase 16 — Auto-detect local LLM at first launch

When the user opens the app for the first time, we don't
require them to configure an endpoint. We probe a small set
of known local LLM addresses (localhost:11434 for Ollama,
localhost:1234 for LM Studio, etc.) and, if any responds,
silently set that as the default provider. The user can
override in Settings, but the override is sticky from then
on (auto-detect doesn't fight them).

The system prompt (added in Phase 41) later extends this
principle to runtime: Hermes picks the right tool without
the user telling it which to use. The product is **agent-
friendly** in the sense of "we do the obvious thing so the
user doesn't have to".

---

## Phase 17 — SparkleRing around EmptyState hero

Six ✦/✧ sparkles orbiting the EmptyState hero image, on a
slow 18s loop. Pure atmosphere. A small thing, but the
moment the user sees it, they know this is not a generic
chat app — it's a tool with personality. The kawaii-density
philosophy starts here.

The SparkleRing component lives in EmptyState.tsx and is
reused by the loading state (Phase 18+) and the long-idle
idle screen (Phase 25+).

---

## Phase 18 — Read-aloud (TTS) + regenerate slot in long-press menu

Long-pressing a message opens an iOS ActionSheet with 4
options: Copy, Share, Speak, (Regenerate for assistant
messages). Speak uses expo-speech on native and browser
speechSynthesis on web. Regenerate re-runs the same
request, useful when the first answer was off.

This was later moved to an inline button (Phase 67) once
real users asked for a faster path, but the iOS action
sheet stays for the less-common options (Copy, Share,
Regenerate, Sync from Hermes).

---

## Phase 19 — Mobile-first EmptyState as Hermes agent control panel

The EmptyState stops being a "no messages yet" placeholder
and becomes a **control surface** for the agent. Cards
for the most common agent operations: start a new task,
open the prompt navigator, attach a file, open settings.
The user opens the app and immediately has 4 affordances
to push the agent — not just an empty text box.

This is the prototype for Phase 60 #1 / 61 #2 where the
empty state becomes a real **CLI surface** (Jobs / Tool /
Activity / Last 5 cards, plus the `window.hermes.*` bus).

---

## Phase 20 — Hermes capabilities live discovery in Settings

The Settings panel used to list tools as a static dropdown.
Phase 20 replaces it with a live read-out: when the Hermes
gateway reports its current toolset (via /v1/capabilities
or similar), the Settings panel updates in real-time. The
user sees "your Hermes has 12 tools: shell, read_file,
web_search, …" without the app shipping a hardcoded list.

This is the first time a Hermes-server-side change
silently improved the client. Later (Phase 22+) the same
mechanism feeds the Hermes dashboard strip in the drawer
(Phase 34) and the composer hint (Phase 33).

---

## Phase 21 — GPT-Image-2 icons replace emoji composer buttons

The composer used to be 📎 🎙 ✨ emojis for attach / voice /
new. Phase 21 swaps them for hand-illustrated icons
generated via GPT-Image-2, in a consistent kawaii style.
The icons read as "this app is polished" at a glance — and
they scale to retina without the up-scaling artifacts that
emoji have at 3x.

This is also the moment the "kawaii concentration" became
a load-bearing design value rather than a happy accident.

---

## Phase 22 — HermesSessionsClient (list / get / create / fork)

A dedicated client for the Hermes session API: list all
sessions on the user's computer, get one with full message
history, create a new one, fork an existing session. The
client is read-only by default; mutations (create, fork)
require user approval (later enforced by ApprovalModal,
then by the risk grader in Phase 63).

The session model is the foundation of all the "pull from
your computer" UX in Phases 26-35.

---

## Phase 23 — 📱 mobile identifier in app bar + status bar

The app bar shows the current session id (last 6 chars) and
a small phone emoji. The status bar mirrors it. The user
can always tell which Hermes session on their computer
this phone is talking to. Long-press the app bar chip to
copy the full id (Phase 30 adds this).

This is the "phone-remote-to-desktop" surface becoming
literal: the user sees the session id on both ends.

---

## Phase 25 — Subtraction + Hermes-native deepening

A pause-to-subtract phase. Removed experimental features
that didn't pull weight (the prompt marketplace, the persona
picker, the theme builder). In their place, deepened
Hermes-native affordances: live snapshot in the status bar
(Phase 26), remote sessions in the drawer (Phase 27),
remote session import (Phase 28).

The lesson: it's easier to add 5 things than to remove
3. This phase is the cut that made the product feel like
it knew what it was.

---

## Phase 26 — Live Hermes snapshot in status bar

The status bar started showing live readouts from the
Hermes gateway: "12 sessions on your computer, last
activity 3 min ago". Polled every 30s. The user can see
the gateway working without opening any panel.

This snapshot is the data source for everything that
follows: Phase 27 (drawer), Phase 28 (import), Phase 29
(Settings card), Phase 33 (composer hint), Phase 34
(dashboard strip), Phase 35 (discoverability hint), and
the EmptyState quick actions in Phase 61 #2.

---

## Phase 27 — Mobile drawer shows remote Hermes sessions

The drawer used to only show local conversations. Phase 27
adds a "From your computer" section above the local list,
with the user's remote Hermes sessions. Tapping one
imports it (Phase 28). The user can scroll through their
whole history without leaving the phone.

---

## Phase 28 — Import remote Hermes session into the local list

Tapping a remote session in the drawer imports it: the
session is added to the local conversation list, its
messages are pulled (Phase 22 sessions client), and the
user can scroll back through the history. The imported
session is now usable as a normal local conversation
(you can send a follow-up; the message gets routed back
to the remote Hermes).

---

## Phase 29 — Hermes snapshot card in Settings (live read-out)

Settings used to be a flat list. Phase 29 adds a card at
the top: a live readout of the Hermes gateway's current
state — uptime, session count, toolset size, last
activity. The user can verify the gateway is alive and
what it's doing without leaving Settings.

---

## Phase 30 — App bar shows session id, long-press to copy

The session-id chip in the app bar (added in Phase 23)
becomes tappable: long-press copies the full id to
clipboard. Useful when the user wants to ssh into their
computer and find the same session in the desktop UI.

---

## Phase 31 — Live job controls — pause / resume / run from phone

A new sheet under the "Jobs" card in the drawer: pause,
resume, and "run now" buttons for any Hermes job. The
user can control their scheduled jobs from the phone —
e.g. "pause the morning digest while I'm on vacation,
resume Monday" — without opening the desktop client.

---

## Phase 32 — GPT-Image-2 remote-control hero illustration

The EmptyState hero illustration used to be a generic
"remote" metaphor. Phase 32 replaces it with a custom
GPT-Image-2 illustration of a girl at a desk with a phone
in her hand, looking up at the screen. The visual
narrative: phone-remote-to-desktop. Sets the tone for
the entire product.

---

## Phase 33 — Composer shows live routing hint

The composer hint ("Type a message...") gains a trailing
routing indicator: which provider the message will go to
("→ Hermes" or "→ Mock LLM"). The user knows where the
message is going before hitting send. Tapping the hint
opens a Settings sheet.

---

## Phase 34 — Hermes dashboard strip in the drawer

A horizontal scroll strip in the drawer showing the most
recent remote sessions as cards. Replaces the previous
vertical list. The user can scan 5-6 sessions at a glance.

---

## Phase 35 — Discoverability hint — "N conversations on your computer"

When the gateway has 1+ sessions, the EmptyState gains a
small hint: "50 conversations on your computer. Tap ☰ to
import one." New users learn the drawer has remote items
without having to explore.

---

## Phase 36 — Phone messages mirror into Hermes SessionDB

A new live event: when the user sends a message from
hermes-chat, the phone-side conversation mirror-syncs
into the remote Hermes SessionDB. The user can close
the phone, open the desktop client, and continue the
conversation from there. The phone is now a true
first-class Hermes client, not a parallel client.

---

## Phase 37 — Pull-to-merge from Hermes — 🔄 in the app bar

The app bar gets a 🔄 button that pulls the latest
remote state into the local conversation. Useful when
the user has been editing on the desktop and wants the
phone to catch up. Pull-to-merge is non-destructive:
local edits take precedence; only messages missing
locally are pulled.

---

## Phase 38 — First-connect wow-moment + edge-swipe to open drawer

The first time the app connects to the user's Hermes
gateway, a brief "✨" overlay plays. Not too long (1.2s)
and not in the way (corner, not center). After that, the
user gets edge-swipe (from the left edge of the screen)
to open the drawer. Standard mobile pattern; works in
both iOS Safari and Android Chrome.

---

## Phase 39 — ThinkingMascot — kawaii avatar bobs while Hermes thinks

While the assistant is mid-stream, a small animated
mascot avatar (the same white-haired girl from the hero)
replaces the static assistant avatar in the message
list. The mascot bobs up and down on a 1.4s loop. Tells
the user "Hermes is working" without any text.

This is later replaced by the state-aware MascotAvatar
(Phase 69) that switches between 5 mascots (idle /
thinking / running / celebrate / confused) based on the
message state.

---

## Phase 40 — Long-press assistant message → '📡 Sync from Hermes'

iOS ActionSheet for assistant messages gets a new
option: "📡 Sync from Hermes". If the local conversation
has drifted from the remote (e.g. the user edited on
desktop and forgot to pull), this option re-fetches the
remote state and reconciles.

---

## Phase 41 — Hermes has a real system prompt

Before Phase 41, the assistant's "personality" was just
default model behavior. Phase 41 introduces an explicit
system prompt that's injected into every request: a
short, kawaii-flavored description of what Hermes is
(an agent that runs on the user's computer, that
phone-remote-to-desktop, that the user can audit).
This is the moment the assistant's voice became
consistent.

---

## Phase 42 — QuickReplies — one-tap follow-up chips under assistant reply

After every assistant message, 2-3 contextual chips
appear: "More detail", "Explain code", "Summarize".
Tapping one sends a pre-canned follow-up. Quicker than
typing for common actions. (Phase 68 removes the
generic "Continue" chip; the 3 context chips are
heuristic-driven and stay.)

---

## Phase 43 — RunHeader — agent-native run state above the message list

While the agent is running, a header above the message
list shows: "⚡ Hermes is running", a live timer
(0:42 → 0:43 → ...), and a Stop button. The user can
abort the run without scrolling to find a button. Lives
in ChatView as a sticky component.

---

## Phase 44 — Visual polish pass — image blending, focus glow, button spring

A wide-pass polish: image corners round correctly on
transparent backgrounds, focus rings appear on
keyboard / D-pad focus (a11y), buttons get a small
spring on press. No new features, just tightening.

---

## Phase 45 — Bubble depth — user gets pink drop shadow, assistant subtle gray

Visual hierarchy: user bubbles float (pink shadow),
assistant bubbles recede (subtle gray shadow). The
shadow language tells the user "this is you" vs
"this is the agent" without text.

---

## Phase 46 — Realign icons to their jobs

A small but useful cleanup: every tool button emoji
matches its actual job. 📎 for attach (was 🎙 in some
places), 🎙 for voice (was 📎), 📷 for camera (was
🖼). The mental model is now consistent.

---

## Phase 47 — Drawer New chat button = round 28px + accent, avatar sticker

Drawer header redesign: a round 28px "+" button (accent
color) for new chat, avatar sticker for the user
identifying the active session. Small, but the drawer
header now reads as a designed surface.

---

## Phase 48 — Typography scale cleanup — 8 tiers, no more ad-hoc fontSize

Before Phase 48, fontSize values were scattered
throughout the codebase (13, 14, 15, 16, 17, 18...).
Phase 48 introduces a strict 8-tier scale (caption / body /
title / hero / etc.) and replaces every ad-hoc value. The
result: consistent rhythm across all surfaces, easier to
add new screens, fewer bugs from off-by-one sizes.

---

## Phase 49 → 53 — Quick recap

- 49+50: `ToolBtn` and `QuickReplyChip` got a spring press + lift
  on tap, with a pink focus ring on keyboard / D-pad focus. The
  composer and the assistant-reply chips went from "you tapped
  something, the background flipped" to "you tapped something,
  it physically responds".
- 53: `isReachable()` used to fold 401/403/2xx into one boolean
  and call the result "online". After I stood up the Hermes
  gateway for real, the status bar lit up green but the first
  POST got rejected with an `Invalid API key`. The fix:
  `Reachability` (5 states) + `/v1/health` (0-cost probe) +
  SettingsPanel copy that says "required" instead of
  "optional". This is the moment the product stopped pretending
  to work.

## Phase 54+ — First-principles re-decomposition

After 53 the obvious bug was gone. The honest next step is to
stop iterating one feature at a time and ask: **is this the
right product?** That audit happened here.

### What this product is

Hermes Chat is the mobile client for a Hermes agent on the
user's computer. The phone is a control surface; the computer
is the agent's body. The user opens the app to ask the agent
something, monitor long-running work, approve tools, mirror
conversations back to the desktop's session DB, or just nudge
the agent when they're away from the desk.

The brief is "remote control the agent", not "build a chatbot".
That's a different product and the code should reflect it.

### What the code is doing instead

The chat surface is the heaviest thing in the app. 7,154
lines total; ChatView alone is 868; MessageBubble is 535;
MainScreen is 737. The chat is good. The agent is a guest.

Concrete shape of the drift:

- `RunHeader` (Phase 43) and `ApprovalModal` (Phase 12) exist,
  but the user can only see them while a run is *streaming in
  this conversation*. If the agent is running on the desktop
  while the phone is closed, the phone has no idea. There's
  no inbox of pending approvals, no live "your agent is doing
  X" strip on the home screen, no notification when the run
  finishes.
- The `HermesJobsClient` (Phase 22) is fully wired at the
  wire layer, but the only consumer is the SettingsPanel's
  "Hermes snapshot" card. There is no first-class jobs view
  on the home screen. The mobile use case this was *designed
  for* — "I'm on the bus, I want to pause the job I started
  this morning" — is one tap too many.
- The `HermesSessionsClient` is wired and Phase 28-37
  imported remote sessions into the local conversation list.
  But the import is one-shot and the local conversation
  diverges from the desktop session the moment the phone
  sends a turn. There's no "this conversation is mirrored
  from <desktop session id>" badge, no pull-to-refresh
  history, no conflict UI when both sides edit.
- `Auto-detect` is great for first launch. After that the
  user has no surface for **changing** the endpoint — they
  have to scroll to Settings → tap the gear → scroll to
  Connection → retype. There's no "switch to the laptop in
  the other room" flow.
- The whole client assumes the Hermes gateway is on
  `127.0.0.1:8642`. The only way to talk to a different
  machine is to retype the URL. There's no discovery
  protocol, no `mDNS`, no QR code to scan, no
  Tailscale/magicDNS hint, nothing.

### Engineering-axis diagnosis (the 5 lenses)

**1. Engineering — what breaks if a senior engineer reads the
codebase cold**

- `headers()` + `base()` is duplicated in 5 client classes.
  `HermesGatewayClient`, `HermesRunsClient`,
  `HermesSessionsClient`, `HermesJobsClient`, and the
  module-level `discovery.ts` all hand-roll the same
  `endpoint.replace(/\/chat\/completions\/?$/, '')` and the
  same `if (apiKey) h.Authorization = ...` pattern. A new
  endpoint is a copy-paste job; a fix to how the gateway
  base URL is computed is a 5-file search.
- `MockLLMClient` and `HermesGatewayClient` are
  interchangeable through the `LLMClient` interface, but the
  rest of the app (`MainScreen`, `SettingsPanel`, the
  `useHermesSnapshot` background poll) reaches past the
  interface and grabs a concrete `HermesGatewayClient` to
  call `sessions.list()` / `jobs.list()` on. That couples
  the UI to the Hermes implementation. A non-Hermes
  provider (any future "openai-compatible" preset that
  doesn't speak `/api/sessions`) would be silently broken.
- `MockLLMClient.craftMock()` is 60 lines of hardcoded
  if-chains pretending to be a chatbot. It still ships
  because it's the offline fallback. That's a tax for
  something nobody asked for; if you turn on Hermes,
  mock never runs. The mock either gets deleted or becomes
  a *real* offline answer (a local heuristic, the
  conversation's last assistant message, "I'm offline",
  etc.) instead of a parrot.
- `ChatView.tsx` line 282–460: one function that does
  run-mode start, run-mode event subscription, fallback to
  chat-completions, stream throttling, abort orchestration,
  error display, final-message reconcile, and haptic
  feedback. ~180 lines, five concerns, one big try/catch.
  This is the place that produced the Phase 53 "Network
  error" stream — a class of bug that's easy to introduce
  and hard to localize when it lands inside a 200-line
  try block.
- `useHermesSnapshot.ts` runs a 30s background poll. It
  re-fetches 4 endpoints every 30s forever. There's no
  exponential backoff on a 5xx storm, no fan-in to a
  single GET, no etag. Hermes's own gateway can go down
  for 20 minutes and the client will burn 40 requests.
- `__pycache__` style cruft: there are unused exports
  (`HermesRunEventCallback`, `RunStreamCallbacks.onStopped`
  is never observed in ChatView), TypeScript types that
  describe things the runtime never produces, and the
  `MockLLMClient` and the wire-level `mock-llm.ts` (which
  is referenced by `auto-detect.ts`'s tests but no longer
  wired) coexist.
- **No tests at all.** 7,154 lines, 0 tests. Phase 53 was
  a P0 bug that the type checker did not catch. The next
  bug in the same shape will also slip through.
- The CORS-required-to-use-the-app-on-web surprise that
  bit Phase 53 is a configuration bug *in the gateway*,
  not the client. The right place to fix it is for the
  client to ship a list of "if you point me at a local
  gateway, here are the CORS origins you need to allow" so
  the gateway and the client agree at first connect.

**2. Design — what a designer would draw on the whiteboard**

- **The agent isn't visible.** The hero is the composer
  (EmptyState has Voice / Photo / New chat / Recent). The
  agent is "the thing on the other end that responds". In
  an Agentic app the agent is the *primary character*.
  The status of the agent — what it's working on right now,
  what's queued, what just finished — should be the first
  thing the user sees when they open the app, not the
  composer.
- **The drawer is conversation-only.** It's a list of
  chats. In an Agentic app the drawer should have three
  sections: Conversations, Agent (live runs + jobs +
  pending approvals), Tools (skills / toolsets the user
  has approved for this session). The third is in
  Settings, the second doesn't exist.
- **No "is the agent busy?" affordance on the home
  surface.** RunHeader is great while a run is in *this
  chat*, but if the user opens the app fresh there's no
  persistent strip saying "Hermes is running: 2 jobs in
  queue, 1 needs your approval". A small footer or a
  pulsing avatar on the EmptyState hero would carry
  this.
- **The "agent says X while you're not looking"
  notification is missing.** The iMessage product lives
  in a notification. The agent's product does too. When
  the desktop agent finishes a long job, the phone should
  buzz. Today the user only finds out by reopening the app.
- **System prompt is a free-text field in Settings.** A
  user who wants to set "reply in Chinese unless I write
  in English" has to type the whole rule. There should be
  persona chips: Concise / Kawaii / Teacher / Catgirl /
  Pirate, with the actual system prompt as a "Customize…"
  expansion. The hermes config has 8 personalities baked
  in; the client ignores them.
- **Sakura and accents are surface.** Three accent
  colors and a falling-petal animation is kawaii flavor
  but not personality. The user's "this is my Hermes"
  memory will form around the *behavior* of the agent
  more than the *skin* of the app. Investing more in
  agent-character is higher-leverage than more polish
  on petals.
- **The mascot images are still placeholder.** Phase 32
  generated five mascot PNGs via GPT-Image-2, then
  GitImage-2 started 401-ing and the rest fell back to
  emoji + CSS. The five `mascot-*.png` files in
  `assets/illustrations/` are leftovers; some are used,
  some aren't. A "the agent has a face" pass would
  unify: thinking / running / paused / celebrating /
  confused / sleeping, used everywhere a status needs a
  glyph.

**3. Interaction — what users would say after a week of use**

- **"I sent it a thing, I closed the app, I have no idea
  what happened."** Today's answer: open the conversation,
  look for the latest message, scroll past all the "I
  started a tool" events. There's no notification, no
  unread badge, no "completed while you were away" banner.
- **"I want to start a thing, then put my phone down and
  just be told when it's done."** Today: the user has to
  stay on the chat screen for the RunHeader / streaming
  to be visible. If they background the app, the run
  keeps going on the desktop, but they don't get a
  notification. Background-fetch + local-notification on
  `completed` / `failed` is a one-evening build.
- **"I keep typing the same prompts."** There's a
  PromptNavigator with 5 seed prompts and a "favorites"
  pin. But the *recurring* prompts a user types aren't
  surfaced. A simple "you've sent 'summarize this' 7
  times — save it as a prompt?" nudge would compound.
- **"I want to edit what I sent."** MessageBubble has a
  long-press menu (Copy, Share, Read aloud, Regenerate,
  Sync from Hermes) but no Edit. Editing your own
  message and re-sending is the single most useful
  interaction in any chat app and it's missing.
- **"I want to undo the last thing the agent did."** No
  undo for tool calls. The approval modal approves
  forward; there's no "approve but I can take it back in
  the next 5 seconds". A 5-second "undo last tool" toast
  would let users take chances they otherwise wouldn't.
- **"Where are my files?"** Attachments are stored on the
  message. There's no global "files sent this session"
  view, no way to download what the agent produced. The
  agent often produces *output* (a report, a screenshot,
  code) and the user has no inbox for it.
- **"Switching between the laptop and the phone is
  confusing."** The phone and the desktop both have a
  "conversations" list. They're the same list (via
  SessionDB mirror) but the user has no signal that
  they're synchronized. A "live mirror from laptop"
  badge on the home screen would make it obvious.

**4. Product — what would a PM write in the spec**

- **The product's name and shape are clear: phone = remote
  control, computer = body.** Everything in this list
  serves that. The drift toward "chat app" is the only
  thing that doesn't.
- **North-star metric should not be "messages sent".** It
  should be "remote actions completed per session" or
  "tools approved from the phone". A user who only ever
  reads what the agent has done and never sends a message
  is the most engaged user — and the product has no way
  to see them.
- **Activation gap.** New user lands on EmptyState. There's
  no "first remote control" moment. The seed prompt in
  EmptyState is "Drive your agent from your pocket" but
  the first interaction is *typing* — not *remote-
  controlling*. A "Try a quick action: pause a job /
  approve a tool / start a run" CTAs would teach the
  mental model.
- **The 4-endpoint-preset Settings panel makes the user
  think they have a choice.** They don't (provider is
  `hermes-gateway`, locked). Surfacing four options that
  are actually one option is dark-pattern-adjacent and
  wastes a Settings screen.
- **No way to invite.** A second device — a tablet, the
  partner's phone — can't pair with the same Hermes.
  There's no QR-code-pairing, no "send pairing link to
  Telegram", nothing. A "scan to pair" entry point would
  make the multi-device story real.
- **The Hermes gateway is the user's local agent. The
  product should make that obvious.** The composer hint
  says "→ Hermes · a3x0e4" but a first-time user doesn't
  know what a Hermes is or where it lives. The empty
  state hero should have a single line of plain prose:
  "Hermes is the agent on your computer. You're driving
  it from your phone."

**5. Agentic-native — what an Agentic OS would do that
this app doesn't**

- **The phone should be a peer in the agent's tool list.**
  Hermes on the computer doesn't know "the user is
  holding their phone" or "the phone has a push
  notification channel". A `phone_notifier` tool that
  Hermes can call to ping the user with structured data
  (a long press, a yes/no, a "look at this image") would
  make the phone a first-class tool, not just a chat
  client.
- **Approvals should be expressive, not binary.** Today
  the approval modal shows the tool name and the args and
  Approve / Deny. An Agentic OS would let the user
  *modify* the args before approving ("approve but cap
  the spend at $5", "approve but skip the email step").
  That's the difference between babysitting and driving.
- **Runs should be inspectable mid-flight.** RunHeader
  shows "running · 0:13". It doesn't show *which tool is
  currently running* or *what its input is*. The wire
  already carries `tool.started` and `tool.completed`
  events; the UI just shows a generic "working" strip.
  The agent's tool-call budget, the file the agent is
  reading, the URL it's fetching — these are *the story*
  and the user is missing it.
- **The agent's long-term memory should be visible.**
  `X-Hermes-Session-Key` is set in Settings as a free-text
  field. A "what does Hermes remember about me?" surface
  would turn that into a feature. The user can't tell
  what scope the key covers, can't audit it, can't
  forget it.
- **Cron jobs and skills are first-class on the
  computer, invisible on the phone.** Phase 31 added
  pause/resume/run on jobs, but the phone has no view of
  *what* a job does or *what its schedule is*. A
  job-detail card would let the user trust the agent
  with cron work.
- **The protocol the gateway speaks is rich; the client
  uses ~30% of it.** 8 SSE event types. The chat view
  handles delta, started, completed, approval, completed,
  failed, stopped, reasoning.available. The user never
  sees *which tool the agent picked*, the *cost* of a
  call, the *latency*, the *cache hit*. A debug surface
  (Phase 22 had a glimpse of it) would be a power-user
  feature, not just a developer one.
- **The chat is the lowest-bandwidth channel.** An
  Agentic-native client would default to richer
  interactions: a run with structured approvals, a
  dashboard, a card view, a Markdown-with-tool-results
  hybrid. The chat is for when the user *wants* to be
  in prose. The product should make chat the *opt-in*
  channel, not the *default*.

### What to actually do, ranked

1. **P0: Fix the run-mode stream that's broken today.**
   `startRun` 202 OK, then `subscribeEvents` fails, then
   `client.streamChat` fails with `Failed to fetch`. This
   blocks every conversation in the product. Until this
   is resolved, no further feature work is real.
2. **P0: Notification + inbox for "agent finished a
   run / needs your approval while you were away".**
   This is the single biggest gap between "chat app" and
   "remote control". A foreground service on Android,
   background-fetch on iOS, plus a small "Agent" tab that
   shows the live state.
3. **P0: Mid-run inspector.** Show *which tool is running,
   its args, its cost* in RunHeader. The data is in the
   SSE stream; the UI just isn't using it.
4. **P1: Edit own message + re-send.** A 1-day build,
   immediately raises the daily-active ceiling.
5. **P1: Persona chips in Settings.** The 8 personalities
   in `~/.hermes/config.yaml` are server-side; the client
   should surface them as chips and ship a system-prompt
   template per persona.
6. **P1: Agent tab in the drawer.** Three sections:
   Conversations / Agent (live state + jobs + approvals)
   / Prompts.
7. **P1: Unified the `headers()` / `base()` boilerplate
   into a single `HermesClient` base class.** 5 files
   become 1 base + 5 thin wrappers. The cost of adding
   the next Hermes endpoint drops to a 30-line file.
8. **P1: Cancel + refactor `ChatView.send` into a small
   `useRunStream` hook.** The 200-line try block is
   where bugs go to hide.
9. **P2: Test scaffold.** Even 5 smoke tests on
   `isReachable`, `parseEvent`, `throttle`, the
   persistence debounce, and the chat-completions
   request shape would catch the next 401-is-online-style
   regression.
10. **P2: Pre-flight CORS / auth hint.** When the user
    points the client at a new gateway, the first
    response from the gateway should come with the CORS
    and auth state baked in (the gateway already sends
    `WWW-Authenticate` and `Access-Control-Allow-Origin`).
    The settings panel should react to a 401 with a
    one-tap "paste key" prefill.
11. **P2: Undo last tool approval** as a 5-second toast.
12. **P2: Recurring-prompt nudge.** "You've sent this 3
    times — save it as a prompt?" — invisible until
    useful, free once written.
13. **P2: Files inbox** — a "files sent/received this
    session" view, an obvious gap.
14. **P2: 5-second onboarding**: an empty-state hero
    that says "Hermes is the agent on your computer.
    Try a quick action to drive it from your phone" with
    three real actions, not the four paragraph hero we
    have today.
15. **P3: QR-code pairing for additional devices.** Once
    the agent can be controlled from N phones, the
    product changes shape.

### What this list is not

- It's not a "do all 15". It's a ranked backlog; the
  caller picks. Phase 54 will be #1. 55 will be the
  next thing in this list that I can ship in one phase
  without disturbing the rest. Some of these (#5, #7,
  #8) are independent and can be parallelized; #1 and
  #3 are sequential because #1's bug surface touches
  the same files as #3.
- It's not a "v2 is a rewrite". Almost every item on
  this list is a 50-200 line PR. The product is healthy;
  the gaps are additive.
- It's not a TODO that the user has to read. This file
  exists for two reasons: (a) so a future agent reading
  PHASES.md understands the design rationale, and (b)
  so the user can scan "What to actually do, ranked" and
  re-rank. If the user reads this and re-orders, that's
  the design loop working.
