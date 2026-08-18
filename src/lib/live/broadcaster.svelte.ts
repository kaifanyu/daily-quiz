/**
 * Broadcaster side: captures the webcam and publishes one-way video to the
 * single viewer, and hands incoming chat to the TTS queue.
 *
 * Microphone capture is off by default (§7) — audio is never requested unless
 * `withAudio` is explicitly turned on.
 *
 * The broadcaster is always the offerer. A fresh `RTCPeerConnection` is created
 * whenever the viewer (re)appears or the camera restarts, which keeps
 * renegotiation trivial and avoids offer/answer glare entirely.
 */

import { Signaling } from './signaling.svelte';
import { CHAT_HISTORY_LIMIT, type ChatMessage, type IceCandidate } from './protocol';
import type { IceConfig } from './viewer.svelte';

export class BroadcasterSession {
	readonly signaling: Signaling;

	devices = $state<{ deviceId: string; label: string }[]>([]);
	deviceId = $state<string | null>(null);
	withAudio = $state(false);
	localStream = $state<MediaStream | null>(null);
	streaming = $state(false);
	cameraError = $state<string | null>(null);
	resolution = $state<string | null>(null);

	peerState = $state<RTCPeerConnectionState | 'idle'>('idle');
	iceState = $state<RTCIceConnectionState | 'idle'>('idle');
	candidateType = $state<string | null>(null);
	messages = $state<ChatMessage[]>([]);

	/** Called for every chat message that arrives — wired to the TTS queue. */
	onChat: ((message: ChatMessage) => void) | null = null;

	#ice: IceConfig;
	#pc: RTCPeerConnection | null = null;
	#pendingCandidates: IceCandidate[] = [];
	#statsTimer: ReturnType<typeof setInterval> | null = null;
	#unsubscribe: (() => void) | null = null;
	#viewerOnline = false;

	constructor(ice: IceConfig, token: string) {
		this.#ice = ice;
		this.signaling = new Signaling({
			role: 'broadcaster',
			token,
			// The room tracks `streaming` per socket, so a reconnected broadcaster
			// turns up looking like a camera that is switched off — and the viewer,
			// told the camera is asleep, drops the video and stops retrying. Say what
			// the camera is actually doing every time the socket comes up.
			onOpen: () => {
				this.signaling.send({ type: 'broadcaster.state', streaming: this.streaming });
			}
		});
	}

