<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Difficulty } from '$lib/types/quiz';
	import { DEFAULT_TOPICS, DIFFICULTIES } from '$lib/topics';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Alert from '$lib/components/Alert.svelte';

	let { data }: { data: PageData } = $props();

	let selected = $state<string[]>([...DEFAULT_TOPICS]);
	let difficulty = $state<Difficulty>('expert');
	let generating = $state(false);
	let errorMsg = $state('');

	const ready = $derived(data.supabaseConfigured && data.openaiConfigured);

	const STAGES = [
		'Designing 30 multiple-choice questions…',
		'Crafting 10 short-answer questions…',
		'Adding a coding challenge…',
		'Writing the ~1000-word reading section…',
		'Preparing comprehension questions…',
		'Almost there — assembling your quiz…'
	];
	let stageIndex = $state(0);
	let stageTimer: ReturnType<typeof setInterval> | null = null;

	function toggle(topic: string) {
		selected = selected.includes(topic)
			? selected.filter((t) => t !== topic)
			: [...selected, topic];
	}

	function startStages() {
		stageIndex = 0;
		stageTimer = setInterval(() => {
			if (stageIndex < STAGES.length - 1) stageIndex += 1;
		}, 7000);
	}
	function stopStages() {
		if (stageTimer) clearInterval(stageTimer);
		stageTimer = null;
	}
	onDestroy(stopStages);

	async function generate() {
		if (generating) return;
		errorMsg = '';
		generating = true;
		startStages();
		try {
			const res = await fetch('/api/quiz/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					topics: selected.length ? selected : [...DEFAULT_TOPICS],
					difficulty
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(body.message || `Generation failed (${res.status}).`);
			}
			const { id } = (await res.json()) as { id: string };
			await goto(`/quiz/${id}`);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Something went wrong generating the quiz.';
			generating = false;
			stopStages();
		}
	}
</script>

<PageHeader title="Generate a new quiz" subtitle="A difficult, interview-level quiz tailored to your topics." />

{#if !ready}
	<Alert tone="warning" title="Configuration needed">
		{#if !data.openaiConfigured}<p>Set <code class="rounded bg-surface-2 px-1">OPENAI_API_KEY</code> to enable generation.</p>{/if}
		{#if !data.supabaseConfigured}<p>Set <code class="rounded bg-surface-2 px-1">SUPABASE_URL</code> and <code class="rounded bg-surface-2 px-1">SUPABASE_SERVICE_ROLE_KEY</code> to store quizzes.</p>{/if}
	</Alert>
{/if}

{#if generating}
	<Card class="flex flex-col items-center gap-5 py-14 text-center">
		<svg class="animate-spin text-primary" width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.2" />
			<path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
		</svg>
		<div>
			<p class="text-lg font-semibold text-foreground">{STAGES[stageIndex]}</p>
			<p class="mt-1 text-sm text-muted">This usually takes 30–90 seconds. Please keep this tab open.</p>
		</div>
		<div class="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
			<div
				class="h-full rounded-full bg-primary transition-all duration-700"
				style={`width: ${((stageIndex + 1) / STAGES.length) * 100}%`}
			></div>
		</div>
	</Card>
{:else}
	{#if errorMsg}
		<div class="mb-6"><Alert tone="danger" title="Generation failed">{errorMsg}</Alert></div>
	{/if}

	<div class="space-y-6">
		<Card>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="font-semibold text-foreground">Topics</h2>
				<div class="flex gap-2">
					<button
						type="button"
						class="text-xs font-medium text-primary hover:underline"
						onclick={() => (selected = [...DEFAULT_TOPICS])}>Select all</button
					>
					<button
						type="button"
						class="text-xs font-medium text-muted hover:underline"
						onclick={() => (selected = [])}>Clear</button
					>
				</div>
			</div>
			<p class="mb-4 text-sm text-muted">
				Questions are distributed across the selected topics. Uploaded source materials
				influence Finance/History and any relevant areas automatically.
			</p>
			<div class="flex flex-wrap gap-2">
				{#each DEFAULT_TOPICS as topic (topic)}
					{@const active = selected.includes(topic)}
					<button
						type="button"
						onclick={() => toggle(topic)}
						aria-pressed={active}
						class="rounded-full border px-3 py-1.5 text-sm font-medium transition {active
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-surface text-muted hover:border-primary/50 hover:text-foreground'}"
					>
						{topic}
					</button>
				{/each}
			</div>
		</Card>

		<Card>
			<h2 class="mb-3 font-semibold text-foreground">Difficulty</h2>
			<div class="inline-flex rounded-lg border border-border p-1">
				{#each DIFFICULTIES as level (level)}
					<button
						type="button"
						onclick={() => (difficulty = level)}
						class="rounded-md px-4 py-1.5 text-sm font-medium capitalize transition {difficulty ===
						level
							? 'bg-primary text-primary-foreground'
							: 'text-muted hover:text-foreground'}"
					>
						{level}
					</button>
				{/each}
			</div>
		</Card>

		<div class="flex items-center gap-3">
			<Button size="lg" onclick={generate} disabled={!ready || selected.length === 0}>
				Generate quiz
			</Button>
			<span class="text-sm text-muted">{selected.length} topic{selected.length === 1 ? '' : 's'} selected</span>
		</div>
	</div>
{/if}
