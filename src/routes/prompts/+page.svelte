<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import type { PromptName } from '$lib/types/quiz';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Alert from '$lib/components/Alert.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const META: Record<PromptName, { label: string; desc: string }> = {
		quiz_generation: {
			label: 'Quiz generation',
			desc: 'System prompt used to write the multiple-choice and short-answer questions.'
		}
	};
</script>

<PageHeader
	title="AI prompts"
	subtitle="Tune how quizzes are written and evaluated. Saved prompts override the built-in defaults."
/>

{#if !data.configured}
	<Alert tone="warning" title="Supabase is not configured">
		Configure Supabase to save custom prompts. The built-in defaults are shown below.
	</Alert>
{/if}

{#if form?.message}
	<div class="mb-6"><Alert tone="danger" title="Couldn't save">{form.message}</Alert></div>
{/if}

<div class="space-y-6">
	{#each data.prompts as p (p.name + '::' + (p.isCustom ? 'custom' : 'default'))}
		<Card>
			<div class="mb-3 flex items-start justify-between gap-3">
				<div>
					<div class="flex items-center gap-2">
						<h2 class="font-semibold text-foreground">{META[p.name].label}</h2>
						{#if p.isCustom}
							<Badge tone="primary">Customized</Badge>
						{:else}
							<Badge>Default</Badge>
						{/if}
						{#if form?.saved === p.name}<span class="text-xs font-medium text-success">Saved ✓</span>{/if}
						{#if form?.reset === p.name}<span class="text-xs font-medium text-success">Reset to default ✓</span>{/if}
					</div>
					<p class="mt-1 text-sm text-muted">{META[p.name].desc}</p>
				</div>
			</div>

			<!-- Single form; the Reset button overrides the action via formaction. -->
			<form method="POST" action="?/save" use:enhance class="space-y-3">
				<input type="hidden" name="name" value={p.name} />
				<textarea
					name="content"
					rows="10"
					spellcheck="false"
					class="w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground focus-visible:border-primary"
					>{p.content}</textarea
				>
				<div class="flex items-center gap-2">
					<button
						type="submit"
						disabled={!data.configured}
						class="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
					>
						Save
					</button>
					{#if p.isCustom}
						<button
							type="submit"
							formaction="?/reset"
							disabled={!data.configured}
							class="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
						>
							Reset to default
						</button>
					{/if}
				</div>
			</form>
		</Card>
	{/each}
</div>