	start(): void {
		this.#unsubscribe = this.signaling.on((message) => {
			switch (message.type) {
				case 'presence': {
					const wasOnline = this.#viewerOnline;
					this.#viewerOnline = message.viewerOnline;
					// `viewer.rejoined` is the primary cue to publish; this is only the
					// fallback for a viewer that turned up without one, so it must not
					// duplicate an offer that already has a peer connection open.
					if (message.viewerOnline && !wasOnline && !this.#pc) void this.#offer();
					if (!message.viewerOnline && wasOnline) this.#closePeer();
					break;
				}

				// The viewer announced itself and needs a stream: a first visit, a
				// reconnect after a phone woke up, or a move to another device. Always
				// publish a fresh offer — the old peer connection is worthless to them.
				case 'viewer.rejoined':
					this.#viewerOnline = true;
					void this.#offer();
					break;
				case 'webrtc.answer':
					void this.#acceptAnswer(message.sdp as RTCSessionDescriptionInit);
					break;
				case 'webrtc.ice':
					void this.#addCandidate(message.candidate);
					break;
				case 'chat.message':
					this.messages = [...this.messages, message.message].slice(-CHAT_HISTORY_LIMIT);
					this.onChat?.(message.message);
					break;
			}
		});
		this.signaling.connect();
	}

	stop(): void {
		this.#unsubscribe?.();
		this.stopCamera();
		this.signaling.disconnect();
	}

	get viewerOnline(): boolean {
		return this.#viewerOnline;
	}

	/** Device labels are only populated once permission has been granted. */
	async listDevices(): Promise<void> {
		try {
			const all = await navigator.mediaDevices.enumerateDevices();
			this.devices = all
				.filter((device) => device.kind === 'videoinput')
				.map((device, index) => ({
					deviceId: device.deviceId,
					label: device.label || `Camera ${index + 1}`
				}));
			if (!this.deviceId && this.devices.length > 0) this.deviceId = this.devices[0].deviceId;
		} catch (error) {
			console.warn('[live] could not list devices', error);
		}
	}

	async startCamera(): Promise<void> {
		this.cameraError = null;
		this.stopCamera({ keepSignaling: true });

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: this.deviceId
					? { deviceId: { exact: this.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
					: { width: { ideal: 1280 }, height: { ideal: 720 } },
				audio: this.withAudio
			});
			this.localStream = stream;
			this.streaming = true;

			const settings = stream.getVideoTracks()[0]?.getSettings();
			this.resolution = settings?.width ? `${settings.width}x${settings.height}` : null;

			await this.listDevices();
			this.signaling.send({ type: 'broadcaster.state', streaming: true });
			if (this.#viewerOnline) await this.#offer();
		} catch (error) {
			const name = (error as DOMException)?.name;
			this.cameraError =
				name === 'NotAllowedError'
					? 'No camera permission — allow it in the browser and try again.'
					: name === 'NotFoundError'
						? 'Camera unavailable — no video device was found.'
						: `Camera unavailable (${name ?? 'unknown error'}).`;
			this.streaming = false;
		}
	}

	stopCamera(options: { keepSignaling?: boolean } = {}): void {
		this.#closePeer();
		this.localStream?.getTracks().forEach((track) => track.stop());
		this.localStream = null;
		this.streaming = false;
		this.resolution = null;
		if (!options.keepSignaling)
			this.signaling.send({ type: 'broadcaster.state', streaming: false });
	}

	// ---------------------------------------------------------------- internals

	async #offer(): Promise<void> {
		const stream = this.localStream;
		if (!stream) return;

		this.#closePeer();

		const pc = new RTCPeerConnection({
			iceServers: this.#ice.iceServers,
			iceTransportPolicy: this.#ice.iceTransportPolicy
		});
		this.#pc = pc;

		for (const track of stream.getTracks()) pc.addTrack(track, stream);

		pc.addEventListener('icecandidate', (event) => {
			if (event.candidate) {
				this.signaling.send({
					type: 'webrtc.ice',
					candidate: event.candidate.toJSON() as IceCandidate
				});
			}
		});
		pc.addEventListener('connectionstatechange', () => (this.peerState = pc.connectionState));
		pc.addEventListener('iceconnectionstatechange', () => (this.iceState = pc.iceConnectionState));

		try {
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			this.signaling.send({ type: 'webrtc.offer', sdp: { type: 'offer', sdp: offer.sdp } });
			this.#startStatsPolling();
		} catch (error) {
			console.warn('[live] failed to create offer', error);
			this.peerState = 'failed';
		}
	}

	async #acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
		const pc = this.#pc;
		if (!pc) return;
		try {
			await pc.setRemoteDescription(answer);
			for (const candidate of this.#pendingCandidates) {
				await pc.addIceCandidate(candidate).catch(() => undefined);
			}
			this.#pendingCandidates = [];
		} catch (error) {
			console.warn('[live] failed to apply answer', error);
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

	#startStatsPolling(): void {
		if (this.#statsTimer) clearInterval(this.#statsTimer);
		this.#statsTimer = setInterval(async () => {
			const pc = this.#pc;
			if (!pc) return;
			try {
				const stats = await pc.getStats();
				let pairId: string | null = null;
				stats.forEach((report) => {
					if (report.type === 'candidate-pair' && report.state === 'succeeded') {
						pairId = report.localCandidateId as string;
					}
				});
				if (!pairId) return;
				stats.forEach((report) => {
					if (report.id === pairId) this.candidateType = (report.candidateType as string) ?? null;
				});
			} catch {
				// Stats are decorative; ignore failures.
			}
		}, 3000);
	}

	#closePeer(): void {
		if (this.#statsTimer) {
			clearInterval(this.#statsTimer);
			this.#statsTimer = null;
		}
		this.#pc?.close();
		this.#pc = null;
		this.#pendingCandidates = [];
		this.peerState = 'idle';
		this.iceState = 'idle';
		this.candidateType = null;
	}
}
