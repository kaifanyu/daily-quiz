import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, isSupabaseConfigured } from '$lib/server/env';
import { getDb, tryGetDb } from '$lib/server/services';
import { deletePrompt, getAllPrompts, upsertPrompt } from '$lib/server/supabase/repo';
import { DEFAULT_PROMPTS } from '$lib/server/ai/prompts';
import type { PromptName } from '$lib/types/quiz';

const PROMPT_NAMES: PromptName[] = ['quiz_generation'];

function isPromptName(v: string): v is PromptName {
	return (PROMPT_NAMES as string[]).includes(v);
}

export const load: PageServerLoad = async ({ platform }) => {
	const db = tryGetDb(platform);
	const overrides = db ? await getAllPrompts(db) : [];
	const byName = new Map(overrides.map((p) => [p.name, p.content]));

	const prompts = PROMPT_NAMES.map((name) => ({
		name,
		content: byName.get(name) ?? DEFAULT_PROMPTS[name],
		isCustom: byName.has(name),
		default_content: DEFAULT_PROMPTS[name]
	}));

	return { configured: Boolean(db), prompts };
};

export const actions: Actions = {
	save: async ({ request, platform }) => {
		if (!isSupabaseConfigured(getEnv(platform)))
			return fail(400, { message: 'Supabase is not configured.' });
		const db = getDb(platform);
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const content = String(form.get('content') ?? '').trim();
		if (!isPromptName(name)) return fail(400, { message: 'Unknown prompt.' });
		if (!content) return fail(400, { message: 'Prompt content cannot be empty.' });
		await upsertPrompt(db, name, content);
		return { success: true, saved: name };
	},

	reset: async ({ request, platform }) => {
		if (!isSupabaseConfigured(getEnv(platform)))
			return fail(400, { message: 'Supabase is not configured.' });
		const db = getDb(platform);
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		if (!isPromptName(name)) return fail(400, { message: 'Unknown prompt.' });
		await deletePrompt(db, name);
		return { success: true, reset: name };
	}
};
