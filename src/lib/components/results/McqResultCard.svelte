<script lang="ts">
	import type { MCQQuestion, McqResult } from '$lib/types/quiz';
	import Badge from '../Badge.svelte';
	import Markdown from '../Markdown.svelte';

	let {
		question,
		result,
		index
	}: { question: MCQQuestion; result: McqResult; index: number } = $props();

	const skipped = $derived(result.selected_choice_id === null);
</script>

<div
	class="rounded-xl border bg-surface p-5 shadow-sm sm:p-6 {result.is_correct
		? 'border-border'
		: 'border-danger/40'}"
>
	<div class="mb-4 flex items-start justify-between gap-3">
		<div class="flex gap-3">
			<span class="text-sm font-semibold text-muted">{index}.</span>
			<Markdown content={question.question} class="min-w-0 flex-1 font-medium leading-relaxed" />
		</div>
		{#if result.is_correct}
			<Badge tone="success">Correct</Badge>
		{:else if skipped}
			<Badge tone="warning">Skipped</Badge>
		{:else}
			<Badge tone="danger">Incorrect</Badge>
		{/if}
	</div>

	<div class="space-y-2">
		{#each question.choices as choice (choice.id)}
			{@const isCorrect = choice.id === result.correct_choice_id}
			{@const isSelectedWrong =
				choice.id === result.selected_choice_id && !result.is_correct}
			<div
				class="flex items-start gap-3 rounded-lg border p-3 {isCorrect
					? 'border-success/50 bg-success-soft'
					: isSelectedWrong
						? 'border-danger/50 bg-danger-soft'
						: 'border-border'}"
			>
				<span
					class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold {isCorrect
						? 'border-success bg-success text-white'
						: isSelectedWrong
							? 'border-danger bg-danger text-white'
							: 'border-border text-muted'}"
				>
					{choice.id}
				</span>
				<span class="text-sm leading-relaxed text-foreground">{choice.text}</span>
				<span class="ml-auto whitespace-nowrap text-xs font-medium">
					{#if isCorrect}<span class="text-success">Correct answer</span>{/if}
					{#if isSelectedWrong}<span class="text-danger">Your answer</span>{/if}
				</span>
			</div>
		{/each}
	</div>

	<div class="mt-4 rounded-lg bg-surface-2 p-4 text-sm leading-relaxed text-foreground">
		<span class="font-semibold">Why:</span>
		{result.explanation}
	</div>
</div>
