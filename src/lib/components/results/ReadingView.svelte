<script lang="ts">
	import type { ReadingSection } from '$lib/types/quiz';
	import Markdown from '../Markdown.svelte';

	let { reading }: { reading: ReadingSection } = $props();
</script>

<div class="space-y-6">
	<article class="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
		<h2 class="mb-4 text-2xl font-bold text-foreground">{reading.title}</h2>
		<Markdown content={reading.body_markdown} />
	</article>

	{#if reading.comprehension_questions.length > 0}
		<div>
			<h3 class="mb-3 text-lg font-semibold text-foreground">Comprehension questions</h3>
			<div class="space-y-3">
				{#each reading.comprehension_questions as q, i (q.id)}
					<div class="rounded-xl border border-border bg-surface p-5 shadow-sm">
						<div class="flex gap-3">
							<span class="text-sm font-semibold text-muted">{i + 1}.</span>
							<Markdown content={q.question} class="min-w-0 flex-1 font-medium leading-relaxed" />
						</div>
						<details class="group mt-3">
							<summary class="cursor-pointer text-xs font-medium text-primary hover:underline">
								Reveal expected answer
							</summary>
							<div class="mt-2 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-foreground">
								<Markdown content={q.expected_answer} class="text-sm" />
							</div>
						</details>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
