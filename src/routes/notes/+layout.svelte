<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import type { LayoutData } from './$types';
	import { createNotesStore } from '$lib/notesStore.svelte';
	import { createAndOpenNote } from '$lib/notesClient';
	import { formatDateTime } from '$lib/format';
	import Badge from '$lib/components/Badge.svelte';
	import Alert from '$lib/components/Alert.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Seeded once (synchronously, so SSR renders the list) from the server load and
	// shared via context with the editor, which mutates it optimistically.
	const store = createNotesStore(untrack(() => data.notes));

	let query = $state('');
	let activeCategory = $state('All');
	let creating = $state(false);

	const activeId = $derived(page.params.id ?? null);

	const categories = $derived.by(() => {
		const out: string[] = [];
		for (const n of store.list) {
			const c = n.category || 'General';
			if (!out.includes(c)) out.push(c);
		}
		return out.sort((a, b) => a.localeCompare(b));
	});

	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return store.sorted.filter((n) => {
			const cat = n.category || 'General';
			const inCat = activeCategory === 'All' || cat === activeCategory;
			const inQuery = !q || n.title.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
			return inCat && inQuery;
		});
	});

	async function newNote() {
		creating = true;
		try {
			await createAndOpenNote(store, activeCategory !== 'All' ? activeCategory : 'General');
		} finally {
			creating = false;
		}
	}
</script>

{#if !data.configured}
	<Alert tone="warning" title="Supabase is not configured">
		Set <code class="rounded bg-surface-2 px-1">SUPABASE_URL</code> and
		<code class="rounded bg-surface-2 px-1">SUPABASE_SERVICE_ROLE_KEY</code>, then run the
		<code class="rounded bg-surface-2 px-1">0002_notes.sql</code> migration to start writing notes.
	</Alert>
{:else}
	<div
		class="grid h-[calc(100dvh-8rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-sm lg:grid-cols-[300px_1fr]"
	>
		<!-- Sidebar -->
		<aside
			class="min-h-0 flex-col border-border lg:flex lg:border-r {activeId
				? 'hidden'
				: 'flex'}"
		>
			<div class="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
				<h1 class="text-lg font-bold text-foreground">Notes</h1>
				<button
					type="button"
					onclick={newNote}
					disabled={creating}
					class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50"
				>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
						<path d="M12 5v14M5 12h14" />
					</svg>
					New
				</button>
			</div>

			<div class="space-y-2 border-b border-border px-3 py-3">
				<div class="relative">
					<svg class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
						<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
					</svg>
					<input
						type="search"
						placeholder="Search notes…"
						bind:value={query}
						class="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-sm text-foreground placeholder:text-muted focus-visible:border-primary focus-visible:outline-none"
					/>
				</div>
				{#if categories.length > 0}
					<div class="flex flex-wrap gap-1">
						<button
							type="button"
							onclick={() => (activeCategory = 'All')}
							class="rounded-full px-2.5 py-0.5 text-xs font-medium transition {activeCategory === 'All'
								? 'bg-primary text-primary-foreground'
								: 'bg-surface-2 text-muted hover:text-foreground'}"
						>
							All
						</button>
						{#each categories as c (c)}
							<button
								type="button"
								onclick={() => (activeCategory = c)}
								class="rounded-full px-2.5 py-0.5 text-xs font-medium transition {activeCategory === c
									? 'bg-primary text-primary-foreground'
									: 'bg-surface-2 text-muted hover:text-foreground'}"
							>
								{c}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<nav class="min-h-0 flex-1 overflow-y-auto p-2">
				{#if visible.length === 0}
					<p class="px-3 py-8 text-center text-sm text-muted">
						{store.list.length === 0 ? 'No notes yet. Create your first one.' : 'No matches.'}
					</p>
				{:else}
					<ul class="space-y-0.5">
						{#each visible as n (n.id)}
							<li>
								<a
									href="/notes/{n.id}"
									class="block rounded-lg px-3 py-2.5 transition {activeId === n.id
										? 'bg-surface-2'
										: 'hover:bg-surface-2'}"
								>
									<div class="flex items-center gap-1.5">
										{#if n.pinned}
											<svg class="shrink-0 text-primary" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
												<path d="M16 3v2l-1 1v5l3 3v2h-5v5l-1 1-1-1v-5H5v-2l3-3V6L7 5V3z" />
											</svg>
										{/if}
										<span class="truncate text-sm font-medium text-foreground">
											{n.title || 'Untitled'}
										</span>
									</div>
									<div class="mt-1 flex items-center justify-between gap-2">
										<Badge tone="primary">{n.category || 'General'}</Badge>
										<span class="shrink-0 text-xs text-muted">{formatDateTime(n.updated_at)}</span>
									</div>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</nav>
		</aside>

		<!-- Editor pane -->
		<section class="min-h-0 flex-col lg:flex {activeId ? 'flex' : 'hidden lg:flex'}">
			{@render children()}
		</section>
	</div>
{/if}
