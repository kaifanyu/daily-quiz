<script lang="ts">
	import { MAX_CHAT_LENGTH, type ChatMessage } from '$lib/live/protocol';

	interface Props {
		messages: ChatMessage[];
		canSend: boolean;
		notice?: string | null;
		/** Returns true when the message actually left the building. */
		onsend: (text: string) => boolean;
	}

	let { messages, canSend, notice = null, onsend }: Props = $props();

	let draft = $state('');
	let list = $state<HTMLDivElement | null>(null);
	let hearts = $state<{ id: number; left: number }[]>([]);
	let heartId = 0;

	let remaining = $derived(MAX_CHAT_LENGTH - draft.length);
	let overLimit = $derived(remaining < 0);

	// Keep the newest message in view.
	$effect(() => {
		messages.length;
		if (list) list.scrollTop = list.scrollHeight;
	});

	function send() {
		const text = draft.trim();
		if (!text || overLimit || !canSend) return;
		if (!onsend(text)) return;
		draft = '';
		popHeart();
	}

	function popHeart() {
		const heart = { id: heartId++, left: 20 + Math.random() * 60 };
		hearts = [...hearts, heart];
		setTimeout(() => (hearts = hearts.filter((h) => h.id !== heart.id)), 900);
	}

	function onkeydown(event: KeyboardEvent) {
		// Enter sends, Shift+Enter makes a new line (§8).
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			send();
		}
	}

	function clockOf(iso: string): string {
		const date = new Date(iso);
		return Number.isNaN(date.getTime())
			? ''
			: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="chat">
	<div class="chat__list" bind:this={list} role="log" aria-live="polite" aria-label="Messages">
		{#if messages.length === 0}
			<p class="chat__empty pixel">say hi ♡</p>
		{/if}
		{#each messages as message (message.id)}
			<article class="bubble">
				<!-- Plain text only: Svelte escapes this, and no HTML is ever rendered. -->
				<p class="bubble__text">{message.text}</p>
				<time class="bubble__time pixel muted" datetime={message.createdAt}>
					{clockOf(message.createdAt)}
				</time>
			</article>
		{/each}
	</div>

	{#if notice}
		<p class="chat__notice pixel" role="status">{notice}</p>
	{/if}

	<div class="chat__composer">
		<label class="visually-hidden" for="chat-input">Message</label>
		<textarea
			id="chat-input"
			class="field chat__input"
			bind:value={draft}
			{onkeydown}
			rows="2"
			maxlength={MAX_CHAT_LENGTH * 2}
			placeholder={canSend ? 'type something sweet...' : 'reconnecting...'}
			enterkeyhint="send"
			autocapitalize="sentences"
			spellcheck="true"
			disabled={!canSend}></textarea>

		<div class="chat__actions">
			<span class="pixel" class:over={overLimit} aria-live="polite">
				{remaining} left
			</span>
			<button class="btn" onclick={send} disabled={!canSend || !draft.trim() || overLimit}>
				send ♡
			</button>
		</div>

		<div class="hearts" aria-hidden="true">
			{#each hearts as heart (heart.id)}
				<span class="heart" style="left: {heart.left}%">♥</span>
			{/each}
		</div>
	</div>
</div>

<style>
	.chat {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		flex: 1 1 auto;
	}

	.chat__list {
		flex: 1 1 auto;
		min-height: 180px;
		max-height: min(46vh, 420px);
		/* `dvh` keeps the list from being pushed off-screen when a phone's virtual
		   keyboard shrinks the viewport. */
		max-height: min(46dvh, 420px);
		overflow-y: auto;
		/* Don't let a flick at the end of the list scroll the whole page. */
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		background: var(--paper-2);
		border: 2px solid var(--ink);
		border-radius: 10px;
		scrollbar-width: thin;
	}

	.chat__empty {
		margin: auto;
		color: var(--ink-soft);
	}

	.bubble {
		align-self: flex-end;
		max-width: 92%;
		background: var(--paper);
		border: 2px solid var(--ink);
		border-radius: 12px 12px 3px 12px;
		box-shadow: 2px 2px 0 var(--pink-300);
		padding: 7px 10px;
	}

	.bubble__text {
		margin: 0;
		font-size: 15px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.bubble__time {
		display: block;
		text-align: right;
		margin-top: 2px;
	}

	.chat__notice {
		margin: 0;
		padding: 6px 9px;
		border: 2px solid var(--ink);
		border-radius: 8px;
		background: var(--butter);
	}

	.chat__composer {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.chat__input {
		resize: none;
		font-family: var(--font-body);
	}

	.chat__actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.over {
		color: #c0392b;
		font-weight: 800;
	}

	.hearts {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: visible;
	}

	.heart {
		position: absolute;
		bottom: 8px;
		color: var(--pink-500);
		font-size: 18px;
		animation: retro-float 0.9s ease-out forwards;
	}

	@media (max-width: 640px) {
		.chat__list {
			min-height: 140px;
			max-height: min(38dvh, 320px);
		}
	}
</style>
