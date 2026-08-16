# `/live` — private retro webcam + chat room

A tiny, cute, private site for exactly one viewer. It lives at
`https://<your-domain>/live` inside this SvelteKit app and shares nothing with the
quiz UI — its own layout, its own retro theme, its own auth.

- **`/live`** — the viewer page (video + chat). Cloudflare Access protects it.
- **`/live/broadcast`** — the owner's dashboard (camera + TTS). Needs the broadcaster token.
- **`/live/ws`** — authenticated signaling socket.
- **`/live/api/ice`** — short-lived STUN/TURN credentials.

---

## 1. How this differs from the original spec

The spec assumed a Node server on `127.0.0.1:3000` published through a Cloudflare
Tunnel. This project deploys to **Cloudflare Workers**, so the shape is different
while the security properties are kept:

| Spec                                                      | Here                                                                                     | Why                                                                                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node + `ws` on localhost, published via `cloudflared`     | SvelteKit on Workers, WebSockets in a **Durable Object**                                 | Workers can't run a long-lived Node process; a Durable Object is the Workers-native way to hold two sockets in one room. No tunnel, no port forwarding, nothing listening at home. |
| Broadcaster page bound to `127.0.0.1:3001`                | `/live/broadcast`, gated by Cloudflare Access **and** a high-entropy `BROADCASTER_TOKEN` | Workers have no loopback interface to bind to. The page holds no secret and does nothing until the token is entered; the token is only ever verified server-side.                  |
| Separate `apps/viewer`, `apps/broadcaster`, `apps/server` | One SvelteKit route tree under `src/routes/live`                                         | Same isolation, far less to maintain.                                                                                                                                              |

Unchanged: video is **WebRTC only** and never passes through the server; chat is
plain text, rate-limited server-side; nothing is recorded or persisted.

---

## 2. What you need

1. A Cloudflare account with this Worker already deploying (you have this).
2. Your domain on Cloudflare with a route to this Worker.
3. Cloudflare Zero Trust (free tier is enough) for Access.

---

## 3. Configure Cloudflare Access (the front door)

Until this is done, `/live` returns **503 for everyone** — it fails closed on purpose.

1. Zero Trust dashboard → **Access → Applications → Add an application → Self-hosted**.
2. Application domain: `your-domain.com`, path `live`. This covers `/live/*`.
3. Session duration: **8 hours** (or less).
4. Policy → **Allow**, rule type **Emails**, value: her email address, exactly one.
   Add a second Allow rule with **your** email so you can open `/live/broadcast`.
   - Do **not** add a domain-wide rule, an "everyone" rule, or a Bypass rule.
5. Login method: **One-time PIN** (no extra setup) or Google/OIDC.
6. Open the application's **Overview** tab and copy the **Application Audience (AUD) tag**.
7. Your team domain is in Zero Trust → Settings → Custom Pages, and looks like
   `yourteam.cloudflareaccess.com`.

The backend independently verifies every Access JWT (signature, issuer, audience,
expiry, identity) — the edge is the gate, not the proof.

---

## 4. Set the secrets

Generate a broadcaster token:

```bash
openssl rand -base64 32
```

Set them on the deployed Worker:

```bash
wrangler secret put CF_ACCESS_TEAM_DOMAIN     # yourteam.cloudflareaccess.com
wrangler secret put CF_ACCESS_AUD             # the AUD tag from step 3.6
wrangler secret put AUTHORIZED_VIEWER_EMAIL   # her email, exactly
wrangler secret put BROADCASTER_TOKEN         # the value you just generated
wrangler secret put LIVE_TITLE                # optional, e.g. "our little window"
```

For local development the same keys live in `.dev.vars` (gitignored). See
`.env.example` for the full list with comments.

---

## 5. TURN (needed for cellular / strict networks)

STUN alone connects most home networks. When she's on mobile data you'll usually
need TURN. Pick one:

**Cloudflare Realtime TURN** (easiest — no VPS, short-lived credentials):

```bash
wrangler secret put CF_TURN_KEY_ID
wrangler secret put CF_TURN_API_TOKEN
```

**Self-hosted coturn** with `use-auth-secret` (also short-lived credentials):

```bash
wrangler secret put TURN_URL      # turn:turn.example.com:3478
wrangler secret put TURN_SECRET   # matches coturn's static-auth-secret
```

**Static credentials** (least preferred, long-lived): `TURN_URL`, `TURN_USERNAME`,
`TURN_CREDENTIAL`.

Set `FORCE_TURN=true` if you'd rather relay all media than expose peer IP
addresses to each other. It is ignored unless a TURN server is actually configured.

---

## 6. Deploy

```bash
yarn build      # also re-exports the LiveRoom durable object into the worker
wrangler deploy
```

The first deploy creates the `LiveRoom` Durable Object (migration `v1` in
`wrangler.jsonc`). Nothing else changes about the quiz app.

---

## 7. Using it

1. You open `https://your-domain.com/live/broadcast`, sign in through Access,
   paste the broadcaster token, and click **start camera**.
   The token is kept in `sessionStorage` — it disappears when you close the tab.
2. She opens `https://your-domain.com/live`, gets a one-time PIN by email, and
   lands on the room.
3. Video connects peer-to-peer. She types; your computer speaks it out loud.

Microphone is **off by default** — tick "send microphone too" if you want audio.

---

## 8. Local development

`vite dev` has no Durable Objects, so the socket only works under Wrangler:

```bash
yarn dev:live      # builds, then runs wrangler dev on http://localhost:4173
```

`.dev.vars` ships with `LIVE_DEV_OPEN=true`, which skips Cloudflare Access. That
bypass **only** works when the request host is `localhost`/`127.0.0.1`, so it can
never take effect on the deployed Worker even if the variable leaks into
production. Set it to `false` once Access is configured.

`yarn dev` still works for styling the pages; the socket will just sit in
"reconnecting..." .

---

## 9. Checks worth running

```bash
yarn run check     # types
yarn lint          # formatting
yarn build         # production build
```

Manual passes:

- Open `/live` in an incognito window → Cloudflare's login screen, never the app.
- Sign in with a non-authorized Google account → "this room is not for you".
- Open `/live` in two tabs → the second one says the room is already open.
- Paste a wrong broadcaster token → "That token was not accepted."
- Send `<script>alert(1)</script>` in chat → it appears as literal text and is
  spoken as literal text.
- Send 6 messages fast → the last ones are refused by the server.
- Test from cellular data — that's the case that needs TURN.
