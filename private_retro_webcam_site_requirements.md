# Private Retro Webcam + Chat/TTS Website — Product & Engineering Specification

## 1. Project Goal

Build a small, cute, retro-style private website intended for exactly one remote viewer.

The site should:

1. Display a live webcam stream from the owner's computer.
2. Let the authorized viewer send short text chat messages.
3. Deliver those messages to the owner's computer in real time.
4. Automatically read incoming messages aloud through text-to-speech (TTS) on the owner's computer.
5. Be reachable through a normal public HTTPS domain, but expose no application content to unauthorized visitors.
6. Keep the webcam itself and the owner's local machine off the public Internet as much as possible.
7. Be simple enough to self-host and maintain.

The authorized remote viewer is the owner's girlfriend. The owner/broadcaster is a separate trusted role and does not need a public broadcaster/admin page.

---

## 2. Recommended Architecture

Use this architecture unless there is a strong implementation reason not to:

```text
                         INTERNET
                            |
                   https://cute.example.com
                            |
                  +----------------------+
                  |   Cloudflare Access  |
                  | allow exact viewer   |
                  | email only           |
                  +----------+-----------+
                             |
                     Cloudflare Tunnel
                             |
                             v
Owner's computer    +----------------------+
                    | Public app backend   |
                    | 127.0.0.1:3000       |
                    |                      |
                    | - viewer webpage     |
                    | - WebSocket server   |
                    | - WebRTC signaling   |
                    | - chat relay         |
                    +----------+-----------+
                               |
                               | local connection
                               |
                    +----------v-----------+
                    | Broadcaster page     |
                    | 127.0.0.1:3001       |
                    | LOCAL ONLY           |
                    |                      |
                    | - captures webcam    |
                    | - creates WebRTC     |
                    | - receives chat      |
                    | - plays TTS          |
                    +----------+-----------+
                               |
                         webcam + speakers


Remote viewer <==============================> Broadcaster
                       WebRTC media
                   (P2P when possible)

              TURN relay used when P2P fails
```

### Important architecture rule

The public-facing website must never directly expose:

- the webcam device,
- a camera HTTP stream,
- RTSP,
- the local broadcaster/admin page,
- SSH,
- the owner's router,
- or an application port opened through router port forwarding.

The public application should be published through an outbound Cloudflare Tunnel.

---

## 3. Authentication and Authorization

### Required approach

Protect the entire public hostname with **Cloudflare Access**.

Example:

```text
cute.example.com/*
```

Use an Access policy that allows exactly one remote viewer identity:

```text
viewer_email@example.com
```

The application must be deny-by-default.

### Preferred login method

For the first version, use either:

1. Cloudflare Access email One-Time PIN restricted to the exact viewer email, or
2. Google/OIDC login restricted to the exact viewer email.

Do not allow arbitrary email addresses.

Do not create a public sign-up flow.

Do not create user registration.

Do not expose a generic password form as the primary security layer.

### Session requirements

Recommended:

```text
Access session lifetime: 8 hours
```

A shorter lifetime is acceptable.

### Application-side identity verification

Do not rely only on the frontend knowing that Cloudflare authenticated the user.

For public requests reaching the application:

- verify the Cloudflare Access JWT,
- validate signature,
- validate issuer,
- validate audience,
- validate expiry,
- obtain the authenticated email/identity,
- reject any identity other than the configured viewer identity.

Expected Cloudflare header:

```text
Cf-Access-Jwt-Assertion
```

The backend should reject requests that should be authenticated if the assertion is absent or invalid.

### Local broadcaster authentication

The broadcaster interface must NOT be exposed through the public hostname.

Run it separately on:

```text
127.0.0.1:3001
```

It should bind only to loopback.

For additional defense, use a randomly generated broadcaster secret when the local broadcaster client connects to the signaling backend.

Never put this secret in frontend code delivered to the remote viewer.

---

## 4. Why Not SSH Keys?

Do not use SSH public/private keys as the girlfriend's website login mechanism.

