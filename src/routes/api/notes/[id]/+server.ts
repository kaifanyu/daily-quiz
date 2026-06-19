import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Note } from '$lib/types/quiz';
import { getEnv, isSupabaseConfigured } from '$lib/server/env';
import { getDb } from '$lib/server/services';
import { deleteNote, updateNote } from '$lib/server/supabase/repo';

type NotePatch = Partial<Pick<Note, 'title' | 'category' | 'content' | 'pinned'>>;

/** Autosave: patch any subset of the editable fields. */
export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	if (!isSupabaseConfigured(getEnv(platform))) throw error(400, 'Supabase is not configured.');
	const db = getDb(platform);
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) throw error(400, 'Invalid body.');

	const patch: NotePatch = {};
	if (typeof body.title === 'string') patch.title = body.title;
	if (typeof body.category === 'string') patch.category = body.category.trim() || 'General';
	if (typeof body.content === 'string') patch.content = body.content;
	if (typeof body.pinned === 'boolean') patch.pinned = body.pinned;
	if (Object.keys(patch).length === 0) throw error(400, 'Nothing to update.');

	await updateNote(db, params.id, patch);
	return json({ ok: true, updated_at: new Date().toISOString() });
};

export const DELETE: RequestHandler = async ({ params, platform }) => {
	if (!isSupabaseConfigured(getEnv(platform))) throw error(400, 'Supabase is not configured.');
	const db = getDb(platform);
	await deleteNote(db, params.id);
	return json({ ok: true });
};
