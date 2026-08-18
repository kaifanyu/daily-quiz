/**
 * Viewer side: receives one-way video and sends chat.
 *
 * The viewer never publishes a camera or microphone — the peer connection is
 * recvonly and `getUserMedia` is never called here (FR "Viewer", point 6).
 * The broadcaster is always the offerer, so there is no glare to resolve: every
 * offer simply replaces the previous peer connection.
 */

import { Signaling, type ConnectionState } from './signaling.svelte';
import { CHAT_HISTORY_LIMIT, type ChatMessage, type IceCandidate } from './protocol';

export type VideoState = 'offline' | 'connecting' | 'live' | 'failed';

export interface IceConfig {
	iceServers: RTCIceServer[];
	iceTransportPolicy: 'all' | 'relay';
}

/** How long a stalled connection is given before we ask for a fresh offer. */
const STALL_TIMEOUT_MS = 20_000;
const WATCHDOG_INTERVAL_MS = 5_000;

function hasTurn(iceServers: RTCIceServer[]): boolean {
	return iceServers.some((server) => {
		const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
		return urls.some((url) => url.startsWith('turn:') || url.startsWith('turns:'));
	});
}

export class ViewerSession {
	readonly signaling: Signaling;

	stream = $state<MediaStream | null>(null);
	videoState = $state<VideoState>('offline');
	messages = $state<ChatMessage[]>([]);
	/** Transient toast for rate limits, send failures, etc. */
	notice = $state<string | null>(null);

	#ice: IceConfig;
	#pc: RTCPeerConnection | null = null;
	#pendingCandidates: IceCandidate[] = [];
	#noticeTimer: ReturnType<typeof setTimeout> | null = null;
	#unsubscribe: (() => void) | null = null;
	#watchdogTimer: ReturnType<typeof setInterval> | null = null;
	#detachLifecycle: (() => void) | null = null;
	/** When the current attempt at getting video started, for the stall watchdog. */
	#attemptStartedAt = 0;
	/**
	 * Set after a direct connection fails: cellular carriers sit behind symmetric
	 * NAT and often block UDP outright, so the retry goes relay-only.
	 */
	#relayOnly = false;

	constructor(ice: IceConfig) {
		this.#ice = ice;
		this.signaling = new Signaling({ role: 'viewer' });
	}

	get connectionState(): ConnectionState {
		return this.signaling.state;
	}