SSH keys are appropriate for:

- administrator shell access,
- Git,
- server-to-server authentication,
- deployment.

They are not a normal browser authentication mechanism.

The owner may use SSH keys for administering a VPS or TURN server, but SSH must not be the viewer authentication system.

---

## 5. Passwords

Do not build a custom username/password authentication database for the MVP.

Reasons:

- password hashing must be implemented correctly,
- sessions must be implemented correctly,
- brute-force protection is needed,
- password resets introduce additional attack surface,
- credential storage becomes the application's responsibility.

If application-level authentication is ever added later, use a well-maintained authentication library and Argon2id/bcrypt/scrypt rather than storing plain-text or reversibly encrypted passwords.

The edge identity provider should remain the primary gate.

---

## 6. Networking / Hosting

### Domain

Use a custom domain such as:

```text
cute.example.com
```

### Origin exposure

The backend should listen on localhost:

```text
127.0.0.1:3000
```

Publish it with `cloudflared`.

Do not configure router port forwarding for the web application.

Do not expose port 3000 directly to the Internet.

### HTTPS

The remote viewer must use HTTPS.

All public application traffic must use TLS.

### Cloudflare Tunnel

`cloudflared` runs on the owner's machine and creates an outbound tunnel.

Conceptually:

```text
cute.example.com -> Cloudflare -> cloudflared -> http://127.0.0.1:3000
```

The tunnel is responsible for the web application and signaling traffic.

It is NOT the WebRTC media transport.

---

## 7. Live Webcam Streaming

### Required transport

Use **WebRTC** for the live video stream.

Do not continuously send JPEG frames through ordinary HTTP.

Do not use an unauthenticated MJPEG stream.

Do not expose RTSP publicly.

### Roles

There are two WebRTC roles:

```text
Broadcaster = owner
Viewer      = authorized girlfriend
```

Only one remote viewer should be supported for the MVP.

### Broadcaster

The local broadcaster page should:

1. Request webcam permission.
2. Display a local preview.
3. Create an `RTCPeerConnection`.
4. Add webcam video tracks to the connection.
5. Exchange SDP and ICE candidates through the signaling WebSocket.
6. Show connection state.
7. Provide Start Stream / Stop Stream controls.
8. Automatically clean up tracks when stopped.
9. Reconnect signaling if the network briefly disconnects.

Microphone streaming should be OFF by default unless explicitly enabled later.

### Viewer

The viewer page should:

1. Establish authenticated signaling.
2. Receive the WebRTC video stream.
3. Display the video prominently.
4. Show a friendly "camera is offline" state if no broadcaster is connected.
5. Recover automatically when the broadcaster reconnects.
6. Never receive permission to publish its own camera/microphone in the MVP.

### Signaling

Use WebSockets for:

- broadcaster presence,
- viewer presence,
- SDP offers,
- SDP answers,
- ICE candidates,
- chat messages,
- connection state events.

Suggested endpoint:

```text
wss://cute.example.com/ws
```

The public WebSocket upgrade must be authenticated.

### STUN/TURN

Configure ICE servers.

At minimum use STUN.

For reliable connections across restrictive NAT/firewall configurations, support TURN.

Preferred production configuration:

- self-host `coturn` on a small VPS, OR
- use a reputable managed TURN provider.

TURN credentials should not be permanent public credentials embedded in the JavaScript bundle.

Prefer short-lived TURN credentials when feasible.

### Privacy option

Provide a configuration option:

```text
FORCE_TURN=false
```

If `FORCE_TURN=true`, configure WebRTC to relay media through TURN instead of attempting direct peer-to-peer connectivity.

This can be used if hiding peer IP addresses becomes desirable.

---

## 8. Chat

### Viewer functionality

The viewer should have a chat panel next to or beneath the video.

Required behaviors:

- text input,
- Send button,
- Enter to send,
- Shift+Enter for newline if multiline is enabled,
- character counter,
- recent message display,
- sent timestamp,
- connection status.

### Message rules

