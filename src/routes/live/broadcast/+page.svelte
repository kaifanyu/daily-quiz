<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import RetroWindow from '$lib/live/components/RetroWindow.svelte';
	import StatusLight from '$lib/live/components/StatusLight.svelte';
	import { connectionLabel } from '$lib/live/signaling.svelte';
	import { BroadcasterSession } from '$lib/live/broadcaster.svelte';
	import { TtsController } from '$lib/live/tts.svelte';
	import type { IceConfig } from '$lib/live/viewer.svelte';

	let { data }: { data: PageData } = $props();

	const TOKEN_KEY = 'live.broadcaster.token';

	const tts = new TtsController();

	let token = $state('');
	let unlocking = $state(false);
	let unlockError = $state<string | null>(null);
	let session = $state<BroadcasterSession | null>(null);
	let preview = $state<HTMLVideoElement | null>(null);
	let showDebug = $state(false);

	let connection = $derived(session?.signaling.state ?? 'idle');
	let viewerOnline = $derived(session?.signaling.presence.viewerOnline ?? false);

	$effect(() => {
		if (preview) preview.srcObject = session?.localStream ?? null;
	});

	onMount(() => {
		const teardown = tts.init();
		const saved = sessionStorage.getItem(TOKEN_KEY);
		if (saved) {
			token = saved;
			void unlock();
		}
		return () => {
			teardown();
			session?.stop();
		};
	});

	/**
	 * The token is checked server-side by asking for ICE credentials with it.
	 * That gives a precise error instead of an opaque WebSocket failure.
	 */
	async function unlock(event?: SubmitEvent) {
		event?.preventDefault();
		if (!token.trim()) return;
		unlocking = true;
		unlockError = null;

		try {
			const response = await fetch('/live/api/ice', {
				headers: { 'x-broadcaster-token': token.trim() }
			});
			if (response.status === 401) {
				unlockError = 'That token was not accepted.';
				sessionStorage.removeItem(TOKEN_KEY);
				return;
			}
			if (!response.ok) {
				unlockError = `Could not reach the room (${response.status}).`;
				return;
			}

			const ice = (await response.json()) as IceConfig;
			sessionStorage.setItem(TOKEN_KEY, token.trim());

			const next = new BroadcasterSession(ice, token.trim());
			next.onChat = (message) => tts.enqueue(message);
			next.start();
			void next.listDevices();
			session = next;
		} catch {
			unlockError = 'Could not reach the room. Check your connection.';
		} finally {
			unlocking = false;
		}
	}

	function lock() {
		sessionStorage.removeItem(TOKEN_KEY);
		session?.stop();
		session = null;
		token = '';
	}

	function clockOf(iso: string): string {
		const date = new Date(iso);
		return Number.isNaN(date.getTime())
			? ''
			: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:head>
	<title>broadcast ♡</title>
</svelte:head>

<div class="retro-shell">
	<RetroWindow title="broadcaster ♡" accent="mint">
		{#snippet actions()}
			{#if session}
				<button class="btn btn--sm btn--ghost" onclick={lock}>lock</button>
			{/if}
		{/snippet}

		<div class="header">
			<div>
				<h1>hello, you ♡</h1>
				<p class="pixel muted">this dashboard stays on your computer</p>
			</div>
			<StatusLight
				tone={connection === 'open' ? 'live' : connection === 'denied' ? 'error' : 'idle'}
				label={connectionLabel(connection)}
				pulse={connection === 'open'}
			/>
		</div>

		{#if !data.tokenConfigured}
			<p class="warn warn--bad pixel">
				BROADCASTER_TOKEN is not set on the server — nothing can connect until it is.
			</p>
		{/if}
		{#if !data.accessConfigured}
			<p class="warn pixel">
				Cloudflare Access is not configured yet — /live is closed to everyone until it is.
			</p>
		{/if}
	</RetroWindow>

	{#if !session}
		<RetroWindow title="unlock ♡" accent="lavender">
			<form class="unlock" onsubmit={unlock}>
				<div>
					<label class="label" for="token">broadcaster token</label>
					<input
						id="token"
						class="field"
						type="password"
						bind:value={token}
						autocomplete="off"
						placeholder="paste the token from your .dev.vars / secret"
					/>
				</div>
				<div class="row">
					<button class="btn btn--lav" type="submit" disabled={unlocking || !token.trim()}>
						{unlocking ? 'checking...' : 'unlock ♡'}
					</button>
					{#if unlockError}
						<span class="pixel error-text" role="alert">{unlockError}</span>
					{/if}
				</div>
				<p class="pixel muted">kept in this tab only — it disappears when you close the window</p>
			</form>
		</RetroWindow>
	{:else}
		{@const s = session}
		<div class="grid">
			<div class="col">
				<RetroWindow title="camera ♡" flush>
					{#snippet actions()}
						<StatusLight
							tone={s.streaming ? 'live' : 'idle'}
							label={s.streaming ? 'on air' : 'camera off'}
							pulse={s.streaming}
						/>
					{/snippet}

					<div class="preview">
						<!-- svelte-ignore a11y_media_has_caption -->
						<video bind:this={preview} class="preview__video" autoplay playsinline muted></video>
						{#if !s.localStream}
							<p class="preview__idle pixel">camera is off</p>
						{/if}
					</div>

					<div class="camera-controls">
						<div class="row">
							<label class="visually-hidden" for="device">Camera</label>
							<select
								id="device"
								class="field device"
								bind:value={s.deviceId}
								disabled={s.streaming}
							>
								{#each s.devices as device (device.deviceId)}
									<option value={device.deviceId}>{device.label}</option>
								{/each}
								{#if s.devices.length === 0}
									<option value={null}>default camera</option>
								{/if}
							</select>

							{#if s.streaming}
								<button class="btn btn--ghost" onclick={() => s.stopCamera()}> stop camera </button>
							{:else}
								<button class="btn btn--mint" onclick={() => s.startCamera()}>
									start camera
								</button>
							{/if}
						</div>

						<label class="row check">
							<input type="checkbox" bind:checked={s.withAudio} disabled={s.streaming} />
							<span class="pixel">send microphone too (off by default)</span>
						</label>

						{#if s.cameraError}
							<p class="warn warn--bad pixel" role="alert">{s.cameraError}</p>
						{/if}

						<div class="row facts">
							<StatusLight
								tone={viewerOnline ? 'live' : 'idle'}
								label={viewerOnline ? 'viewer: connected' : 'viewer: offline'}
							/>
							{#if s.resolution}
								<span class="pixel muted">{s.resolution}</span>
							{/if}
							<span class="pixel muted">webrtc: {s.peerState}</span>
						</div>
					</div>
				</RetroWindow>

				<RetroWindow title="debug ♡" accent="lavender">
					{#snippet actions()}
						<button class="btn btn--sm btn--ghost" onclick={() => (showDebug = !showDebug)}>
							{showDebug ? 'hide' : 'show'}
						</button>
					{/snippet}
					{#if showDebug}
						<dl class="debug pixel">
							<div>
								<dt>signaling</dt>
								<dd>{connection}</dd>
							</div>
							<div>
								<dt>peer</dt>
								<dd>{s.peerState}</dd>
							</div>
							<div>
								<dt>ice</dt>
								<dd>{s.iceState}</dd>
							</div>
							<div>
								<dt>candidate</dt>
								<dd>{s.candidateType ?? '—'}</dd>
							</div>
							<div>
								<dt>tts queue</dt>
								<dd>{tts.queue.length}</dd>
							</div>
						</dl>
					{:else}
						<p class="pixel muted">connection details, hidden by default</p>
					{/if}
				</RetroWindow>
			</div>

			<div class="col">
				<RetroWindow title="she said ♡" accent="lavender">
					<div class="feed">
						{#if s.messages.length === 0}
							<p class="pixel muted">nothing yet ♡</p>
						{/if}
						{#each s.messages as message (message.id)}
							<article class="line" class:line--speaking={tts.current?.id === message.id}>
								<p class="line__text">{message.text}</p>
								<time class="pixel muted" datetime={message.createdAt}>
									{clockOf(message.createdAt)}
								</time>
							</article>
						{/each}
					</div>
				</RetroWindow>

				<RetroWindow title="voice ♡" accent="mint">
					{#snippet actions()}
						<StatusLight
							tone={tts.speaking ? 'live' : 'idle'}
							label={tts.speaking ? 'speaking' : `queue ${tts.queue.length}`}
							pulse={tts.speaking}
						/>
					{/snippet}

					{#if tts.unavailableReason}
						<p class="warn pixel">{tts.unavailableReason}</p>
					{/if}

					<div class="row">
						<button class="btn btn--sm" onclick={() => tts.toggleEnabled()}>
							{tts.enabled ? 'tts: on' : 'tts: off'}
						</button>
						<button class="btn btn--sm" onclick={() => (tts.muted = !tts.muted)}>
							{tts.muted ? 'muted' : 'sound on'}
						</button>
						{#if tts.paused}
							<button class="btn btn--sm btn--mint" onclick={() => tts.resume()}>resume</button>
						{:else}
							<button class="btn btn--sm btn--ghost" onclick={() => tts.pause()}>pause</button>
						{/if}
						<button class="btn btn--sm btn--ghost" onclick={() => tts.skip()}>skip</button>
						<button class="btn btn--sm btn--ghost" onclick={() => tts.clear()}>clear</button>
					</div>

					<div>
						<label class="label" for="voice">voice</label>
						<select
							id="voice"
							class="field"
							bind:value={tts.settings.voiceURI}
							onchange={() => tts.saveSettings()}
						>
							<option value={null}>system default</option>
							{#each tts.voices as voice (voice.uri)}
								<option value={voice.uri}>{voice.name} ({voice.lang})</option>
							{/each}
						</select>
					</div>

					<div class="sliders">
						<label>
							<span class="label">rate {tts.settings.rate.toFixed(2)}</span>
							<input
								type="range"
								min="0.5"
								max="2"
								step="0.05"
								bind:value={tts.settings.rate}
								onchange={() => tts.saveSettings()}
							/>
						</label>
						<label>
							<span class="label">pitch {tts.settings.pitch.toFixed(2)}</span>
							<input
								type="range"
								min="0"
								max="2"
								step="0.05"
								bind:value={tts.settings.pitch}
								onchange={() => tts.saveSettings()}
							/>
						</label>
						<label>
							<span class="label">volume {tts.settings.volume.toFixed(2)}</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								bind:value={tts.settings.volume}
								onchange={() => tts.saveSettings()}
							/>
						</label>
					</div>

					<div class="row">
						<button class="btn btn--sm btn--lav" onclick={() => tts.preview()}>test voice</button>
					</div>
				</RetroWindow>
			</div>
		</div>
	{/if}
</div>

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}

	.warn {
		margin: 0;
		padding: 6px 9px;
		border: 2px solid var(--ink);
		border-radius: 8px;
		background: var(--butter);
	}

	.warn--bad {
		background: #ffe0e6;
	}

	.error-text {
		color: #c0392b;
	}

	.unlock {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}

	.col {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}

	@media (max-width: 900px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.preview {
		position: relative;
		aspect-ratio: 16 / 9;
		background: #2b1c29;
		display: grid;
		place-items: center;
	}

	.preview__video {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.preview__idle {
		position: absolute;
		color: var(--pink-200);
	}

	.camera-controls {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border-top: var(--border);
	}

	.device {
		flex: 1 1 200px;
		width: auto;
	}

	.check {
		gap: 6px;
		cursor: pointer;
	}

	.facts {
		gap: 10px;
	}

	.feed {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 320px;
		overflow-y: auto;
	}

	.line {
		border: 2px solid var(--ink);
		border-radius: 10px;
		background: var(--paper-2);
		padding: 7px 10px;
	}

	.line--speaking {
		background: var(--mint);
	}

	.line__text {
		margin: 0;
		font-size: 15px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.sliders {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.sliders input[type='range'] {
		width: 100%;
		accent-color: var(--pink-500);
	}

	.debug {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.debug div {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		border-bottom: 1px dashed var(--pink-200);
		padding-bottom: 3px;
	}

	.debug dt {
		color: var(--ink-soft);
	}

	.debug dd {
		margin: 0;
	}
</style>
