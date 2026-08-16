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

	onMount(() => {
		session.start();

		const tick = () =>
			(clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
		tick();
		const clockTimer = setInterval(tick, 20_000);
		const moodTimer = setInterval(() => {
			mood = moods[Math.floor(Math.random() * moods.length)];
		}, 12_000);

		return () => {
			clearInterval(clockTimer);
			clearInterval(moodTimer);
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

	{#if connection === 'busy'}
		<RetroWindow title="already open ♡" accent="lavender">
			<p class="busy">
				This little room is open in another tab or on another device. Close it there, then come
				back.
			</p>
			<div class="row">
				<button class="btn btn--lav" onclick={() => session.signaling.connect()}>try again</button>
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

	.footer {
		text-align: center;
		margin: 4px 0 0;
	}
</style>