Suggested MVP constraints:

```text
Maximum message length: 300 characters
Maximum send rate: 1 message / second
Burst limit: 5 messages / 10 seconds
Maximum queued TTS messages: 20
```

Only plain text is allowed.

Never render submitted chat text as raw HTML.

Escape/sanitize content before rendering.

No Markdown rendering is required for messages.

No images, files, arbitrary URLs, HTML, JavaScript, or attachments are required for the MVP.

### Persistence

Default:

```text
CHAT_PERSISTENCE=false
```

Chat history should live only in memory and disappear after the server restarts.

If persistence is later enabled, use SQLite and add explicit data-retention controls.

---

## 9. Text-to-Speech

### Behavior

When the authenticated viewer submits a message:

```text
viewer
   -> authenticated WebSocket
   -> backend
   -> local broadcaster WebSocket
   -> TTS queue
   -> owner's speakers
```

The remote viewer should NOT directly control arbitrary commands on the owner's computer.

Only the text message should be transmitted.

### MVP TTS engine

Use the browser's Web Speech API on the local broadcaster page:

```javascript
window.speechSynthesis
SpeechSynthesisUtterance
```

This avoids needing an external TTS API for the first version.

### TTS settings

Provide local broadcaster settings for:

- voice,
- rate,
- pitch,
- volume,
- enable/disable TTS.

Suggested defaults:

```text
rate   = 1.0
pitch  = 1.05
volume = 1.0
```

Settings can be stored locally in `localStorage`.

### TTS queue

Messages should be spoken sequentially.

Required controls:

- Pause TTS
- Resume TTS
- Skip current message
- Clear queue
- Mute TTS

Do not permit a remote message to inject SSML or executable content.

Treat all message input as plain text.

### Future optional TTS adapter

Structure TTS behind a simple interface so a later version can replace browser speech synthesis with:

- local Piper-style neural TTS,
- ElevenLabs,
- OpenAI TTS,
- another provider.

The MVP should not require a paid TTS provider.

---

## 10. Retro / Cute Visual Design

### Overall direction

The site should look like a cute personal webpage from the late 1990s / early 2000s while still feeling polished.

Desired qualities:

- warm,
- playful,
- romantic,
- intentionally retro,
- pixel-inspired,
- small personal-web feeling rather than corporate SaaS.

### Suggested visual language

Use:

- pixel/bitmap-style heading font,
- rounded retro window panels,
- faux CRT/status indicators,
- pastel pink/lavender/cream palette,
- tiny pixel hearts/stars,
- animated status light,
- beveled buttons,
- small decorative stickers,
- subtle dithering/noise texture,
- pixel borders,
- retro desktop/window chrome.

Avoid:

- excessive flashing,
- hard-to-read low contrast,
- huge animation libraries,
- autoplay background music,
- overwhelming GIF clutter.

### Suggested layout

Desktop:

```text
+------------------------------------------------------+
| cute.example.com                       ♥ connected   |
+------------------------------------------------------+
|                                                      |
|   +------------------------------+  +--------------+ |
|   |                              |  |              | |
|   |         LIVE VIDEO           |  |    CHAT      | |
|   |                              |  |              | |
|   |                              |  | messages...  | |
|   +------------------------------+  |              | |
|                                    | [message...] | |
|   ♥ little status / cute text      |    [SEND]    | |
|                                    +--------------+ |
|                                                      |
+------------------------------------------------------+
```

Mobile:

- video first,
- chat beneath,
- input pinned near bottom when practical,
- maintain usable controls at narrow widths.

### Offline state

When the camera is offline, replace the video with a cute intentional state, for example:

```text
♡ camera is sleeping...
```

Do not show a broken `<video>` element.

---

## 11. Functional Requirements

### FR-01 — Authentication

An unauthenticated visitor requesting any public application path must not receive the actual application.

### FR-02 — Exact viewer authorization

Only the configured viewer identity may access the remote application.

### FR-03 — No registration

There must be no public account creation flow.

