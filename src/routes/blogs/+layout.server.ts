import type { LayoutServerLoad } from './$types';
import { tryGetDb } from '$lib/server/services';
import { listNotes } from '$lib/server/supabase/repo';

export const load: LayoutServerLoad = async ({ platform }) => {
	const db = tryGetDb(platform);
	if (!db) return { configured: false, notes: [] };
	const notes = await listNotes(db);
	// The sidebar only needs lightweight fields, not full content/images.
	return {
		configured: true,
		notes: notes.map((n) => ({
			id: n.id,
			title: n.title,
			category: n.category,
			pinned: n.pinned,
			updated_at: n.updated_at
		}))
	};
};
