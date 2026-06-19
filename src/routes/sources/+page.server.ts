import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, isSupabaseConfigured } from '$lib/server/env';
import { getDb, tryGetDb } from '$lib/server/services';
import { createOpenAIClient } from '$lib/server/ai/openai';
import { summarizeSource } from '$lib/server/ai/summarize';
import { createSource, deleteSource, listSources, updateSource } from '$lib/server/supabase/repo';

export const load: PageServerLoad = async ({ platform }) => {
	const env = getEnv(platform);
	const db = tryGetDb(platform);
	if (!db) return { configured: false, openaiConfigured: false, sources: [] };
	return {
		configured: true,
		openaiConfigured: Boolean(env.OPENAI_API_KEY),
		sources: await listSources(db)
	};
};

function parseTags(raw: string): string[] {
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export const actions: Actions = {
	create: async ({ request, platform }) => {
		const env = getEnv(platform);
		if (!isSupabaseConfigured(env)) return fail(400, { message: 'Supabase is not configured.' });
		const db = getDb(platform);

		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const pasted = String(form.get('text') ?? '').trim();
		const tags = parseTags(String(form.get('topic_tags') ?? ''));
		const file = form.get('file');

		let fileName: string | null = null;
		let fileType: string | null = null;
		let text = pasted;

		if (file && file instanceof File && file.size > 0) {
			fileName = file.name;
			fileType = file.type || null;
			const fileText = await file.text();
			text = text ? `${text}\n\n${fileText}` : fileText;
		}

		if (!title) return fail(400, { message: 'A title is required.', title, text: pasted });
		if (!text) return fail(400, { message: 'Paste some text or upload a .txt/.md file.', title });

		// Summarize + auto-tag with the AI when available (non-fatal if it fails).
		let summary: string | null = null;
		let topic_tags = tags;
		if (env.OPENAI_API_KEY) {
			try {
				const client = createOpenAIClient(env);
				const r = await summarizeSource(client, env.OPENAI_MODEL, title, text);
				summary = r.summary;
				if (topic_tags.length === 0) topic_tags = r.topic_tags;
			} catch (e) {
				console.error('[sources] summarization failed:', e);
			}
		}

		await createSource(db, {
			title,
			file_name: fileName,
			file_type: fileType,
			extracted_text: text,
			summary,
			topic_tags,
			include_in_context: true
		});
		return { success: true };
	},

	toggle: async ({ request, platform }) => {
		if (!isSupabaseConfigured(getEnv(platform)))
			return fail(400, { message: 'Supabase is not configured.' });
		const db = getDb(platform);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const include = String(form.get('include') ?? '') === 'true';
		if (!id) return fail(400, { message: 'Missing id.' });
		await updateSource(db, id, { include_in_context: include });
		return { success: true };
	},

	delete: async ({ request, platform }) => {
		if (!isSupabaseConfigured(getEnv(platform)))
			return fail(400, { message: 'Supabase is not configured.' });
		const db = getDb(platform);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Missing id.' });
		await deleteSource(db, id);
		return { success: true };
	}
};
