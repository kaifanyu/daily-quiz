<script lang="ts">
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import QuizListItem from '$lib/components/QuizListItem.svelte';

	let { data }: { data: PageData } = $props();
</script>

<PageHeader title="Quiz history" subtitle="Every quiz you've generated, newest first.">
	{#snippet actions()}
		<Button href="/quiz/new">Generate quiz</Button>
	{/snippet}
</PageHeader>

{#if !data.configured}
	<Alert tone="warning" title="Supabase is not configured">
		Configure Supabase to see your quiz history.
	</Alert>
{:else if data.error}
	<Alert tone="danger" title="Couldn't load history">{data.error}</Alert>
{:else if data.history.length === 0}
	<EmptyState title="No quizzes yet" description="Your generated quizzes will show up here.">
		<Button href="/quiz/new">Generate your first quiz</Button>
	</EmptyState>
{:else}
	<div class="space-y-3">
		{#each data.history as item (item.quiz_id)}
			<QuizListItem {item} />
		{/each}
	</div>
{/if}
