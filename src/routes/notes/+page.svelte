<script lang="ts">
	import { createAndOpenNote } from '$lib/notesClient';
	import { getNotesStore } from '$lib/notesStore.svelte';
	import Button from '$lib/components/Button.svelte';

	const store = getNotesStore();
	let creating = $state(false);

	async function newNote() {
		creating = true;
		try {
			await createAndOpenNote(store);
		} finally {
			creating = false;
		}
	}
</script>

<div class="hidden flex-1 flex-col items-center justify-center p-10 text-center lg:flex">
	<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-muted">
		<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" />
		</svg>
	</div>
	<h2 class="mt-4 text-base font-semibold text-foreground">Select a note</h2>
	<p class="mt-1 max-w-xs text-sm text-muted">
		Pick a note from the sidebar to read or edit it, or start a new one.
	</p>
	<div class="mt-5">
		<Button onclick={newNote} loading={creating}>New note</Button>
	</div>
</div>
