<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import RetroWindow from '$lib/live/components/RetroWindow.svelte';
	import StatusLight from '$lib/live/components/StatusLight.svelte';
	import VideoPanel from '$lib/live/components/VideoPanel.svelte';
	import ChatPanel from '$lib/live/components/ChatPanel.svelte';
	import { connectionLabel } from '$lib/live/signaling.svelte';
	import { ViewerSession } from '$lib/live/viewer.svelte';

	let { data }: { data: PageData } = $props();

	// The ICE config is fixed for the lifetime of the page, so reading it once here
	// is intentional.
	// svelte-ignore state_referenced_locally
	const session = new ViewerSession({
		iceServers: data.ice.iceServers as RTCIceServer[],
		iceTransportPolicy: data.ice.iceTransportPolicy
	});

	const moods = [
		'thinking about you ♡',
		'the kettle is on',
		'pixel hearts everywhere',
		'this window is only for you',
		'say something sweet ♡',
		'made with love + tin cans'
	];

	let clock = $state('');
	let mood = $state(moods[0]);

	let presence = $derived(session.signaling.presence);
	let connection = $derived(session.signaling.state);
	let canSend = $derived(connection === 'open');

	let lampTone = $derived.by(() => {
		if (connection === 'busy' || connection === 'denied') return 'error' as const;
		if (presence.broadcasterOnline && presence.streaming) return 'live' as const;
		return 'idle' as const;
	});

	let lampLabel = $derived.by(() => {
		if (connection !== 'open') return connectionLabel(connection);
		if (presence.broadcasterOnline && presence.streaming) return 'live now';
		if (presence.broadcasterOnline) return 'here, camera off';
		return 'away';
	});

	/**
	 * Keep a phone from dimming and locking mid-conversation. The lock is released
	 * by the browser whenever the page is hidden, so it is re-requested on the way
	 * back. Unsupported or refused is fine — it just isn't held.
	 */
	type WakeLock = { release(): Promise<void> } | null;
	let wakeLock: WakeLock = null;

	async function holdScreenAwake() {
		const api = (
			navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLock> } }
		).wakeLock;
		if (!api || wakeLock || document.visibilityState !== 'visible') return;
		try {
			wakeLock = await api.request('screen');
		} catch {
			wakeLock = null;
		}
	}

	onMount(() => {
		session.start();

		const tick = () =>
			(clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
		tick();
		const clockTimer = setInterval(tick, 20_000);
		const moodTimer = setInterval(() => {
			mood = moods[Math.floor(Math.random() * moods.length)];
		}, 12_000);

		void holdScreenAwake();

		// Mobile browsers freeze timers while the page is hidden, so the clock is
		// stale on return and the wake lock is gone.
		const onVisibility = () => {
			if (document.visibilityState !== 'visible') {
				wakeLock = null;
				return;
			}
			tick();
			void holdScreenAwake();
		};
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			clearInterval(clockTimer);
			clearInterval(moodTimer);
			void wakeLock?.release();
			wakeLock = null;
			session.stop();
		};
	});
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<div class="retro-shell">
	<RetroWindow title={data.title}>
		{#snippet actions()}
			<span class="pixel clock">{clock}</span>
		{/snippet}

		<div class="header">
			<div class="header__left">
				<h1>hi cutie ♡</h1>
				<p class="pixel muted mood">{mood}</p>
			</div>
			<StatusLight tone={lampTone} label={lampLabel} pulse={lampTone === 'live'} />
		</div>

		{#if data.devBypass}
			<p class="warn pixel">dev bypass is on — this is only allowed on localhost</p>
		{/if}
	</RetroWindow>

	{#if connection === 'busy' || connection === 'replaced'}
		<RetroWindow title="already open ♡" accent="lavender">
			<p class="busy">
				{connection === 'replaced'
					? 'This room opened on another tab or device, so this window let go of it. Tap below to watch here instead.'
					: 'This little room is open somewhere else. Close it there, then come back.'}
			</p>
			<div class="row">
				<button class="btn btn--lav" onclick={() => session.signaling.connect()}>
					{connection === 'replaced' ? 'watch here ♡' : 'try again'}
				</button>
			</div>
		</RetroWindow>
	{:else}
		<div class="grid">
			<RetroWindow title="live ♡" flush>
				{#snippet actions()}
					<StatusLight
						tone={session.videoState === 'live' ? 'live' : 'idle'}
						label={session.videoState === 'live' ? 'on air' : 'standby'}
						pulse={session.videoState === 'live'}
					/>
				{/snippet}
				<VideoPanel
					stream={session.stream}
					videoState={session.videoState}
					{connection}
					broadcasterOnline={presence.broadcasterOnline}
					streaming={presence.streaming}
				/>
			</RetroWindow>

			<RetroWindow title="chat ♡" accent="lavender">
				<ChatPanel
					messages={session.messages}
					{canSend}
					notice={session.notice}
					onsend={(text) => session.sendChat(text)}
				/>
			</RetroWindow>
		</div>
	{/if}

	<p class="pixel muted footer">
		♥ nothing here is recorded or saved ♥ messages disappear when this window closes ♥
	</p>
</div>

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}

	.header__left {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.mood {
		margin: 0;
	}

	.clock {
		color: var(--ink);
	}

	.warn {
		margin: 0;
		padding: 6px 9px;
		border: 2px solid var(--ink);
		border-radius: 8px;
		background: var(--butter);
	}

	.busy {
		margin: 0;
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}

	@media (max-width: 860px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 640px) {
		.grid {
			gap: 12px;
		}

		.header {
			gap: 8px;
		}
	}

	.footer {
		text-align: center;
		margin: 4px 0 0;
	}
</style>
