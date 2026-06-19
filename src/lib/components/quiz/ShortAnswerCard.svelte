<script lang="ts">
	import type { PublicShortAnswerQuestion } from '$lib/quiz-public';
	import Badge from '../Badge.svelte';
	import Markdown from '../Markdown.svelte';

	let {
		question,
		index,
		value,
		onchange
	}: {
		question: PublicShortAnswerQuestion;
		index: number;
		value: string;
		onchange: (value: string) => void;
	} = $props();
</script>

<div class="scroll-mt-24 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6" id={`q-${question.id}`}>
	<div class="mb-3 flex items-start justify-between gap-3">
		<div class="flex gap-3">
			<span class="text-sm font-semibold text-muted">{index}.</span>
			<Markdown content={question.question} class="min-w-0 flex-1 font-medium leading-relaxed" />
		</div>
		{#if question.is_coding_question}
			<Badge tone="primary">Coding</Badge>
		{/if}
	</div>

	<label class="sr-only" for={`ta-${question.id}`}>Your answer to question {index}</label>
	<textarea
		id={`ta-${question.id}`}
		class="min-h-32 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-foreground placeholder:text-muted focus-visible:border-primary"
		placeholder="Write your answer (about one paragraph)…"
		value={value}
		oninput={(e) => onchange(e.currentTarget.value)}
	></textarea>
</div>
