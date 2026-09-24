<script lang="ts">
	import { createAndOpenNote } from '$lib/notesClient';
	import { getNotesStore } from '$lib/notesStore.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const store = getNotesStore();
	let creating = $state(false);
	let creationError = $state('');

	async function newNote() {
		if (!data.notebookAccess.canEdit) return;
		creating = true;
		creationError = '';
		try {
			await createAndOpenNote(store);
		} catch (error) {
			creationError = error instanceof Error ? error.message : 'The post could not be created.';
		} finally {
			creating = false;
		}
	}
</script>

<div class="hidden flex-1 flex-col items-center justify-center p-10 text-center lg:flex">
	<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-muted">
		<svg
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path
				d="M14 2v6h6"
			/><path d="M16 13H8M16 17H8M10 9H8" />
		</svg>
	</div>
	<h2 class="mt-4 text-base font-semibold text-foreground">Thoughts worth sharing</h2>
	<p class="mt-1 max-w-xs text-sm text-muted">
		Choose a post from the collection to start reading.
	</p>
	{#if creationError}<p class="mt-3 text-sm text-danger" role="alert">{creationError}</p>{/if}
	{#if data.notebookAccess.canEdit}<div class="mt-5">
			<Button onclick={newNote} loading={creating}>New post</Button>
		</div>{/if}
</div>
