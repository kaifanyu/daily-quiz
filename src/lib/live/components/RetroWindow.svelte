<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		accent?: 'pink' | 'lavender' | 'mint';
		/** Optional controls rendered on the right of the title bar. */
		actions?: Snippet;
		/** Removes body padding, e.g. for a video that should reach the edges. */
		flush?: boolean;
		children: Snippet;
	}

	let { title, accent = 'pink', actions, flush = false, children }: Props = $props();
</script>

<section class="win win--{accent}">
	<header class="win__bar">
		<span class="win__dots" aria-hidden="true">
			<i></i><i></i><i></i>
		</span>
		<h2 class="win__title">{title}</h2>
		<span class="win__actions">
			{#if actions}{@render actions()}{/if}
		</span>
	</header>
	<div class="win__body" class:win__body--flush={flush}>
		{@render children()}
	</div>
</section>

<style>
	.win {
		border: var(--border);
		border-radius: var(--radius);
		background: var(--paper);
		box-shadow: var(--pop);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.win__bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-bottom: var(--border);
		background: linear-gradient(180deg, var(--pink-300), var(--pink-200));
	}

	.win--lavender .win__bar {
		background: linear-gradient(180deg, var(--lav-400), var(--lav-200));
	}

	.win--mint .win__bar {
		background: linear-gradient(180deg, var(--mint), #dffaf2);
	}

	.win__dots {
		display: inline-flex;
		gap: 4px;
		flex: none;
	}

	.win__dots i {
		width: 9px;
		height: 9px;
		border: 2px solid var(--ink);
		border-radius: 50%;
		background: var(--paper);
	}

	.win__dots i:nth-child(2) {
		background: var(--butter);
	}

	.win__dots i:nth-child(3) {
		background: var(--mint);
	}

	.win__title {
		flex: 1 1 auto;
		min-width: 0;
		font-size: 10px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.win__actions {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex: none;
	}

	.win__body {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 0;
		flex: 1 1 auto;
	}

	.win__body--flush {
		padding: 0;
		gap: 0;
	}
</style>