	start(): void {
		this.#unsubscribe = this.signaling.on((message) => {
			switch (message.type) {
				case 'presence':
					if (!message.broadcasterOnline || !message.streaming) this.#teardownPeer('offline');
					break;
				case 'webrtc.offer':
					void this.#acceptOffer(message.sdp as RTCSessionDescriptionInit);
					break;
				case 'webrtc.ice':
					void this.#addCandidate(message.candidate);
					break;
				case 'chat.message':
					this.messages = [...this.messages, message.message].slice(-CHAT_HISTORY_LIMIT);
					break;
				case 'error':
					this.flash(message.message);
					break;
			}
		});
		// Start the stall clock now, or the watchdog would consider the very first
		// (still perfectly healthy) attempt overdue.
		this.#attemptStartedAt = Date.now();
		this.signaling.connect();
		this.#attachLifecycle();
		this.#watchdogTimer = setInterval(() => this.#checkForStall(), WATCHDOG_INTERVAL_MS);
	}

	stop(): void {
		this.#unsubscribe?.();
		this.#detachLifecycle?.();
		this.#detachLifecycle = null;
		if (this.#watchdogTimer) clearInterval(this.#watchdogTimer);
		this.#watchdogTimer = null;
		this.#teardownPeer('offline');
		this.signaling.disconnect();
		if (this.#noticeTimer) clearTimeout(this.#noticeTimer);
	}

	/**
	 * Bring the room back after the page was frozen — a locked phone, an app
	 * switch, a tab restored from the back/forward cache. Mobile browsers suspend
	 * timers and let both the socket and the peer connection rot while the page is
	 * hidden, and nothing recovers on its own, so this is what makes /live usable
	 * on a phone at all (FR-15).
	 */
	resume(): void {
		this.signaling.resume();

		const pc = this.#pc;
		if (!pc) return;
		// A peer connection that was frozen mid-call never recovers by itself.
		if (
			pc.connectionState === 'failed' ||
			pc.connectionState === 'disconnected' ||
			pc.connectionState === 'closed'
		) {
			this.#requestFreshStream();
		}
	}

	sendChat(text: string): boolean {
		const trimmed = text.trim();
		if (!trimmed) return false;
		const sent = this.signaling.send({ type: 'chat.send', text: trimmed });
		if (!sent) this.flash('Message failed to send — reconnecting...');
		return sent;
	}

	flash(message: string): void {
		this.notice = message;
		if (this.#noticeTimer) clearTimeout(this.#noticeTimer);
		this.#noticeTimer = setTimeout(() => (this.notice = null), 4000);
	}

	// ---------------------------------------------------------------- internals

	#attachLifecycle(): void {
		if (typeof document === 'undefined') return;

		const onVisibility = () => {
			if (document.visibilityState === 'visible') this.resume();
		};
		// `pageshow` covers iOS restoring the page from the back/forward cache,
		// where `visibilitychange` does not always fire.
		const onPageShow = () => this.resume();
		const onOnline = () => this.resume();

		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pageshow', onPageShow);
		window.addEventListener('online', onOnline);

		this.#detachLifecycle = () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pageshow', onPageShow);
			window.removeEventListener('online', onOnline);
		};
	}

	/**
	 * Announce ourselves again, which makes the room ask the broadcaster for a new
	 * offer. Everything about the old peer connection is thrown away first.
	 */
	#requestFreshStream(): void {
		this.#teardownPeer('connecting');
		this.#attemptStartedAt = Date.now();
		this.signaling.send({ type: 'viewer.ready' });
	}

	/**
	 * The broadcaster is streaming but we still have no picture. That happens when
	 * an offer or answer was lost while the phone was asleep, or when ICE quietly
	 * gave up. Ask again, and if a direct path already failed, ask for a relayed
	 * one.
	 */
	#checkForStall(): void {
		if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
		if (!this.signaling.connected) return;
		if (!this.signaling.presence.broadcasterOnline || !this.signaling.presence.streaming) return;
		if (this.videoState === 'live') return;
		if (Date.now() - this.#attemptStartedAt < STALL_TIMEOUT_MS) return;

		if (!this.#relayOnly && hasTurn(this.#ice.iceServers)) {
			this.#relayOnly = true;
			console.warn('[live] no video yet — retrying through TURN only');
		}
		this.#requestFreshStream();
	}

	async #acceptOffer(offer: RTCSessionDescriptionInit): Promise<void> {
		this.#teardownPeer('connecting');
		this.#attemptStartedAt = Date.now();

		const pc = new RTCPeerConnection({
			iceServers: this.#ice.iceServers,
			iceTransportPolicy:
				this.#relayOnly && hasTurn(this.#ice.iceServers) ? 'relay' : this.#ice.iceTransportPolicy
		});
		this.#pc = pc;

		pc.addEventListener('track', (event) => {
			this.stream = event.streams[0] ?? new MediaStream([event.track]);
		});

		pc.addEventListener('icecandidate', (event) => {
			if (event.candidate) {
				this.signaling.send({
					type: 'webrtc.ice',
					candidate: event.candidate.toJSON() as IceCandidate
				});
			}
		});

		pc.addEventListener('connectionstatechange', () => {
			switch (pc.connectionState) {
				case 'connected':
					this.videoState = 'live';
					break;
				case 'failed':
					this.videoState = 'failed';
					// The direct path is out. Mark the retry relay-only and let the
					// watchdog run it, which keeps a hard failure from becoming a loop.
					if (this.#pc === pc && hasTurn(this.#ice.iceServers)) this.#relayOnly = true;
					break;
				case 'disconnected':
					this.videoState = 'connecting';
					// WebRTC often heals a brief drop by itself, so restart the stall
					// clock instead of tearing the connection down immediately.
					this.#attemptStartedAt = Date.now();
					break;
				case 'closed':
					if (this.#pc === pc) this.videoState = 'offline';
					break;
			}
		});

		try {
			await pc.setRemoteDescription(offer);
			// Receive only: we never add a local track.
			const answer = await pc.createAnswer();
			await pc.setLocalDescription(answer);
			this.signaling.send({
				type: 'webrtc.answer',
				sdp: { type: 'answer', sdp: answer.sdp }
			});
			for (const candidate of this.#pendingCandidates) {
				await pc.addIceCandidate(candidate).catch(() => undefined);
			}
			this.#pendingCandidates = [];
		} catch (error) {
			console.warn('[live] failed to answer offer', error);
			this.videoState = 'failed';
		}
	}

	async #addCandidate(candidate: IceCandidate): Promise<void> {
		const pc = this.#pc;
		if (!pc || !pc.remoteDescription) {
			this.#pendingCandidates.push(candidate);
			return;
		}
		await pc.addIceCandidate(candidate).catch(() => undefined);
	}

	#teardownPeer(next: VideoState): void {
		if (this.#pc) {
			this.#pc.close();
			this.#pc = null;
		}
		this.#pendingCandidates = [];
		this.stream = null;
		this.videoState = next;
	}
}
