# hermes-chat

A kawaii mobile chat client (Android / iOS / Web) for the local **Hermes**
LLM gateway. The client is a React Native app built with Expo SDK 56.

This is a **monorepo** with two main parts:

- `src/` — the React Native client
- `server/` — a small FastAPI + SQLite backend that catalogs session
  metadata across devices

See:

- `docs/superpowers/specs/2026-06-08-hermes-session-sync-design.md` — backend design
- `server/README.md` — backend setup

## Connect to Hermes

The phone talks **directly** to Hermes. It does not go through the
backend (`server/`). The backend is only for "what sessions exist on
my Mac" cross-device awareness.

To connect the phone to Hermes, do **one of**:

1. **Same Wi-Fi (easiest)**: on the phone, open `hermes-chat` →
   ⚙ Settings → **Endpoint** → set to `http://<your-mac-lan-ip>:8642`.
   Find your Mac's IP via `ipconfig getifaddr en0` (Wi-Fi) or
   `ipconfig getifaddr en1` (Ethernet).
2. **Android emulator**: leave the default `http://10.0.2.2:8642`.
3. **iOS Simulator / Web**: leave the default `http://127.0.0.1:8642`.

### Tailscale / tunnel (cross-network)

If your Mac is at home and your phone is on cellular, run Tailscale on
both. Then point the phone's Endpoint at the Mac's Tailscale IP, e.g.
`http://100.x.y.z:8642`.

### Pair code (coming)

Phase 78b (in the Hermes gateway) will add a QR / 6-char code flow so
the phone learns the Mac's URL automatically. The backend is not
involved.
