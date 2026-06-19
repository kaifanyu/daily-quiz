import { getContext, setContext } from 'svelte';
import type { Note } from '$lib/types/quiz';

/** Lightweight shape the sidebar renders — no heavy `content`/`images`. */
export type NoteListItem = Pick<Note, 'id' | 'title' | 'category' | 'pinned' | 'updated_at'>;

/**
 * Reactive list of notes backing the sidebar. Created per layout instance (not at
 * module scope) so it's seeded synchronously during SSR — no empty-then-populate
 * flash — and never shared across requests. The editor mutates it optimistically
 * (title/category/pin/delete) so the sidebar stays in sync without a reload.
 */
export class NotesStore {
	list = $state<NoteListItem[]>([]);

	constructor(initial: NoteListItem[]) {
		this.list = initial;
	}

	upsert(item: NoteListItem) {
		const i = this.list.findIndex((n) => n.id === item.id);
		if (i >= 0) this.list[i] = { ...this.list[i], ...item };
		else this.list = [item, ...this.list];
	}

	patch(id: string, p: Partial<NoteListItem>) {
		const i = this.list.findIndex((n) => n.id === id);
		if (i >= 0) this.list[i] = { ...this.list[i], ...p };
	}

	remove(id: string) {
		this.list = this.list.filter((n) => n.id !== id);
	}

	/** Pinned first, then most-recently updated. */
	get sorted(): NoteListItem[] {
		return [...this.list].sort((a, b) => {
			if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
			return b.updated_at.localeCompare(a.updated_at);
		});
	}
}

const KEY = Symbol('notes-store');

export function createNotesStore(initial: NoteListItem[]): NotesStore {
	return setContext(KEY, new NotesStore(initial));
}

export function getNotesStore(): NotesStore {
	return getContext(KEY);
}
