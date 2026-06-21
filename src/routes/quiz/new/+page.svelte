<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Difficulty } from '$lib/types/quiz';
	import { DIFFICULTIES } from '$lib/topics';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Alert from '$lib/components/Alert.svelte';

	let { data }: { data: PageData } = $props();

	const hasBank = $derived(data.bank.length > 0);

	let count = $state(8);
	let difficulty = $state<Difficulty>('expert');
	let generating = $state(false);
	let errorMsg = $state('');

	const ready = $derived(data.supabaseConfigured && data.openaiConfigured);
	const canGenerate = $derived(ready && hasBank && !generating);

	const STAGES = [
		'Designing 30 multiple-choice questions…',
		'Crafting 10 short-answer questions…',
		'Adding a coding challenge…',
		'Almost there — assembling your quiz…'
	];
	let stageIndex = $state(0);
	let stageTimer: ReturnType<typeof setInterval> | null = null;

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
				body: JSON.stringify({ count, difficulty })
			});
			if (!res.ok) {
				const payload = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(payload.message || `Generation failed (${res.status}).`);
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

<PageHeader
	title="Generate a new quiz"
	subtitle="A difficult, interview-level quiz drawn from your topic bank."
/>

{#if !ready}
	<Alert tone="warning" title="Configuration needed">
		{#if !data.openaiConfigured}<p>
				Set <code class="rounded bg-surface-2 px-1">OPENAI_API_KEY</code> to enable generation.
			</p>{/if}
		{#if !data.supabaseConfigured}<p>
				Set <code class="rounded bg-surface-2 px-1">SUPABASE_URL</code> and
				<code class="rounded bg-surface-2 px-1">SUPABASE_SERVICE_ROLE_KEY</code> to store quizzes.
			</p>{/if}
	</Alert>
{/if}

{#if generating}
	<Card class="flex flex-col items-center gap-5 py-14 text-center">
		<svg
			class="animate-spin text-primary"
			width="40"
			height="40"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.2" />
			<path
				d="M12 2a10 10 0 0 1 10 10"
				stroke="currentColor"
				stroke-width="3"
				stroke-linecap="round"
			/>
		</svg>
		<div>
			<p class="text-lg font-semibold text-foreground">{STAGES[stageIndex]}</p>
			<p class="mt-1 text-sm text-muted">
				This usually takes 30–90 seconds. Please keep this tab open.
			</p>
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
			{#if !hasBank}
				<Alert tone="info" title="Your topic bank is empty">
					Add categories and topics on the <a class="font-medium underline" href="/topics">Topics</a
					>
					page, then come back to generate a quiz.
				</Alert>
			{:else}
				<p class="mb-4 text-sm text-muted">
					Topics are drawn at random from your bank, weighted by category and topic. Manage the mix
					on the <a class="font-medium underline" href="/topics">Topics</a> page.
				</p>

				<div class="mb-5 space-y-2">
					{#each data.bank as cat (cat.name)}
						<div class="flex items-center gap-3">
							<span class="w-40 shrink-0 truncate text-sm font-medium text-foreground"
								>{cat.name}</span
							>
							<div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
								<div
									class="h-full rounded-full bg-primary"
									style={`width: ${cat.share * 100}%`}
								></div>
							</div>
							<span class="w-28 shrink-0 text-right text-xs text-muted">
								{Math.round(cat.share * 100)}% · {cat.topicCount} topic{cat.topicCount === 1
									? ''
									: 's'}
							</span>
						</div>
					{/each}
				</div>

				<label class="flex items-center gap-3 text-sm">
					<span class="font-medium text-foreground">Topics per quiz</span>
					<input
						type="number"
						min="1"
						max={Math.max(1, data.bankTopicTotal)}
						bind:value={count}
						class="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus-visible:border-primary"
					/>
					<span class="text-muted"
						>drawn across {data.bank.length} categor{data.bank.length === 1 ? 'y' : 'ies'}</span
					>
				</label>
			{/if}
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
			<Button size="lg" onclick={generate} disabled={!canGenerate}>Generate quiz</Button>
			<span class="text-sm text-muted">{count} topic{count === 1 ? '' : 's'} from your bank</span>
		</div>
	</div>
{/if}
