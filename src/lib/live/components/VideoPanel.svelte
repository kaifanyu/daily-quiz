<script lang="ts">
	import { onMount } from 'svelte';
	import type { ConnectionState } from '$lib/live/signaling.svelte';
	import type { VideoState } from '$lib/live/viewer.svelte';

	interface Props {
		stream: MediaStream | null;
		videoState: VideoState;
		connection: ConnectionState;
		broadcasterOnline: boolean;
		streaming: boolean;
	}

	let { stream, videoState, connection, broadcasterOnline, streaming }: Props = $props();

	let videoElement = $state<HTMLVideoElement | null>(null);
	let needsTap = $state(false);
	let hasAudio = $state(false);
	let soundOn = $state(false);

	// Browsers only autoplay muted media, so the stream always starts muted —
	// otherwise she'd be looking at a black rectangle. If the broadcaster is
	// actually sending audio, we offer a tap to turn it on.
	$effect(() => {
		const element = videoElement;
		if (!element) return;
		element.srcObject = stream;
		if (!stream) {
			hasAudio = false;
			soundOn = false;
			return;
		}
		hasAudio = stream.getAudioTracks().length > 0;
		element.muted = !soundOn;
		void play();
	});

	async function play(): Promise<void> {
		const element = videoElement;
		if (!element) return;
		try {
			await element.play();
			needsTap = false;
		} catch {
			// iOS Low Power Mode and some Android browsers refuse even a muted
			// autoplay, so fall back to asking for one tap.
			needsTap = true;
		}
	}

	// A phone that was locked or backgrounded comes back with the element paused,
	// and nothing restarts it on its own.
	onMount(() => {
		const onVisibility = () => {
			if (document.visibilityState === 'visible' && stream) void play();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	async function enableSound() {
		const element = videoElement;
		if (!element) return;
		element.muted = false;
		try {
			await element.play();
			soundOn = true;
		} catch {
			// Unmuted playback was refused — go back to muted so the picture keeps
			// running instead of freezing.
			element.muted = true;
			soundOn = false;
			void play();
		}
	}

	let phase = $derived.by(() => {
		if (stream && videoState === 'live') return 'live' as const;
		if (connection !== 'open') return 'connecting' as const;
		if (!broadcasterOnline) return 'sleeping' as const;
		if (!streaming) return 'waking' as const;
		if (videoState === 'failed') return 'failed' as const;
		return 'connecting' as const;
	});

	const copy = {
		sleeping: { line: '♡ camera is sleeping...', hint: 'it will wake up on its own' },
		waking: { line: '♡ almost there...', hint: 'the camera is warming up' },
		connecting: { line: '♡ connecting to video...', hint: 'stringing the tin cans together' },
		failed: { line: '♡ video got lost', hint: 'trying again in a moment' },
		live: { line: '', hint: '' }
	};
</script>

<div class="stage" class:stage--live={phase === 'live'}>
	<!-- svelte-ignore a11y_media_has_caption -->
	<!--
		`muted` and `playsinline` are both load-bearing on mobile: Safari decides
		whether autoplay is allowed from the attribute, and without `playsinline`
		iOS hijacks the stream into its own fullscreen player.
	-->
	<video
		bind:this={videoElement}
		class="video"
		class:video--hidden={phase !== 'live'}
		autoplay
		muted
		playsinline
		disablepictureinpicture
	></video>

	{#if phase !== 'live'}
		<div class="placeholder">
			<div class="cam-wrap">
				<svg class="cam" viewBox="0 0 34 24" width="132" height="94" aria-hidden="true">
					<rect
						x="2"
						y="6"
						width="19"
						height="14"
						rx="2"
						fill="var(--pink-300)"
						stroke="var(--ink)"
						stroke-width="1.4"
					/>
					<path
						d="M21 11.5 L30 7 L30 19 L21 14.5 Z"
						fill="var(--lav-400)"
						stroke="var(--ink)"
						stroke-width="1.4"
						stroke-linejoin="round"
					/>
					<circle
						cx="10"
						cy="13"
						r="4"
						fill="var(--paper)"
						stroke="var(--ink)"
						stroke-width="1.4"
					/>
					{#if phase === 'sleeping'}
						<path
							d="M8 13 q2 -2 4 0"
							fill="none"
							stroke="var(--ink)"
							stroke-width="1.2"
							stroke-linecap="round"
						/>
					{:else}
						<circle cx="10" cy="13" r="1.6" fill="var(--ink)" />
					{/if}
					<rect
						x="16"
						y="9"
						width="3"
						height="2"
						fill="var(--butter)"
						stroke="var(--ink)"
						stroke-width="1"
					/>
				</svg>

				{#if phase === 'sleeping'}
					<div class="zzz" aria-hidden="true">
						<span>z</span><span>z</span><span>z</span>
					</div>
				{/if}
			</div>

			<p class="placeholder__line">{copy[phase].line}</p>
			<p class="pixel muted">{copy[phase].hint}</p>
		</div>
	{/if}

	{#if phase === 'live' && needsTap}
		<button class="btn btn--mint tap" onclick={play}>♡ tap to play</button>
	{:else if phase === 'live' && hasAudio && !soundOn}
		<button class="btn btn--mint tap" onclick={enableSound}>♡ tap for sound</button>
	{/if}
</div>

<style>
	.stage {
		position: relative;
		aspect-ratio: 16 / 9;
		width: 100%;
		background:
			repeating-linear-gradient(0deg, rgba(75, 43, 70, 0.06) 0 2px, transparent 2px 4px),
			linear-gradient(160deg, var(--lav-200), var(--pink-100));
		display: grid;
		place-items: center;
		overflow: hidden;
	}

	.stage--live {
		background: #2b1c29;
	}

	.video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #2b1c29;
	}

	.video--hidden {
		opacity: 0;
		pointer-events: none;
	}

	.placeholder {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		text-align: center;
		padding: 16px;
	}

	.cam-wrap {
		position: relative;
		display: inline-flex;
	}

	.cam {
		animation: retro-bob 3.4s ease-in-out infinite;
	}

	.zzz {
		position: absolute;
		top: -4px;
		right: -6px;
		display: flex;
		gap: 3px;
		font-family: var(--font-pixel);
		font-size: 9px;
		color: var(--lav-600);
	}

	.zzz span {
		animation: retro-bob 2.2s ease-in-out infinite;
	}
	.zzz span:nth-child(2) {
		animation-delay: 0.25s;
	}
	.zzz span:nth-child(3) {
		animation-delay: 0.5s;
	}

	.placeholder__line {
		margin: 8px 0 0;
		font-weight: 800;
		font-size: 15px;
	}

	.tap {
		position: absolute;
		bottom: 14px;
	}
</style>
