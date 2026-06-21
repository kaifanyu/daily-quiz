<script lang="ts">
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Button from '$lib/components/Button.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import QuizListItem from '$lib/components/QuizListItem.svelte';
	import { pct } from '$lib/format';

	let { data }: { data: PageData } = $props();

	const dash = $derived(data.data);
	const recent = $derived(dash ? dash.history.slice(0, 6) : []);
</script>

<PageHeader title="Dashboard" subtitle="Your personal daily learning quiz.">
	{#snippet actions()}
		{#if dash?.latest_quiz_id}
			<Button href={`/quiz/${dash.latest_quiz_id}`} variant="secondary" size="md">Latest quiz</Button>
		{/if}
		<Button href="/quiz/new" size="md">Generate quiz</Button>
	{/snippet}
</PageHeader>

{#if !data.configured}
	<Alert tone="warning" title="Supabase is not configured">
		Add <code class="rounded bg-surface-2 px-1">SUPABASE_URL</code> and
		<code class="rounded bg-surface-2 px-1">SUPABASE_SERVICE_ROLE_KEY</code> to your
		<code class="rounded bg-surface-2 px-1">.dev.vars</code> (local) or as Worker secrets, then reload.
		See the README for setup steps.
	</Alert>
{:else if data.error}
	<Alert tone="danger" title="Couldn't load the dashboard">{data.error}</Alert>
{:else if dash}
	<!-- Secondary stats — learning first, score second. -->
	<div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
		<StatCard label="Quizzes" value={dash.stats.total_quizzes} />
		<StatCard label="Completed" value={dash.stats.completed_quizzes} />
		<StatCard
			label="Avg MCQ accuracy"
			value={pct(dash.stats.avg_mcq_accuracy)}
			sub="across completed quizzes"
		/>
	</div>

	<div class="mt-8">
		<!-- Recent quizzes -->
		<section>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-foreground">Recent quizzes</h2>
				<a href="/history" class="text-sm font-medium text-primary hover:underline">View all</a>
			</div>
			{#if recent.length === 0}
				<EmptyState
					title="No quizzes yet"
					description="Generate your first difficult daily quiz to start learning."
				>
					<Button href="/quiz/new">Generate quiz</Button>
				</EmptyState>
			{:else}
				<div class="space-y-3">
					{#each recent as item (item.quiz_id)}
						<QuizListItem {item} />
					{/each}
				</div>
			{/if}
		</section>
	</div>

	<div class="mt-8 flex flex-wrap gap-3">
		<Button href="/sources" variant="secondary">Manage source materials</Button>
		<Button href="/prompts" variant="secondary">Edit AI prompts</Button>
	</div>
{/if}
