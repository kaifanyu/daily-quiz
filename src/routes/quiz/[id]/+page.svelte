<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { ChoiceId, McqAnswers, ShortAnswers } from '$lib/types/quiz';
	import McqCard from '$lib/components/quiz/McqCard.svelte';
	import ShortAnswerCard from '$lib/components/quiz/ShortAnswerCard.svelte';
	import Button from '$lib/components/Button.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import Alert from '$lib/components/Alert.svelte';

	let { data }: { data: PageData } = $props();
	const quiz = $derived(data.quiz);

	let mcqAnswers = $state<McqAnswers>({});
	let shortAnswers = $state<ShortAnswers>({});
	let submitting = $state(false);
	let confirmOpen = $state(false);
	let errorMsg = $state('');

	let mcqAnswered = $derived(quiz.mcq_questions.filter((q) => mcqAnswers[q.id]).length);
	let saAnswered = $derived(
		quiz.short_answer_questions.filter((q) => (shortAnswers[q.id] ?? '').trim().length > 0).length
	);
	let unanswered = $derived(
		quiz.mcq_questions.length - mcqAnswered + (quiz.short_answer_questions.length - saAnswered)
	);

	function selectMcq(qid: string, choice: ChoiceId) {
		mcqAnswers[qid] = choice;
	}
	function setShort(qid: string, value: string) {
		shortAnswers[qid] = value;
	}

	function attemptSubmit() {
		if (submitting) return;
		if (unanswered > 0) {
			confirmOpen = true;
			return;
		}
		void doSubmit();
	}

	async function doSubmit() {
		confirmOpen = false;
		submitting = true;
		errorMsg = '';
		try {
			const res = await fetch(`/api/quiz/${quiz.id}/submit`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ mcq_answers: mcqAnswers, short_answers: shortAnswers })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(body.message || `Submission failed (${res.status}).`);
			}
			await goto(`/quiz/${quiz.id}/results`);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Something went wrong submitting your answers.';
			submitting = false;
		}
	}
</script>

{#if submitting}
	<div class="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
		<svg class="animate-spin text-primary" width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.2" />
			<path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
		</svg>
		<div>
			<p class="text-lg font-semibold text-foreground">Evaluating your answers…</p>
			<p class="mt-1 text-sm text-muted">Grading multiple choice and reviewing your short answers.</p>
		</div>
	</div>
{:else}
	<div class="mb-6">
		<h1 class="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{quiz.title}</h1>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<Badge tone="primary" class="capitalize">{quiz.difficulty}</Badge>
			{#each quiz.topics.slice(0, 6) as topic (topic)}
				<Badge>{topic}</Badge>
			{/each}
		</div>
		<p class="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
			Answer all questions, then submit once at the bottom. Correct answers, explanations,
			short-answer feedback, and the reading section are revealed only after you submit.
		</p>
	</div>

	{#if errorMsg}
		<div class="mb-6"><Alert tone="danger" title="Couldn't submit">{errorMsg}</Alert></div>
	{/if}

	<!-- Section 1: Multiple choice -->
	<section class="mb-10">
		<div class="mb-4 flex items-baseline justify-between">
			<h2 class="text-lg font-semibold text-foreground">Section 1 · Multiple choice</h2>
			<span class="text-sm text-muted">{mcqAnswered}/{quiz.mcq_questions.length} answered</span>
		</div>
		<div class="space-y-4">
			{#each quiz.mcq_questions as q, i (q.id)}
				<McqCard
					question={q}
					index={i + 1}
					selected={mcqAnswers[q.id] ?? null}
					onselect={(choice) => selectMcq(q.id, choice)}
				/>
			{/each}
		</div>
	</section>

	<!-- Section 2: Short answer -->
	<section class="mb-28">
		<div class="mb-4 flex items-baseline justify-between">
			<h2 class="text-lg font-semibold text-foreground">Section 2 · Short answer</h2>
			<span class="text-sm text-muted">{saAnswered}/{quiz.short_answer_questions.length} answered</span>
		</div>
		<div class="space-y-4">
			{#each quiz.short_answer_questions as q, i (q.id)}
				<ShortAnswerCard
					question={q}
					index={i + 1}
					value={shortAnswers[q.id] ?? ''}
					onchange={(v) => setShort(q.id, v)}
				/>
			{/each}
		</div>
	</section>

	<!-- Sticky submit bar -->
	<div class="sticky bottom-4 z-30">
		{#if confirmOpen}
			<div class="mb-3">
				<Alert tone="warning" title={`${unanswered} question${unanswered === 1 ? '' : 's'} unanswered`}>
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<span>You can submit anyway — this is for learning, not scoring.</span>
						<div class="flex gap-2">
							<Button variant="secondary" size="sm" onclick={() => (confirmOpen = false)}>Keep working</Button>
							<Button size="sm" onclick={doSubmit}>Submit anyway</Button>
						</div>
					</div>
				</Alert>
			</div>
		{/if}
		<Card padding="p-4" class="flex items-center justify-between shadow-lg">
			<div class="text-sm text-muted">
				<span class="font-medium text-foreground">{mcqAnswered + saAnswered}</span>
				/ {quiz.mcq_questions.length + quiz.short_answer_questions.length} answered
			</div>
			<Button size="lg" onclick={attemptSubmit} loading={submitting}>Submit quiz</Button>
		</Card>
	</div>
{/if}
