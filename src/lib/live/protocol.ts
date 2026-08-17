/**
 * Signaling protocol shared by the viewer page, the broadcaster page and the
 * Durable Object that relays between them.
 *
 * Everything crossing the wire is validated with Zod on the server (SR-15) and
 * unknown event types are rejected (SR-16). Chat text is *always* treated as
 * untrusted plain text — it is never interpreted as HTML, Markdown or SSML.
 */

import { z } from 'zod';

/** Server-enforced ceiling on a single chat message (SR-13). */
export const MAX_CHAT_LENGTH = 300;
/** At most one message per second, sustained. */
export const CHAT_MIN_INTERVAL_MS = 1000;
/** ...and at most 5 in any rolling 10 second window. */
export const CHAT_BURST_LIMIT = 5;
export const CHAT_BURST_WINDOW_MS = 10_000;
/** How many messages the viewer keeps on screen / the broadcaster keeps queued. */
export const CHAT_HISTORY_LIMIT = 50;
export const TTS_QUEUE_LIMIT = 20;

/** WebSocket subprotocol. The broadcaster appends `bt.<token>` as a second one. */
export const WS_PROTOCOL = 'live.v1';
export const WS_BROADCASTER_TOKEN_PREFIX = 'bt.';

/**
 * A subprotocol value is an RFC 6455 *token*: letters, digits and a handful of
 * punctuation. `/` and `=` are not in that set, so a raw `openssl rand -base64 32`
 * token makes `new WebSocket(url, protocols)` throw `SyntaxError` in the browser
 * before a request is ever sent. Base64url without padding is token-safe, so the
 * token is encoded on the way out and decoded in the signaling endpoint.
 */
export function encodeBroadcasterToken(token: string): string {
	const bytes = new TextEncoder().encode(token);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Inverse of {@link encodeBroadcasterToken}. Returns `null` if it isn't base64url. */
export function decodeBroadcasterToken(encoded: string): string | null {
	if (!/^[A-Za-z0-9\-_]*$/.test(encoded)) return null;
	try {
		const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
		const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

export type Role = 'viewer' | 'broadcaster';

const sessionDescription = z.object({
	type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
	sdp: z.string().max(64_000).optional()
});

const iceCandidate = z.object({
	candidate: z.string().max(4096),
	sdpMid: z.string().max(256).nullish(),
	sdpMLineIndex: z.number().int().min(0).max(128).nullish(),
	usernameFragment: z.string().max(256).nullish()
});

/** Anything the browser may send us. Nothing else is accepted. */
export const clientMessageSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('viewer.ready') }),
	z.object({ type: z.literal('broadcaster.ready') }),
	/** Broadcaster tells the room whether a camera is actually live. */
	z.object({ type: z.literal('broadcaster.state'), streaming: z.boolean() }),
	z.object({ type: z.literal('webrtc.offer'), sdp: sessionDescription }),
	z.object({ type: z.literal('webrtc.answer'), sdp: sessionDescription }),
	z.object({ type: z.literal('webrtc.ice'), candidate: iceCandidate }),
	z.object({ type: z.literal('chat.send'), text: z.string().min(1).max(MAX_CHAT_LENGTH) }),
	z.object({ type: z.literal('ping') })
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type SessionDescription = z.infer<typeof sessionDescription>;
export type IceCandidate = z.infer<typeof iceCandidate>;

export interface ChatMessage {
	id: string;
	text: string;
	createdAt: string;
	from: Role;
}

export type ServerMessage =
	| { type: 'hello'; role: Role; serverTime: string }
	| { type: 'presence'; broadcasterOnline: boolean; viewerOnline: boolean; streaming: boolean }
	| { type: 'webrtc.offer'; sdp: SessionDescription }
	| { type: 'webrtc.answer'; sdp: SessionDescription }
	| { type: 'webrtc.ice'; candidate: IceCandidate }
	| { type: 'chat.message'; message: ChatMessage }
	| { type: 'error'; code: ErrorCode; message: string }
	| { type: 'pong' };

export type ErrorCode =
	| 'unauthorized'
	| 'viewer_busy'
	| 'bad_message'
	| 'rate_limited'
	| 'too_long'
	| 'no_peer';

/** Close codes we use deliberately, so the UI can explain what happened. */
export const CLOSE_VIEWER_BUSY = 4001;
export const CLOSE_UNAUTHORIZED = 4003;
