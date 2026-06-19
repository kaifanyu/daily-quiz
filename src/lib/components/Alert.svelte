<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		tone = 'info',
		title = '',
		children
	}: { tone?: 'info' | 'warning' | 'danger'; title?: string; children: Snippet } = $props();

	const tones: Record<string, string> = {
		info: 'border-primary/30 bg-primary/5',
		warning: 'border-warning/40 bg-warning-soft',
		danger: 'border-danger/40 bg-danger-soft'
	};
</script>

<div class="rounded-xl border p-4 {tones[tone]}">
	{#if title}
		<p class="mb-1 font-semibold text-foreground">{title}</p>
	{/if}
	<div class="text-sm leading-relaxed text-foreground">{@render children()}</div>
</div>
