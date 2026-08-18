/**
 * `LiveRoom` — the one signaling room for the private webcam site.
 *
 * A single Durable Object instance holds the broadcaster socket and (at most)
 * one viewer socket, relays WebRTC signaling between them, and forwards chat.
 * It never sees video: media travels peer-to-peer (or via TURN), never through
 * this object.
 *
 * Authentication happens *before* a socket reaches here — see
 * `src/routes/live/ws/+server.ts`. The role is assigned by that endpoint and is
 * never taken from client input (SR-14).
 *
 * NOTE: this module is bundled by Wrangler (not Vite), so it must only use
 * relative imports — no `$lib` aliases.
 */

import { DurableObject } from 'cloudflare:workers';
import {
	CHAT_BURST_LIMIT,
	CHAT_BURST_WINDOW_MS,
	CHAT_MIN_INTERVAL_MS,
	CLOSE_REPLACED,
	CLOSE_VIEWER_BUSY,
	clientMessageSchema,
	MAX_CHAT_LENGTH,
	WS_PROTOCOL,
	type ErrorCode,
	type Role,
	type ServerMessage
} from '../../live/protocol';

/** Anything larger than this is not a signaling message we care about. */
const MAX_FRAME_BYTES = 96 * 1024;

/**
 * Strip C0/C1 control characters (keeping newline and tab) so a message can never
 * carry terminal escapes, bidi overrides or anything a TTS engine might treat as
 * markup. Emoji and other Unicode pass through untouched.
 */
function stripControlCharacters(input: string): string {
	let output = '';
	for (const character of input) {
		const code = character.codePointAt(0) ?? 0;
		const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
		const isAllowedWhitespace = code === 0x0a || code === 0x09;
		// U+2028/U+2029 line separators and the bidi override block.
		const isBidiOrSeparator =
			code === 0x2028 || code === 0x2029 || (code >= 0x202a && code <= 0x202e);
		if ((isControl && !isAllowedWhitespace) || isBidiOrSeparator) continue;
		output += character;
	}
	return output;
}

interface Attachment {
	role: Role;
	/** Broadcaster only: is a camera actually publishing right now? */
	streaming: boolean;
	/** Rolling chat rate-limit state, kept on the socket so it survives hibernation. */
	chatTimes: number[];
}

