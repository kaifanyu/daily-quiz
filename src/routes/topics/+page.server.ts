import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, isSupabaseConfigured } from '$lib/server/env';
import { getDb, tryGetDb } from '$lib/server/services';
import {
	createCategory,
	createTopics,
	deleteCategory,
	deleteTopic,
	listCategoriesWithTopics,
	updateCategory,
	updateTopic
} from '$lib/server/supabase/repo';

export const load: PageServerLoad = async ({ platform }) => {
	const db = tryGetDb(platform);
	const categories = db ? await listCategoriesWithTopics(db) : [];
	return { configured: Boolean(db), categories };
};

/** Parse a non-negative number, falling back when blank/invalid. */
function num(v: FormDataEntryValue | null, fallback = 1): number {
	const n = Number(String(v ?? '').trim());
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Split a textarea into a clean list, accepting newline- or comma-separated values. */
function toList(v: FormDataEntryValue | null): string[] {
	return String(v ?? '')
		.split(/[\n,]/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function ensureConfigured(platform: App.Platform | undefined) {
	return isSupabaseConfigured(getEnv(platform));
}

export const actions: Actions = {
	addCategory: async ({ request, platform }) => {
		if (!ensureConfigured(platform)) return fail(400, { message: 'Supabase is not configured.' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'Category name is required.' });
		await createCategory(getDb(platform), { name, weight: num(form.get('weight')) });
		return { success: true };
	},

	updateCategory: async ({ request, platform }) => {
		if (!ensureConfigured(platform)) return fail(400, { message: 'Supabase is not configured.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!id || !name) return fail(400, { message: 'Category id and name are required.' });
		await updateCategory(getDb(platform), id, {
			name,
			weight: num(form.get('weight')),
			enabled: form.get('enabled') !== null
		});
		return { success: true };
	},

	deleteCategory: async ({ request, platform }) => {
		if (!ensureConfigured(platform)) return fail(400, { message: 'Supabase is not configured.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Category id is required.' });
		await deleteCategory(getDb(platform), id);
		return { success: true };
	},

	addTopics: async ({ request, platform }) => {
		if (!ensureConfigured(platform)) return fail(400, { message: 'Supabase is not configured.' });
		const form = await request.formData();
		const categoryId = String(form.get('category_id') ?? '');
		if (!categoryId) return fail(400, { message: 'Category is required.' });
		// One topic per line; an optional "| weight" suffix sets its weight.
		const items = String(form.get('bulk') ?? '')
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [namePart, weightPart] = line.split('|');
				return { name: namePart.trim(), weight: weightPart ? num(weightPart, 1) : 1 };
			})
			.filter((i) => i.name);
		if (items.length === 0) return fail(400, { message: 'Add at least one topic.' });
		await createTopics(getDb(platform), categoryId, items);
		return { success: true };
	},

	updateTopic: async ({ request, platform }) => {
		if (!ensureConfigured(platform)) return fail(400, { message: 'Supabase is not configured.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!id || !name) return fail(400, { message: 'Topic id and name are required.' });
		const angle = String(form.get('angle') ?? '').trim();
		const personalNote = String(form.get('personal_note') ?? '').trim();
		await updateTopic(getDb(platform), id, {
			name,
			weight: num(form.get('weight')),
			enabled: form.get('enabled') !== null,
			subtopics: toList(form.get('subtopics')),
			angle: angle || null,
			personal_note: personalNote || null,
			keep_getting_wrong: toList(form.get('keep_getting_wrong'))
		});
		return { success: true };
	},

	deleteTopic: async ({ request, platform }) => {
		if (!ensureConfigured(platform)) return fail(400, { message: 'Supabase is not configured.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Topic id is required.' });
		await deleteTopic(getDb(platform), id);
		return { success: true };
	}
};
