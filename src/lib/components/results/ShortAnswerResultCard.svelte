<script lang="ts">
	import type { ShortAnswerQuestion, ShortAnswerResult } from '$lib/types/quiz';
	import Badge from '../Badge.svelte';
	import Markdown from '../Markdown.svelte';

	let {
		question,
		result,
		index
	}: { question: ShortAnswerQuestion; result: ShortAnswerResult; index: number } = $props();

	const blank = $derived(!result.user_answer || result.user_answer.trim().length === 0);
</script>

<div class="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
	<div class="mb-4 flex items-start justify-between gap-3">
		<div class="flex gap-3">
			<span class="text-sm font-semibold text-muted">{index}.</span>
			<Markdown content={question.question} class="min-w-0 flex-1 font-medium leading-relaxed" />
		</div>
		{#if question.is_coding_question}
			<Badge tone="primary">Coding</Badge>
		{/if}
	</div>

	<div class="space-y-4">
		<div>
			<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Your answer</p>
			{#if blank}
				<p class="text-sm italic text-muted">(left blank)</p>
			{:else}
				<p class="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-foreground">{result.user_answer}</p>
			{/if}
		</div>

		<div class="rounded-lg border border-border bg-surface-2 p-4">
			<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Model ideal answer</p>
			<Markdown content={question.ideal_answer} class="text-sm" />
		</div>
	</div>
</div>