export class LiveRoom extends DurableObject {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const role = url.searchParams.get('role') === 'broadcaster' ? 'broadcaster' : 'viewer';

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];

		const headers = new Headers();
		// Echo the subprotocol back or some browsers abort the handshake.
		if ((request.headers.get('sec-websocket-protocol') ?? '').includes(WS_PROTOCOL)) {
			headers.set('sec-websocket-protocol', WS_PROTOCOL);
		}

		// FR-06: exactly one viewer. A second one is turned away politely rather
		// than silently stealing the first one's stream.
		if (role === 'viewer' && this.sockets('viewer').length > 0) {
			this.ctx.acceptWebSocket(server, ['reject']);
			this.send(server, {
				type: 'error',
				code: 'viewer_busy',
				message: 'This little room is already open in another tab or device.'
			});
			server.close(CLOSE_VIEWER_BUSY, 'viewer_busy');
			return new Response(null, { status: 101, webSocket: client, headers });
		}

		// A reconnecting broadcaster replaces the stale one. The close code matters:
		// 1000 reads as an ordinary drop, so the evicted page reconnects, evicts the
		// page that replaced it, and the two churn forever. CLOSE_REPLACED tells it
		// to stay down.
		if (role === 'broadcaster') {
			for (const existing of this.sockets('broadcaster')) {
				try {
					existing.close(CLOSE_REPLACED, 'replaced');
				} catch {
					// already gone
				}
			}
		}

		this.ctx.acceptWebSocket(server, [role]);
		this.setAttachment(server, { role, streaming: false, chatTimes: [] });

		this.send(server, { type: 'hello', role, serverTime: new Date().toISOString() });
		this.broadcastPresence();

		console.log(`[live] ${role} connected`);
		return new Response(null, { status: 101, webSocket: client, headers });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		if (typeof raw !== 'string') return this.fail(ws, 'bad_message', 'Text frames only.');
		if (raw.length > MAX_FRAME_BYTES) return this.fail(ws, 'bad_message', 'Message too large.');

		const attachment = this.getAttachment(ws);
		if (!attachment) return;

		let parsedJson: unknown;
		try {
			parsedJson = JSON.parse(raw);
		} catch {
			return this.fail(ws, 'bad_message', 'Malformed message.');
		}

		// SR-15 / SR-16: schema-validate everything, reject unknown event types.
		const parsed = clientMessageSchema.safeParse(parsedJson);
		if (!parsed.success) {
			console.warn('[live] rejected malformed message from', attachment.role);
			return this.fail(ws, 'bad_message', 'That message was not understood.');
		}

		const message = parsed.data;
		const { role } = attachment;

		switch (message.type) {
			case 'ping':
				return this.send(ws, { type: 'pong' });

			case 'viewer.ready':
			case 'broadcaster.ready':
				return this.broadcastPresence();

			case 'broadcaster.state': {
				if (role !== 'broadcaster') return this.deny(ws);
				this.setAttachment(ws, { ...attachment, streaming: message.streaming });
				return this.broadcastPresence();
			}

			// The broadcaster is always the offerer; the viewer only ever answers.
			case 'webrtc.offer': {
				if (role !== 'broadcaster') return this.deny(ws);
				return this.relay(role, { type: 'webrtc.offer', sdp: message.sdp });
			}

			case 'webrtc.answer': {
				if (role !== 'viewer') return this.deny(ws);
				return this.relay(role, { type: 'webrtc.answer', sdp: message.sdp });
			}

			case 'webrtc.ice':
				return this.relay(role, { type: 'webrtc.ice', candidate: message.candidate });

			case 'chat.send': {
				if (role !== 'viewer') return this.deny(ws);
				return this.handleChat(ws, attachment, message.text);
			}
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
		const role = this.getAttachment(ws)?.role;
		if (role) console.log(`[live] ${role} disconnected (${code}${reason ? ` ${reason}` : ''})`);
		// The socket is still listed while this handler runs; close it so presence
		// is computed from the sockets that remain.
		try {
			ws.close(1000, 'bye');
		} catch {
			// already closed
		}
		this.broadcastPresence(ws);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		this.broadcastPresence(ws);
	}

	// ---------------------------------------------------------------- chat ---

	private handleChat(ws: WebSocket, attachment: Attachment, rawText: string): void {
		// Plain text only: collapse control characters, trim, hard-cap length (SR-09).
		const text = stripControlCharacters(rawText).trim().slice(0, MAX_CHAT_LENGTH);

		if (!text) return this.fail(ws, 'bad_message', 'Say something first ♡');

		const now = Date.now();
		const recent = attachment.chatTimes.filter((t) => now - t < CHAT_BURST_WINDOW_MS);
		const last = recent[recent.length - 1] ?? 0;

		if (now - last < CHAT_MIN_INTERVAL_MS || recent.length >= CHAT_BURST_LIMIT) {
			console.log('[live] chat rate limited');
			return this.fail(ws, 'rate_limited', 'Slow down a smidge ♡');
		}

		this.setAttachment(ws, { ...attachment, chatTimes: [...recent, now] });

		const payload: ServerMessage = {
			type: 'chat.message',
			message: {
				id: crypto.randomUUID(),
				text,
				createdAt: new Date(now).toISOString(),
				from: 'viewer'
			}
		};

		// Echo to the viewer (so her own message appears) and deliver to the
		// broadcaster for TTS. Nothing is persisted anywhere (FR-14).
		for (const socket of this.sockets()) this.send(socket, payload);

		if (this.sockets('broadcaster').length === 0) {
			this.fail(ws, 'no_peer', 'sent ♡ nobody is listening right now');
		}
	}

	// ------------------------------------------------------------- plumbing ---

	private sockets(tag?: Role): WebSocket[] {
		const all = tag ? this.ctx.getWebSockets(tag) : this.ctx.getWebSockets();
		return all.filter((ws) => ws.readyState === WebSocket.OPEN);
	}

	private relay(from: Role, message: ServerMessage): void {
		const target: Role = from === 'viewer' ? 'broadcaster' : 'viewer';
		for (const socket of this.sockets(target)) this.send(socket, message);
	}

	private broadcastPresence(exclude?: WebSocket): void {
		const broadcasters = this.sockets('broadcaster').filter((ws) => ws !== exclude);
		const viewers = this.sockets('viewer').filter((ws) => ws !== exclude);
		const streaming = broadcasters.some((ws) => this.getAttachment(ws)?.streaming === true);

		const presence: ServerMessage = {
			type: 'presence',
			broadcasterOnline: broadcasters.length > 0,
			viewerOnline: viewers.length > 0,
			streaming
		};

		for (const socket of [...broadcasters, ...viewers]) this.send(socket, presence);
	}

	private send(ws: WebSocket, message: ServerMessage): void {
		try {
			ws.send(JSON.stringify(message));
		} catch {
			// Socket went away mid-send; the close handler will tidy up.
		}
	}

	private fail(ws: WebSocket, code: ErrorCode, message: string): void {
		this.send(ws, { type: 'error', code, message });
	}

	private deny(ws: WebSocket): void {
		this.fail(ws, 'unauthorized', 'Not allowed on this connection.');
	}

	private getAttachment(ws: WebSocket): Attachment | null {
		const value = ws.deserializeAttachment() as Attachment | null;
		if (!value || typeof value !== 'object') return null;
		return {
			role: value.role === 'broadcaster' ? 'broadcaster' : 'viewer',
			streaming: value.streaming === true,
			chatTimes: Array.isArray(value.chatTimes) ? value.chatTimes : []
		};
	}

	private setAttachment(ws: WebSocket, attachment: Attachment): void {
		ws.serializeAttachment(attachment);
	}
}
