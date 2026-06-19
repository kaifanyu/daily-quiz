<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		class: klass = '',
		padding = 'p-6',
		children
	}: { class?: string; padding?: string; children: Snippet } = $props();
</script>

<div class="rounded-xl border border-border bg-surface shadow-sm {padding} {klass}">
	{@render children()}
</div>