### FR-04 — Local broadcaster isolation

The broadcaster UI must only listen on loopback and must not be reachable through the public hostname.

### FR-05 — Webcam capture

The owner can choose a webcam and start/stop broadcasting.

### FR-06 — One viewer

The system supports exactly one active authorized viewer for the MVP.

If multiple browser tabs connect, the application may either:

- allow the same authenticated identity in multiple tabs, or
- reject additional viewer sessions.

Preferred behavior: reject a second active viewer session with a friendly message.

### FR-07 — WebRTC

Video must use WebRTC.

### FR-08 — Reconnection

Temporary signaling loss should not require restarting the entire application manually.

### FR-09 — Chat

The authorized viewer can send short plain-text messages in real time.

### FR-10 — TTS

Messages are automatically queued and spoken on the broadcaster computer.

### FR-11 — TTS control

The broadcaster can mute, skip, pause, resume, and clear speech.

### FR-12 — Offline status

Viewer can clearly tell whether the broadcaster is online.

### FR-13 — No public archive

The stream is not recorded by default.

### FR-14 — No public chat logs

Chat is not persisted by default.

### FR-15 — Responsive UI

Viewer UI works on both desktop and mobile browsers.

---

## 12. Security Requirements

### SR-01

Cloudflare Access protects the full public hostname.

### SR-02

Authorization rule matches an exact configured viewer identity.

### SR-03

Backend validates the Access JWT for authenticated public traffic.

### SR-04

Origin application is not directly Internet-accessible.

### SR-05

No router port forwarding for the app backend.

### SR-06

Broadcaster interface binds to `127.0.0.1` only.

### SR-07

No secrets are committed to Git.

### SR-08

Secrets are loaded from environment variables.

### SR-09

Chat content is treated as untrusted plain text.

### SR-10

Set a strict Content Security Policy where practical.

### SR-11

Set security headers:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(self)
```

Adjust the camera policy so only the local broadcaster context can request camera access.

### SR-12

Do not use `dangerouslySetInnerHTML` for viewer messages.

### SR-13

Apply server-side message length and rate limits.

Frontend-only limits are insufficient.

### SR-14

WebSocket sessions must be authorized before accepting application messages.

### SR-15

Validate every WebSocket message against a schema.

Recommended: Zod or equivalent.

### SR-16

Reject unknown event types.

### SR-17

Do not implement shell execution, remote command execution, arbitrary file access, or arbitrary URL fetching from chat messages.

### SR-18

Do not expose server stack traces to the client in production.

### SR-19

Log authentication failures and connection events, but do not log Access tokens, TURN passwords, cookies, or secrets.

### SR-20

Disable stream recording unless explicitly enabled in a future feature.

### SR-21

Do not place secrets in Vite/Next public environment variables.

### SR-22

Use dependency lockfiles and keep dependencies minimal.

---

## 13. Suggested Technology Stack

Preferred simple implementation:

### Frontend

```text
React
TypeScript
Vite
CSS Modules or plain CSS
```

Avoid requiring a large UI framework.

### Backend

```text
Node.js
TypeScript
Express or Fastify
ws / WebSocket library
Zod for message schemas
```

### Networking

```text
Cloudflare DNS
Cloudflare Access
Cloudflare Tunnel
WebRTC
WebSocket signaling
STUN
TURN/coturn for fallback
```

### Storage

MVP:

```text
No database required
```

Optional later:

```text
SQLite
```

### Testing

```text
Vitest
Playwright
```

---

## 14. Suggested Repository Structure

```text
private-cam-site/
├── README.md
├── package.json
├── .gitignore
├── .env.example
├── apps/
│   ├── viewer/
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── VideoPanel.tsx
│   │   │   │   ├── ChatPanel.tsx
│   │   │   │   ├── StatusBadge.tsx
│   │   │   │   └── RetroWindow.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useWebSocket.ts
│   │   │   │   └── useWebRTCViewer.ts
│   │   │   └── styles/
│   │   └── ...
│   │
│   ├── broadcaster/
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── WebcamPreview.tsx
│   │   │   ├── TTSController.ts
│   │   │   └── useWebRTCBroadcaster.ts
│   │   └── ...
│   │
│   └── server/
│       ├── src/
│       │   ├── index.ts
│       │   ├── auth/
│       │   │   └── cloudflareAccess.ts
│       │   ├── signaling/
│       │   │   ├── websocket.ts
│       │   │   └── protocol.ts
│       │   ├── chat/
│       │   │   ├── validation.ts
│       │   │   └── rateLimit.ts
│       │   └── config.ts
│       └── ...
│
├── infra/
│   ├── cloudflared.example.yml
│   ├── coturn.example.conf
│   └── systemd/
│
└── docs/
    ├── SECURITY.md
    └── DEPLOYMENT.md
