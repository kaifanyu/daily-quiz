<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let creating = $state(false);
</script>

<PageHeader
	title="Source materials"
	subtitle="Upload notes, papers, and book excerpts to ground quiz generation."
/>

{#if !data.configured}
	<Alert tone="warning" title="Supabase is not configured">
		Configure Supabase to upload and manage source materials.
	</Alert>
{:else}
	{#if !data.openaiConfigured}
		<div class="mb-6">
			<Alert tone="info" title="AI summarization disabled">
				Without <code class="rounded bg-surface-2 px-1">OPENAI_API_KEY</code>, materials are stored
				as-is (no auto summary/tags). They're still used as quiz context.
			</Alert>
		</div>
	{/if}

	{#if form?.message}
		<div class="mb-6"><Alert tone="danger" title="Couldn't save">{form.message}</Alert></div>
	{/if}

	<div class="grid gap-8 lg:grid-cols-5">
		<!-- Upload form -->
		<section class="lg:col-span-2">
			<Card>
				<h2 class="mb-4 font-semibold text-foreground">Add material</h2>
				<form
					method="POST"
					action="?/create"
					enctype="multipart/form-data"
					use:enhance={() => {
						creating = true;
						return async ({ result, update }) => {
							await update();
							creating = false;
							if (result.type === 'success') {
								/* form resets automatically on success */
							}
						};
					}}
					class="space-y-4"
				>
					<div>
						<label for="title" class="mb-1 block text-sm font-medium text-foreground">Title</label>
						<input
							id="title"
							name="title"
							required
							value={form && 'title' in form ? (form.title ?? '') : ''}
							placeholder="e.g. The Intelligent Investor — Ch. 8"
							class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:border-primary"
						/>
					</div>

					<div>
						<label for="file" class="mb-1 block text-sm font-medium text-foreground">
							File <span class="font-normal text-muted">(.txt or .md, optional)</span>
						</label>
						<input
							id="file"
							name="file"
							type="file"
							accept=".txt,.md,.markdown,text/plain,text/markdown"
							class="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-border"
						/>
						<p class="mt-1 text-xs text-muted">PDF isn't supported yet — paste text or upload .txt/.md.</p>
					</div>

					<div>
						<label for="text" class="mb-1 block text-sm font-medium text-foreground">
							Or paste text
						</label>
						<textarea
							id="text"
							name="text"
							rows="6"
							placeholder="Paste notes or an excerpt…"
							class="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:border-primary"
						></textarea>
					</div>

					<div>
						<label for="topic_tags" class="mb-1 block text-sm font-medium text-foreground">
							Topic tags <span class="font-normal text-muted">(comma-separated, optional)</span>
						</label>
						<input
							id="topic_tags"
							name="topic_tags"
							placeholder="Finance, Value Investing"
							class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:border-primary"
						/>
					</div>

					<Button type="submit" loading={creating} class="w-full">
						{creating ? 'Saving & summarizing…' : 'Add material'}
					</Button>
				</form>
			</Card>
		</section>

		<!-- List -->
		<section class="lg:col-span-3">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="font-semibold text-foreground">Your materials ({data.sources.length})</h2>
			</div>

			{#if data.sources.length === 0}
				<EmptyState
					title="No source materials yet"
					description="Add notes or excerpts and they'll be used as context when generating quizzes."
				/>
			{:else}
				<div class="space-y-3">
					{#each data.sources as s (s.id)}
						<Card padding="p-5">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<h3 class="truncate font-semibold text-foreground">{s.title}</h3>
									<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
										{#if s.file_name}<Badge>{s.file_name}</Badge>{/if}
										{#each s.topic_tags as tag (tag)}<Badge tone="primary">{tag}</Badge>{/each}
									</div>
								</div>
								<form method="POST" action="?/delete" use:enhance={({ cancel }) => {
									if (!confirm('Delete this source material?')) cancel();
								}}>
									<input type="hidden" name="id" value={s.id} />
									<button
										type="submit"
										class="rounded-lg p-2 text-muted transition hover:bg-danger-soft hover:text-danger"
										aria-label="Delete source"
										title="Delete"
									>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
											<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										</svg>
									</button>
								</form>
							</div>

							{#if s.summary}
								<p class="mt-3 text-sm leading-relaxed text-muted">{s.summary}</p>
							{/if}

							<div class="mt-3 flex items-center justify-between border-t border-border pt-3">
								<span class="text-xs text-muted">
									{s.include_in_context ? 'Used as quiz context' : 'Excluded from context'}
								</span>
								<form method="POST" action="?/toggle" use:enhance>
									<input type="hidden" name="id" value={s.id} />
									<input type="hidden" name="include" value={(!s.include_in_context).toString()} />
									<button
										type="submit"
										class="text-xs font-medium text-primary hover:underline"
									>
										{s.include_in_context ? 'Exclude' : 'Include'}
									</button>
								</form>
							</div>
						</Card>
					{/each}
				</div>
			{/if}
		</section>
	</div>
{/if}
