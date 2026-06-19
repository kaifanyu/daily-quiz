import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { tryGetDb } from '$lib/server/services';
import { getNote } from '$lib/server/supabase/repo';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = tryGetDb(platform);
	if (!db) throw error(503, 'Supabase is not configured.');
	const note = await getNote(db, params.id);
	if (!note) throw error(404, 'Note not found.');
	return { note };
};