```

A monorepo is optional. A simpler single Node project is acceptable if it preserves the broadcaster/public separation.

---

## 15. Signaling Protocol

Use typed JSON messages.

Example client-to-server messages:

```ts
type ClientMessage =
  | { type: "viewer.ready" }
  | { type: "broadcaster.ready"; broadcasterToken: string }
  | { type: "webrtc.offer"; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc.answer"; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc.ice"; candidate: RTCIceCandidateInit }
  | { type: "chat.send"; text: string };
```

Example server-to-client messages:

```ts
type ServerMessage =
  | { type: "presence"; broadcasterOnline: boolean; viewerOnline: boolean }
  | { type: "webrtc.offer"; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc.answer"; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc.ice"; candidate: RTCIceCandidateInit }
  | { type: "chat.message"; id: string; text: string; createdAt: string }
  | { type: "error"; code: string; message: string };
```

The actual direction of offer/answer may be chosen by the implementation, but it must be deterministic and documented.

---

## 16. WebSocket State Model

Track:

```ts
interface SessionState {
  broadcaster?: WebSocket;
  viewer?: WebSocket;
}
```

The server only needs one logical room for the MVP.

Do not let a client provide arbitrary room IDs.

When broadcaster disconnects:

```text
- mark broadcaster offline
- notify viewer
- close/clear existing peer connection state
```

When viewer disconnects:

```text
- mark viewer offline
- notify broadcaster
- clean stale signaling state
```

---

## 17. Chat/TTS Flow

Required flow:

```text
1. Viewer types "hi cutie"
2. Viewer UI sends:
   { type: "chat.send", text: "hi cutie" }

3. Server validates:
   - authenticated viewer
   - schema
   - non-empty
   - <= 300 chars
   - rate limit

4. Server creates message id + timestamp.

5. Server sends sanitized/plain message to:
   - viewer UI for chat history
   - broadcaster UI

6. Broadcaster UI appends message to TTS queue.

7. TTS controller speaks the message.

8. Next queued message starts after speech ends.
```

---

## 18. Environment Variables

Create `.env.example`.

Suggested variables:

```dotenv
NODE_ENV=development

PUBLIC_PORT=3000
BROADCASTER_PORT=3001

AUTHORIZED_VIEWER_EMAIL=viewer@example.com

CF_ACCESS_TEAM_DOMAIN=
CF_ACCESS_AUD=

BROADCASTER_TOKEN=

STUN_URLS=
TURN_URL=
TURN_USERNAME=
TURN_CREDENTIAL=

FORCE_TURN=false

