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
		this.signaling.connect();
	}

	stop(): void {
		this.#unsubscribe?.();
		this.#teardownPeer('offline');
		this.signaling.disconnect();
		if (this.#noticeTimer) clearTimeout(this.#noticeTimer);
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

	async #acceptOffer(offer: RTCSessionDescriptionInit): Promise<void> {
		this.#teardownPeer('connecting');

		const pc = new RTCPeerConnection({
			iceServers: this.#ice.iceServers,
			iceTransportPolicy: this.#ice.iceTransportPolicy
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
					break;
				case 'disconnected':
					this.videoState = 'connecting';
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
