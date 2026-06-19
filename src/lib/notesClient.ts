import { goto } from '$app/navigation';
import type { NotesStore } from '$lib/notesStore.svelte';
import type { Note } from '$lib/types/quiz';

/** Create an empty note on the server, add it to the sidebar store, and open it. */
export async function createAndOpenNote(store: NotesStore, category = 'General'): Promise<void> {
	const res = await fetch('/api/notes', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ category })
	});
	if (!res.ok) throw new Error('Failed to create note');
	const note = (await res.json()) as Note;
	store.upsert({
		id: note.id,
		title: note.title,
		category: note.category,
		pinned: note.pinned,
		updated_at: note.updated_at
	});
	await goto(`/notes/${note.id}`);
}