MAX_CHAT_LENGTH=300
TTS_QUEUE_LIMIT=20
```

Never include real credentials in `.env.example`.

---

## 19. Broadcaster Page Requirements

The local broadcaster dashboard should include:

### Camera controls

- webcam selector,
- Start Camera,
- Stop Camera,
- local preview,
- current video resolution,
- WebRTC connection status.

### Viewer status

Show:

```text
viewer: offline
viewer: connected
```

### TTS controls

- enabled/disabled toggle,
- voice selector,
- rate,
- pitch,
- volume,
- pause,
- resume,
- skip,
- clear queue.

### Debug panel

Development-only collapsible panel:

- signaling socket state,
- ICE connection state,
- peer connection state,
- selected ICE candidate type if available,
- number of queued TTS messages.

Do not show secrets.

---

## 20. Viewer Page Requirements

Main screen:

1. Header/title.
2. Connection indicator.
3. Live video.
4. Cute offline placeholder.
5. Chat history.
6. Message input.
7. Send button.

Optional cute UI elements:

- current local time,
- "live" pixel badge,
- heart animation when a message is sent,
- configurable custom title,
- rotating cute status text.

Do not let decorative elements compromise accessibility.

---

## 21. Accessibility

Even though the design is retro:

- maintain readable contrast,
- do not communicate connection state by color alone,
- support keyboard navigation,
- add visible focus styles,
- add labels for inputs/buttons,
- honor `prefers-reduced-motion`,
- avoid rapid flashing.

---

## 22. Error States

Provide user-friendly states for:

### Viewer

```text
Authenticating...
Connecting...
Camera is offline
Connecting to video...
Video connection failed
Reconnecting...
Message failed to send
```

### Broadcaster

```text
No camera permission
Camera unavailable
Signaling disconnected
Viewer connected
Viewer disconnected
WebRTC failed
TTS unavailable
```

Technical errors should be logged locally/server-side without leaking sensitive internals to the remote viewer.

---

## 23. Logging

Log:

- server startup,
- broadcaster connected/disconnected,
- viewer connected/disconnected,
- WebRTC signaling transitions,
- rate-limit events,
- malformed messages,
- authentication rejection,
- unexpected errors.

Do not log:

- Access JWTs,
- authorization cookies,
- broadcaster token,
- TURN password,
- full secrets.

Chat text logging should be disabled by default.

---

## 24. Testing Requirements

### Authentication tests

Verify:

1. unauthenticated request is denied before app content is served,
2. unauthorized email is denied,
3. configured email succeeds,
4. invalid Access JWT is rejected by backend,
5. expired JWT is rejected,
6. WebSocket cannot be used without authorization.

### Network tests

Verify:

1. public app works without router port forwarding,
2. local broadcaster page cannot be opened from another LAN device when bound to loopback,
3. Cloudflare Tunnel reconnects after temporary network interruption.

### Streaming tests

Test combinations such as:

- desktop -> desktop,
- desktop broadcaster -> iPhone viewer,
- desktop broadcaster -> Android viewer,
- Wi-Fi -> cellular,
- cellular -> home Wi-Fi,
- STUN direct connection,
- TURN-relayed connection.

### Chat tests

Verify:

- normal short message,
- empty message,
- >300 character message,
- rapid spam,
- HTML tags,
- `<script>` text,
- emoji,
- Unicode,
- reconnect while message is queued.

### TTS tests

Verify:

- queue ordering,
- mute,
- skip,
- clear,
- browser refresh,
- unavailable voice,
- very long valid message,
- repeated messages.

---

## 25. Deployment Requirements

Create clear documentation for:

### Local setup

```text
npm install
npm run dev
```

### Production processes

Prefer separate commands:

```text
npm run start:server
npm run start:broadcaster
```

Or one supervisor command that starts both while preserving network isolation.

### Process management

Provide optional systemd service definitions for:

- public application,
- Cloudflare Tunnel.

Broadcaster UI does not necessarily need to auto-start unless desired.

### Cloudflare setup documentation

Document:

1. Add domain to Cloudflare.
2. Create named Tunnel.
3. Route `cute.example.com` to `http://127.0.0.1:3000`.
4. Create a self-hosted Cloudflare Access application.
5. Protect the entire hostname.
6. Add an Allow policy for the exact authorized viewer email.
7. Enable email OTP or configured identity provider.
8. Set reasonable session duration.
9. Obtain Access audience (`AUD`) value.
10. Configure the backend to validate the Access JWT.
11. Confirm no Bypass policy accidentally exposes the site.

---

## 26. Security Acceptance Checklist

