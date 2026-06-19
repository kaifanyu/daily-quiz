<script lang="ts">
	import type { PublicMCQQuestion } from '$lib/quiz-public';
	import type { ChoiceId } from '$lib/types/quiz';
	import Markdown from '../Markdown.svelte';

	let {
		question,
		index,
		selected,
		onselect
	}: {
		question: PublicMCQQuestion;
		index: number;
		selected: ChoiceId | null;
		onselect: (id: ChoiceId) => void;
	} = $props();
</script>

<fieldset
	class="scroll-mt-24 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
	id={`q-${question.id}`}
>
	<legend class="sr-only">Multiple choice question {index}</legend>
	<div class="mb-4 flex gap-3">
		<span class="text-sm font-semibold text-muted">{index}.</span>
		<Markdown content={question.question} class="min-w-0 flex-1 font-medium leading-relaxed" />
	</div>

	<div class="space-y-2.5">
		{#each question.choices as choice (choice.id)}
			{@const isSel = selected === choice.id}
			<label
				class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition {isSel
					? 'border-primary bg-primary/5 ring-1 ring-primary'
					: 'border-border hover:border-primary/50 hover:bg-surface-2'}"
			>
				<input
					type="radio"
					name={question.id}
					value={choice.id}
					checked={isSel}
					onchange={() => onselect(choice.id)}
					class="sr-only"
				/>
				<span
					class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold {isSel
						? 'border-primary bg-primary text-primary-foreground'
						: 'border-border text-muted'}"
				>
					{choice.id}
				</span>
				<span class="text-sm leading-relaxed text-foreground">{choice.text}</span>
			</label>
		{/each}
	</div>
</fieldset>
