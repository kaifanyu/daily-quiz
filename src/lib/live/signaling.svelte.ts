/**
 * Browser side of the signaling socket, shared by the viewer and the broadcaster.
 *
 * Handles reconnection with backoff (FR-08), keep-alive pings, and presence.
 * It knows nothing about WebRTC — it just moves typed messages.
 */

import {
	CLOSE_UNAUTHORIZED,
	CLOSE_VIEWER_BUSY,
	WS_BROADCASTER_TOKEN_PREFIX,
	WS_PROTOCOL,
	type ClientMessage,
	type Role,
	type ServerMessage
} from './protocol';

export type ConnectionState =
	| 'idle'
	| 'connecting'
	| 'open'
	| 'reconnecting'
	| 'busy'
	| 'denied'
	| 'closed';

export interface Presence {
	broadcasterOnline: boolean;
	viewerOnline: boolean;
	streaming: boolean;
}

const PING_INTERVAL_MS = 25_000;
const BACKOFF_MIN_MS = 800;
const BACKOFF_MAX_MS = 15_000;

export class Signaling {
	/** Connection lifecycle, for the status lamp. */
	state = $state<ConnectionState>('idle');
	presence = $state<Presence>({ broadcasterOnline: false, viewerOnline: false, streaming: false });
	/** Set when the room turned us away; shown to the user verbatim. */
	rejection = $state<string | null>(null);

	#role: Role;
	#token?: string;
	#socket: WebSocket | null = null;
	#handlers = new Set<(message: ServerMessage) => void>();
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#pingTimer: ReturnType<typeof setInterval> | null = null;
	#attempts = 0;
	#stopped = false;

	constructor(options: { role: Role; token?: string }) {
		this.#role = options.role;
		this.#token = options.token;
	}

	/** Subscribe to server messages. Returns an unsubscribe function. */
	on(handler: (message: ServerMessage) => void): () => void {
		this.#handlers.add(handler);
		return () => this.#handlers.delete(handler);
	}

	connect(): void {
		if (typeof window === 'undefined') return;
		this.#stopped = false;
		this.#open();
	}

	disconnect(): void {
		this.#stopped = true;
		this.#clearTimers();
		this.#socket?.close(1000, 'bye');
		this.#socket = null;
		this.state = 'closed';
	}

	send(message: ClientMessage): boolean {
		if (this.#socket?.readyState !== WebSocket.OPEN) return false;
		this.#socket.send(JSON.stringify(message));
		return true;
	}

	get connected(): boolean {
		return this.state === 'open';
	}

	// ---------------------------------------------------------------- internals

	#open(): void {
		this.#clearTimers();

		const url = new URL('/live/ws', window.location.href);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

		// The broadcaster token rides in the subprotocol header rather than the
		// query string so it never lands in a URL or an access log.
		const protocols = [WS_PROTOCOL];
		if (this.#token) protocols.push(`${WS_BROADCASTER_TOKEN_PREFIX}${this.#token}`);

		this.state = this.#attempts === 0 ? 'connecting' : 'reconnecting';

		let socket: WebSocket;
		try {
			socket = new WebSocket(url, protocols);
		} catch {
			this.#scheduleReconnect();
			return;
		}
		this.#socket = socket;

		socket.addEventListener('open', () => {
			this.#attempts = 0;
			this.state = 'open';
			this.rejection = null;
			this.send(this.#role === 'viewer' ? { type: 'viewer.ready' } : { type: 'broadcaster.ready' });
			this.#pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_INTERVAL_MS);
		});

		socket.addEventListener('message', (event) => {
			if (typeof event.data !== 'string') return;
			let message: ServerMessage;
			try {
				message = JSON.parse(event.data) as ServerMessage;
			} catch {
				return;
			}
			if (message.type === 'presence') {
				this.presence = {
					broadcasterOnline: message.broadcasterOnline,
					viewerOnline: message.viewerOnline,
					streaming: message.streaming
				};
			}
			if (
				message.type === 'error' &&
				(message.code === 'viewer_busy' || message.code === 'unauthorized')
			) {
				this.rejection = message.message;
			}
			for (const handler of this.#handlers) handler(message);
		});

		socket.addEventListener('close', (event) => {
			this.#clearTimers();
			this.#socket = null;

			if (event.code === CLOSE_VIEWER_BUSY) {
				this.state = 'busy';
				return;
			}
			if (event.code === CLOSE_UNAUTHORIZED) {
				this.state = 'denied';
				return;
			}
			if (this.#stopped) {
				this.state = 'closed';
				return;
			}
			this.presence = { broadcasterOnline: false, viewerOnline: false, streaming: false };
			this.#scheduleReconnect();
		});
	}

	#scheduleReconnect(): void {
		if (this.#stopped) return;
		this.state = 'reconnecting';
		this.#attempts += 1;
		const backoff = Math.min(BACKOFF_MIN_MS * 2 ** (this.#attempts - 1), BACKOFF_MAX_MS);
		const jitter = Math.random() * 400;
		this.#reconnectTimer = setTimeout(() => this.#open(), backoff + jitter);
	}

	#clearTimers(): void {
		if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
		if (this.#pingTimer) clearInterval(this.#pingTimer);
		this.#reconnectTimer = null;
		this.#pingTimer = null;
	}
}

/** Human-readable connection copy, reused by both pages. */
export function connectionLabel(state: ConnectionState): string {
	switch (state) {
		case 'idle':
			return 'waiting';
		case 'connecting':
			return 'connecting...';
		case 'open':
			return 'connected';
		case 'reconnecting':
			return 'reconnecting...';
		case 'busy':
			return 'another tab is open';
		case 'denied':
			return 'not authorized';
		case 'closed':
			return 'disconnected';
	}
}
