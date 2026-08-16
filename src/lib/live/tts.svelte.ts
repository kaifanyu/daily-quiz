/**
 * Text-to-speech queue for the broadcaster machine.
 *
 * Messages are spoken one at a time, in order. Everything is treated as plain
 * text: no SSML, no markup, no interpretation of any kind (§9 "Do not permit a
 * remote message to inject SSML or executable content").
 *
 * The engine sits behind `SpeechAdapter` so a local neural TTS or a hosted
 * provider can replace the browser's speech synthesis later without touching the
 * queue logic.
 */

import { TTS_QUEUE_LIMIT, type ChatMessage } from './protocol';

export interface TtsSettings {
	voiceURI: string | null;
	rate: number;
	pitch: number;
	volume: number;
}

export interface TtsVoice {
	uri: string;
	name: string;
	lang: string;
}

export interface SpeechAdapter {
	readonly id: string;
	readonly available: boolean;
	listVoices(): TtsVoice[];
	/** Resolves when the utterance finishes, is skipped, or fails. */
	speak(text: string, settings: TtsSettings): Promise<void>;
	cancel(): void;
	pause(): void;
	resume(): void;
}

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
	voiceURI: null,
	rate: 1.0,
	pitch: 1.05,
	volume: 1.0
};

const SETTINGS_KEY = 'live.tts.settings';

/** Browser Web Speech API adapter — the MVP engine, no API key required. */
export class WebSpeechAdapter implements SpeechAdapter {
	readonly id = 'web-speech';

	get available(): boolean {
		return typeof window !== 'undefined' && 'speechSynthesis' in window;
	}

	listVoices(): TtsVoice[] {
		if (!this.available) return [];
		return window.speechSynthesis
			.getVoices()
			.map((voice) => ({ uri: voice.voiceURI, name: voice.name, lang: voice.lang }));
	}

	speak(text: string, settings: TtsSettings): Promise<void> {
		if (!this.available) return Promise.resolve();

		return new Promise((resolve) => {
			const utterance = new SpeechSynthesisUtterance(text);
			const voice = window.speechSynthesis
				.getVoices()
				.find((candidate) => candidate.voiceURI === settings.voiceURI);
			if (voice) utterance.voice = voice;
			utterance.rate = settings.rate;
			utterance.pitch = settings.pitch;
			utterance.volume = settings.volume;

			let settled = false;
			let guard: ReturnType<typeof setTimeout>;
			const finish = () => {
				if (settled) return;
				settled = true;
				clearTimeout(guard);
				resolve();
			};
			utterance.addEventListener('end', finish);
			utterance.addEventListener('error', finish);

			// Some engines never fire `end` (no voices installed, or the utterance
			// is dropped). Without this the whole queue would stall forever.
			const estimate = Math.max(6000, text.length * 140) / Math.max(settings.rate, 0.5);
			guard = setTimeout(finish, estimate + 4000);

			window.speechSynthesis.speak(utterance);
		});
	}

	cancel(): void {
		if (this.available) window.speechSynthesis.cancel();
	}

	pause(): void {
		if (this.available) window.speechSynthesis.pause();
	}

	resume(): void {
		if (this.available) window.speechSynthesis.resume();
	}
}

export class TtsController {
	enabled = $state(true);
	muted = $state(false);
	paused = $state(false);
	speaking = $state(false);
	queue = $state<ChatMessage[]>([]);
	current = $state<ChatMessage | null>(null);
	voices = $state<TtsVoice[]>([]);
	settings = $state<TtsSettings>({ ...DEFAULT_TTS_SETTINGS });
	unavailableReason = $state<string | null>(null);

	#adapter: SpeechAdapter;
	#pumping = false;
	/** Chrome stops speaking after ~15s unless nudged. */
	#keepAlive: ReturnType<typeof setInterval> | null = null;

	constructor(adapter: SpeechAdapter = new WebSpeechAdapter()) {
		this.#adapter = adapter;
		if (!adapter.available) {
			this.unavailableReason = 'This browser has no speech synthesis — messages will still arrive.';
		}
	}

	/** Load saved settings and the voice list. Call once, from the browser. */
	init(): () => void {
		if (typeof window === 'undefined') return () => undefined;

		try {
			const saved = localStorage.getItem(SETTINGS_KEY);
			if (saved) this.settings = { ...DEFAULT_TTS_SETTINGS, ...JSON.parse(saved) };
		} catch {
			// Corrupt settings are not worth crashing over.
		}

		const refreshVoices = () => (this.voices = this.#adapter.listVoices());
		refreshVoices();
		window.speechSynthesis?.addEventListener?.('voiceschanged', refreshVoices);

		this.#keepAlive = setInterval(() => {
			if (this.speaking && !this.paused) this.#adapter.resume();
		}, 8000);

		return () => {
			window.speechSynthesis?.removeEventListener?.('voiceschanged', refreshVoices);
			if (this.#keepAlive) clearInterval(this.#keepAlive);
			this.#adapter.cancel();
		};
	}

	saveSettings(): void {
		try {
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
		} catch {
			// Private mode / storage disabled — settings just won't persist.
		}
	}

	enqueue(message: ChatMessage): void {
		if (!this.enabled) return;
		const next = [...this.queue, message];
		// Drop the oldest rather than let a flood grow without bound.
		this.queue = next.slice(-TTS_QUEUE_LIMIT);
		void this.#pump();
	}

	skip(): void {
		this.#adapter.cancel();
	}

	clear(): void {
		this.queue = [];
		this.#adapter.cancel();
	}

	pause(): void {
		this.paused = true;
		this.#adapter.pause();
	}

	resume(): void {
		this.paused = false;
		this.#adapter.resume();
		void this.#pump();
	}

	toggleEnabled(): void {
		this.enabled = !this.enabled;
		if (!this.enabled) this.clear();
	}

	/** Speaks a short sample so the owner can check voice/rate/pitch. */
	preview(text = 'hi cutie, this is how I sound'): void {
		void this.#adapter.speak(text, this.#effectiveSettings());
	}

	async #pump(): Promise<void> {
		if (this.#pumping || this.paused) return;
		this.#pumping = true;
		try {
			while (this.queue.length > 0 && !this.paused) {
				const [next, ...rest] = this.queue;
				this.queue = rest;
				this.current = next;
				this.speaking = true;
				await this.#adapter.speak(next.text, this.#effectiveSettings());
				this.speaking = false;
				this.current = null;
			}
		} finally {
			this.speaking = false;
			this.current = null;
			this.#pumping = false;
		}
	}

	#effectiveSettings(): TtsSettings {
		return { ...this.settings, volume: this.muted ? 0 : this.settings.volume };
	}
}
