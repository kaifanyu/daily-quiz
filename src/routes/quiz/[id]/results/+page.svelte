<script lang="ts">
	import type { PageData } from './$types';
	import Card from '$lib/components/Card.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import McqResultCard from '$lib/components/results/McqResultCard.svelte';
	import ShortAnswerResultCard from '$lib/components/results/ShortAnswerResultCard.svelte';
	import WeakTopicCard from '$lib/components/results/WeakTopicCard.svelte';
	import ReadingView from '$lib/components/results/ReadingView.svelte';
	import { formatDate, pct } from '$lib/format';

	let { data }: { data: PageData } = $props();
	const quiz = $derived(data.quiz);
	const evaluation = $derived(data.evaluation);

	const mcqById = $derived(new Map(quiz.mcq_questions.map((q) => [q.id, q])));
	const saById = $derived(new Map(quiz.short_answer_questions.map((q) => [q.id, q])));
	const accuracy = $derived(
		evaluation.mcq_total > 0 ? evaluation.mcq_correct / evaluation.mcq_total : null
	);
</script>

<div class="mb-6">
	<a href="/" class="text-sm font-medium text-primary hover:underline">← Dashboard</a>
	<h1 class="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{quiz.title}</h1>
	<p class="mt-1 text-sm text-muted">Completed {formatDate(data.submission.created_at)}</p>
	<div class="mt-3 flex flex-wrap items-center gap-2">
		<Badge tone="primary" class="capitalize">{quiz.difficulty}</Badge>
		<Badge tone="neutral">MCQ {evaluation.mcq_correct}/{evaluation.mcq_total} · {pct(accuracy)}</Badge>
	</div>
</div>

<!-- Overall summary -->
<Card class="mb-8">
	<p class="text-xs font-semibold uppercase tracking-wide text-muted">Summary</p>
	<p class="mt-2 leading-relaxed text-foreground">{evaluation.overall_summary}</p>
</Card>

<!-- Weak topics -->
{#if evaluation.weak_topics.length > 0}
	<section class="mb-10">
		<h2 class="mb-4 text-lg font-semibold text-foreground">Weak topics to review</h2>
		<div class="grid gap-4 md:grid-cols-2">
			{#each evaluation.weak_topics as topic, i (i)}
				<WeakTopicCard {topic} />
			{/each}
		</div>
	</section>
{/if}

<!-- Short answer feedback (the heart of the learning experience) -->
<section class="mb-10">
	<h2 class="mb-4 text-lg font-semibold text-foreground">Short-answer feedback</h2>
	<div class="space-y-4">
		{#each evaluation.short_answer_results as result, i (result.question_id)}
			{@const q = saById.get(result.question_id)}
			{#if q}
				<ShortAnswerResultCard question={q} {result} index={i + 1} />
			{/if}
		{/each}
	</div>
</section>

<!-- Reading section (revealed after submission) -->
{#if quiz.reading}
	<section class="mb-10">
		<h2 class="mb-4 text-lg font-semibold text-foreground">Reading</h2>
		<ReadingView reading={quiz.reading} />
	</section>
{/if}

<!-- Multiple choice review -->
<section class="mb-10">
	<h2 class="mb-4 text-lg font-semibold text-foreground">Multiple-choice review</h2>
	<div class="space-y-4">
		{#each evaluation.mcq_results as result, i (result.question_id)}
			{@const q = mcqById.get(result.question_id)}
			{#if q}
				<McqResultCard question={q} {result} index={i + 1} />
			{/if}
		{/each}
	</div>
</section>

<div class="flex flex-wrap gap-3">
	<Button href="/quiz/new" size="lg">Generate another quiz</Button>
	<Button href="/history" variant="secondary">View history</Button>
</div>
