import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, isSupabaseConfigured } from '$lib/server/env';
import { getDb } from '$lib/server/services';
import { uploadNoteImages } from '$lib/server/supabase/repo';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Upload a single image for a note; returns { path, url, name } to embed. */
export const POST: RequestHandler = async ({ params, request, platform }) => {
	if (!isSupabaseConfigured(getEnv(platform))) throw error(400, 'Supabase is not configured.');
	const db = getDb(platform);

	const form = await request.formData();
	const file = form.get('image');
	if (!(file instanceof File) || file.size === 0) throw error(400, 'No image provided.');
	if (!file.type.startsWith('image/')) throw error(400, 'File is not an image.');
	if (file.size > MAX_IMAGE_BYTES) throw error(400, 'Image exceeds 5 MB.');

	const [img] = await uploadNoteImages(db, params.id, [file]);
	return json(img);
};
