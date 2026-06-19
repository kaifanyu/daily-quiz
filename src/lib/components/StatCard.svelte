<script lang="ts">
	let {
		label,
		value,
		sub = ''
	}: { label: string; value: string | number; sub?: string } = $props();
</script>

<div class="rounded-xl border border-border bg-surface p-5 shadow-sm">
	<p class="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
	<p class="mt-2 text-3xl font-bold text-foreground">{value}</p>
	{#if sub}
		<p class="mt-1 text-sm text-muted">{sub}</p>
	{/if}
</div>
