import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, isSupabaseConfigured } from '$lib/server/env';
import { getDb } from '$lib/server/services';
import { createNote } from '$lib/server/supabase/repo';

/** Create a new, empty note and return it (the editor redirects to its id). */
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!isSupabaseConfigured(getEnv(platform))) throw error(400, 'Supabase is not configured.');
	const db = getDb(platform);
	const body = (await request.json().catch(() => ({}))) as { category?: unknown };
	const category =
		typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'General';
	const note = await createNote(db, { title: 'Untitled', category, content: '', images: [] });
	return json(note);
};
