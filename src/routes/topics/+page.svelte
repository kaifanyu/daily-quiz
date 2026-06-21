<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Card from '$lib/components/Card.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Alert from '$lib/components/Alert.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Effective category mix: weights are relative and normalized across the
	// categories that can actually contribute (enabled, positive weight, ≥1 topic).
	const usableTotalWeight = $derived(
		data.categories
			.filter((c) => c.enabled && c.weight > 0 && c.topics.length > 0)
			.reduce((a, c) => a + c.weight, 0)
	);

	function sharePct(c: PageData['categories'][number]): number | null {
		if (!c.enabled || c.weight <= 0 || c.topics.length === 0 || usableTotalWeight <= 0) return null;
		return Math.round((c.weight / usableTotalWeight) * 100);
	}

	const inputCls =
		'rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus-visible:border-primary';
	const btnPrimary =
		'inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';
	const btnGhost =
		'inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-foreground';
	const btnDanger =
		'inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger-soft';
</script>

<PageHeader
	title="Topic bank"
	subtitle="Curate what you get quizzed on. Categories set the mix (e.g. 20% RL, 30% C++); topics carry their own weight within a category. Weights are relative — they don't need to add up to 100."
/>

{#if !data.configured}
	<Alert tone="warning" title="Supabase is not configured">
		Configure Supabase to manage your topic bank.
	</Alert>
{/if}

{#if form?.message}
	<div class="mb-6"><Alert tone="danger" title="Couldn't save">{form.message}</Alert></div>
{:else if form?.success}
	<div class="mb-6"><Alert tone="info" title="Saved ✓">Your topic bank was updated.</Alert></div>
{/if}

<!-- Add a category -->
<Card class="mb-6">
	<h2 class="mb-3 font-semibold text-foreground">Add a category</h2>
	<form method="POST" action="?/addCategory" use:enhance class="flex flex-wrap items-end gap-3">
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-xs font-medium text-muted">Name</span>
			<input name="name" required placeholder="Reinforcement Learning" class="{inputCls} w-64" />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-xs font-medium text-muted">Weight</span>
			<input name="weight" type="number" min="0" step="any" value="1" class="{inputCls} w-24" />
		</label>
		<button type="submit" disabled={!data.configured} class={btnPrimary}>Add category</button>
	</form>
</Card>

{#if data.categories.length === 0}
	<p class="text-sm text-muted">No categories yet. Add one above to start building your bank.</p>
{/if}

<div class="space-y-6">
	{#each data.categories as cat (cat.id)}
		{@const pct = sharePct(cat)}
		<Card>
			<!-- Category settings -->
			<form
				method="POST"
				action="?/updateCategory"
				use:enhance
				class="mb-4 flex flex-wrap items-end gap-3 border-b border-border pb-4"
			>
				<input type="hidden" name="id" value={cat.id} />
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-xs font-medium text-muted">Category</span>
					<input name="name" value={cat.name} required class="{inputCls} w-56 font-medium" />
				</label>
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-xs font-medium text-muted">Weight</span>
					<input
						name="weight"
						type="number"
						min="0"
						step="any"
						value={cat.weight}
						class="{inputCls} w-24"
					/>
				</label>
				<label class="flex items-center gap-2 pb-1.5 text-sm text-foreground">
					<input
						type="checkbox"
						name="enabled"
						checked={cat.enabled}
						class="h-4 w-4 rounded border-border"
					/>
					Enabled
				</label>
				<div class="flex items-center gap-2 pb-1">
					{#if pct !== null}
						<Badge tone="primary">{pct}% of mix</Badge>
					{:else}
						<Badge>not in mix</Badge>
					{/if}
					<Badge>{cat.topics.length} topic{cat.topics.length === 1 ? '' : 's'}</Badge>
				</div>
				<div class="ml-auto flex items-center gap-2">
					<button type="submit" disabled={!data.configured} class={btnPrimary}>Save</button>
				</div>
			</form>

			<form
				method="POST"
				action="?/deleteCategory"
				use:enhance={({ cancel }) => {
					if (!confirm(`Delete "${cat.name}" and all its topics?`)) cancel();
				}}
				class="-mt-2 mb-4 text-right"
			>
				<input type="hidden" name="id" value={cat.id} />
				<button type="submit" disabled={!data.configured} class={btnDanger}>Delete category</button>
			</form>

			<!-- Existing topics -->
			{#if cat.topics.length > 0}
				<div class="mb-4 space-y-2">
					{#each cat.topics as topic (topic.id)}
						<details class="rounded-lg border border-border">
							<summary class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
								<span class="font-medium text-foreground">{topic.name}</span>
								<span class="text-xs text-muted">w {topic.weight}</span>
								{#if !topic.enabled}<Badge tone="warning">disabled</Badge>{/if}
								{#if topic.subtopics.length > 0}
									<span class="ml-auto truncate text-xs text-muted"
										>{topic.subtopics.join(', ')}</span
									>
								{/if}
							</summary>

							<form
								method="POST"
								action="?/updateTopic"
								use:enhance
								class="space-y-3 border-t border-border p-3"
							>
								<input type="hidden" name="id" value={topic.id} />
								<div class="flex flex-wrap items-end gap-3">
									<label class="flex flex-col gap-1 text-sm">
										<span class="text-xs font-medium text-muted">Topic</span>
										<input name="name" value={topic.name} required class="{inputCls} w-64" />
									</label>
									<label class="flex flex-col gap-1 text-sm">
										<span class="text-xs font-medium text-muted">Weight</span>
										<input
											name="weight"
											type="number"
											min="0"
											step="any"
											value={topic.weight}
											class="{inputCls} w-24"
										/>
									</label>
									<label class="flex items-center gap-2 pb-1.5 text-sm text-foreground">
										<input
											type="checkbox"
											name="enabled"
											checked={topic.enabled}
											class="h-4 w-4 rounded border-border"
										/>
										Enabled
									</label>
								</div>

								<label class="block text-sm">
									<span class="text-xs font-medium text-muted"
										>Subtopics / facets (one per line — a rotating subset is used each quiz)</span
									>
									<textarea
										name="subtopics"
										rows="3"
										class="{inputCls} mt-1 w-full resize-y font-mono text-xs"
										>{topic.subtopics.join('\n')}</textarea
									>
								</label>

								<label class="block text-sm">
									<span class="text-xs font-medium text-muted">Angle / focus (optional)</span>
									<input
										name="angle"
										value={topic.angle ?? ''}
										placeholder="edge cases & failure modes"
										class="{inputCls} mt-1 w-full"
									/>
								</label>

								<label class="block text-sm">
									<span class="text-xs font-medium text-muted"
										>Personal note / context (optional)</span
									>
									<textarea
										name="personal_note"
										rows="2"
										placeholder="e.g. preparing for a research-engineer interview"
										class="{inputCls} mt-1 w-full resize-y">{topic.personal_note ?? ''}</textarea
									>
								</label>

								<label class="block text-sm">
									<span class="text-xs font-medium text-muted"
										>Keep getting wrong (one per line — reinforced in questions)</span
									>
									<textarea
										name="keep_getting_wrong"
										rows="2"
										class="{inputCls} mt-1 w-full resize-y font-mono text-xs"
										>{topic.keep_getting_wrong.join('\n')}</textarea
									>
								</label>

								<div class="flex items-center gap-2">
									<button type="submit" disabled={!data.configured} class={btnPrimary}
										>Save topic</button
									>
									<button
										type="submit"
										formaction="?/deleteTopic"
										disabled={!data.configured}
										class={btnGhost}
										onclick={(e) => {
											if (!confirm(`Delete "${topic.name}"?`)) e.preventDefault();
										}}
									>
										Delete
									</button>
								</div>
							</form>
						</details>
					{/each}
				</div>
			{/if}

			<!-- Bulk add topics -->
			<form method="POST" action="?/addTopics" use:enhance class="space-y-2">
				<input type="hidden" name="category_id" value={cat.id} />
				<label class="block text-sm">
					<span class="text-xs font-medium text-muted"
						>Add topics — one per line, optional <code class="rounded bg-surface-2 px-1"
							>| weight</code
						> suffix</span
					>
					<textarea
						name="bulk"
						rows="3"
						placeholder={'Temporal-difference learning\nPolicy gradients | 2\nExploration vs exploitation'}
						class="{inputCls} mt-1 w-full resize-y font-mono text-xs"></textarea>
				</label>
				<button type="submit" disabled={!data.configured} class={btnPrimary}>Add topics</button>
			</form>
		</Card>
	{/each}
</div>
