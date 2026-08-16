# `/live` — security notes and threat model

## What we are protecting

A webcam pointed at the owner's room, and private messages between two people.
The worst outcomes are: a stranger watching the camera, a stranger speaking
through the owner's speakers, and the stream or chat being recorded anywhere.

## Trust boundaries

```
her browser ──HTTPS──► Cloudflare Access ──► Worker (/live) ──► LiveRoom (Durable Object)
     │                                                                    ▲
     └──────────────── WebRTC media, encrypted, peer-to-peer ─────────────┘
                       (never through the Worker)
```

- **Cloudflare Access** is the front door. One email is allowed, by exact match.
- **The Worker** re-verifies every Access JWT itself — signature against the team
  JWKS, `iss`, `aud`, `exp`/`nbf`, `alg` pinned to RS256, then an exact identity
  comparison. A valid token for a different person is rejected.
- **The Durable Object** never authenticates anyone. Roles are assigned by
  `src/routes/live/ws/+server.ts` _before_ the socket exists, so a client can
  never claim to be the broadcaster.
- **Media** is WebRTC (DTLS-SRTP) between the two browsers. The server sees SDP
  and ICE candidates, never a video frame.

## Controls in place

| Requirement                                            | Where                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Deny by default; unconfigured = closed                 | `src/lib/server/live/access.ts`, returns 503 when Access isn't configured                                           |
| Exact viewer identity only                             | `authorizeViewer()` — no wildcards, no domain rules                                                                 |
| Access JWT fully verified                              | `verifySignature()` + issuer/audience/expiry checks                                                                 |
| Broadcaster secret never in the bundle                 | Entered by hand, sent as a WebSocket subprotocol (`bt.<token>`), compared server-side in constant time              |
| WebSocket authorized before any app message            | `/live/ws` rejects with 401/403 before reaching the room                                                            |
| Every message schema-validated, unknown types rejected | `clientMessageSchema` (Zod) in `src/lib/live/protocol.ts`                                                           |
| Chat length + rate limits enforced server-side         | `LiveRoom.handleChat()` — 300 chars, 1/s, 5 per 10s                                                                 |
| Chat treated as plain text                             | Control characters, bidi overrides and line separators stripped; rendered via Svelte interpolation, never `{@html}` |
| No SSML / command injection into TTS                   | The TTS adapter is handed a plain string; nothing is parsed                                                         |
| One viewer only                                        | Second viewer refused with close code 4001                                                                          |
| No recording, no chat persistence                      | Nothing is written to storage; history lives in the page and disappears                                             |
| Security headers                                       | `src/hooks.server.ts`, scoped to `/live`                                                                            |
| Secrets never committed                                | `.dev.vars` and `.env*` are gitignored; `.env.example` holds placeholders only                                      |
| Logs carry no secrets                                  | Only roles, states and failure reasons are logged; never tokens, JWTs or chat text                                  |

## Known deviations and accepted risks

1. **The broadcaster page is served over the public hostname.** Workers have no
   loopback to bind to. Mitigations: Cloudflare Access still gates the page, the
   page contains no secret, and every privileged action requires the broadcaster
   token, which is verified server-side. If the token leaks, an attacker could
   publish video _to_ the viewer — rotate it with `wrangler secret put BROADCASTER_TOKEN`.

2. **`script-src` includes `'unsafe-inline'`.** SvelteKit emits inline hydration
   data without a nonce. Everything else in the CSP is locked down
   (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`).
   Tightening this means enabling SvelteKit's `csp` config app-wide.

3. **Fonts load from Google Fonts.** That leaks the fact of a visit to Google.
   Self-host the two `woff2` files under `static/` and drop the `<link>` in
   `src/routes/live/+layout.svelte` if that matters to you.

4. **Peer IP addresses are visible to each other** during a direct WebRTC
   connection — that is how peer-to-peer works. Set `FORCE_TURN=true` to relay
   everything instead.

5. **The dev bypass exists.** `LIVE_DEV_OPEN=true` skips Access, but only when the
   request host is `localhost`/`127.0.0.1`. On a real hostname it can never apply.

## Acceptance checklist

- [ ] Public domain uses HTTPS (Cloudflare default).
- [ ] Access application covers `your-domain.com/live` with no Bypass policy.
- [ ] Access policy lists exactly the intended addresses.
- [ ] `AUTHORIZED_VIEWER_EMAIL` matches her address exactly.
- [ ] `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set (otherwise `/live` is 503).
- [ ] `BROADCASTER_TOKEN` is a fresh 32-byte random value.
- [ ] `LIVE_DEV_OPEN` is unset or `false` in production.
- [ ] Incognito visit to `/live` never reaches the app.
- [ ] A non-authorized signed-in account is refused.
- [ ] TURN credentials are short-lived (Cloudflare Realtime or coturn REST).
- [ ] `git status` shows no `.dev.vars`, `.env`, or token in a tracked file.
