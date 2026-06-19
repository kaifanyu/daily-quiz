<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description = '',
		children
	}: { title: string; description?: string; children?: Snippet } = $props();
</script>

<div class="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
	<h3 class="text-base font-semibold text-foreground">{title}</h3>
	{#if description}
		<p class="mx-auto mt-1.5 max-w-md text-sm text-muted">{description}</p>
	{/if}
	{#if children}
		<div class="mt-5 flex justify-center">{@render children()}</div>
	{/if}
</div>
