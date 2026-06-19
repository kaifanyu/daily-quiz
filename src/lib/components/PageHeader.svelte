<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle = '',
		actions
	}: { title: string; subtitle?: string; actions?: Snippet } = $props();
</script>

<div class="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
		{#if subtitle}
			<p class="mt-1.5 text-sm text-muted sm:text-base">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-shrink-0 items-center gap-2">{@render actions()}</div>
	{/if}
</div>
