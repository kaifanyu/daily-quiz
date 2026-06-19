<script lang="ts">
	import type { QuizHistoryItem } from '$lib/types/quiz';
	import { formatDate } from '$lib/format';
	import Badge from './Badge.svelte';

	let { item }: { item: QuizHistoryItem } = $props();

	const href = $derived(item.submitted ? `/quiz/${item.quiz_id}/results` : `/quiz/${item.quiz_id}`);
</script>

<a
	{href}
	class="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
>
	<div class="min-w-0">
		<p class="truncate font-semibold text-foreground">{item.title}</p>
		<p class="mt-0.5 text-xs text-muted">{formatDate(item.created_at)}</p>
		<div class="mt-2 flex flex-wrap gap-1.5">
			{#each item.topics.slice(0, 4) as topic (topic)}
				<Badge>{topic}</Badge>
			{/each}
			{#if item.topics.length > 4}
				<Badge>+{item.topics.length - 4}</Badge>
			{/if}
		</div>
	</div>

	<div class="flex flex-shrink-0 items-center gap-3">
		{#if item.submitted}
			{#if item.mcq_total}
				<span class="text-sm font-medium text-muted">
					MCQ {item.mcq_correct}/{item.mcq_total}
				</span>
			{/if}
			<Badge tone="success">Completed</Badge>
		{:else}
			<Badge tone="warning">Not submitted</Badge>
		{/if}
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted" aria-hidden="true">
			<path d="m9 18 6-6-6-6" />
		</svg>
	</div>
</a>