Before calling the project production-ready:

- [ ] Public domain uses HTTPS.
- [ ] Cloudflare Access protects `/*`.
- [ ] Access policy allows only the intended viewer identity.
- [ ] No catch-all email/domain rule exists.
- [ ] No Access bypass rule exposes the app.
- [ ] Backend validates Cloudflare Access JWT.
- [ ] WebSocket authentication is enforced.
- [ ] Broadcaster page binds only to `127.0.0.1`.
- [ ] Router has no inbound port-forward rule for the app.
- [ ] No camera stream endpoint is directly public.
- [ ] Chat input is length-limited server-side.
- [ ] Chat input is treated as plain text.
- [ ] Rate limiting is enabled.
- [ ] Secrets are not committed to Git.
- [ ] TURN credentials are not permanent public bundle secrets.
- [ ] Stream recording is disabled.
- [ ] Chat persistence is disabled unless intentionally configured.
- [ ] Production logs contain no tokens or secrets.
- [ ] Dependencies have been reviewed for known vulnerabilities.
- [ ] Remote test from an unauthorized browser fails.
- [ ] Remote test from the authorized account succeeds.

---

## 27. MVP Build Order

### Phase 1 — Static UI

Build the retro viewer layout and local broadcaster layout.

### Phase 2 — Real-time connection

Implement authenticated WebSocket signaling and broadcaster/viewer presence.

### Phase 3 — Webcam

Implement one-way WebRTC video from broadcaster to viewer.

### Phase 4 — Chat

Implement viewer-to-broadcaster real-time chat.

### Phase 5 — TTS

Implement local TTS queue on broadcaster page.

### Phase 6 — Authentication

Configure Cloudflare Tunnel + Cloudflare Access and backend JWT verification.

Security should be present before any Internet-facing test with real camera access.

### Phase 7 — TURN

Add TURN fallback and test from mobile/cellular networks.

### Phase 8 — Polish

Add retro visual details, responsive layout, offline states, reconnection behavior, and accessibility.

---

## 28. Out of Scope for MVP

Do not add these unless specifically requested:

- multiple users,
- public accounts,
- user registration,
- public stream,
- video recording,
- cloud video archive,
- file uploads,
- image uploads,
- two-way audio/video,
- remote shell commands,
- arbitrary home automation,
- payment system,
- social login choices beyond what authentication requires,
- complex database,
- analytics/tracking SDKs,
- ad networks.

---

## 29. Definition of Done

The project is complete when:

1. The owner launches the server, tunnel, and broadcaster UI.
2. The owner clicks Start Camera.
3. The girlfriend opens the custom HTTPS domain.
4. Cloudflare requires authentication.
5. Only her configured identity is accepted.
6. After login she sees the live webcam.
7. She can send a chat message.
8. The message appears immediately.
9. The owner's computer speaks the message through TTS.
10. An unauthorized/incognito user cannot see the webpage, stream, signaling service, or chat.
11. The owner's broadcaster/admin page cannot be reached from the public Internet.
12. No router port forwarding is required for the web application.
13. The camera is not recorded or persisted by default.

---

## 30. Instructions to the Coding Agent

Implement the MVP according to this specification.

Priorities, in order:

```text
1. Security / isolation
2. Correct one-viewer authorization
3. Stable WebRTC stream
4. Reliable chat + TTS
5. Reconnection behavior
6. Cute retro presentation
```

When requirements conflict, choose the safer implementation.

Do not weaken authentication to make local development easier. Instead, provide a clearly labeled development-only auth bypass that:

- works only when `NODE_ENV=development`,
- works only from loopback,
- cannot be enabled silently in production.

Before finishing:

- run unit tests,
- run type checking,
- run linting,
- run production build,
- document setup,
- document Cloudflare Access/Tunnel configuration,
- provide `.env.example`,
- provide a threat-model/security notes document,
- verify no secrets exist in tracked files.

Do not commit real email addresses, domain names, authentication tokens, TURN credentials, or personal text/images to the repository.
