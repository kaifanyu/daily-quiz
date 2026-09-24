import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { tryGetDb } from '$lib/server/services';
import { getNote } from '$lib/server/supabase/repo';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = tryGetDb(platform);
	if (!db) throw error(503, 'This blog is not available yet.');
	const note = await getNote(db, params.id);
	if (!note) throw error(404, 'Post not found.');
	return { note };
};
