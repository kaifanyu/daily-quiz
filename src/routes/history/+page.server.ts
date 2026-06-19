import type { PageServerLoad } from './$types';
import { tryGetDb } from '$lib/server/services';
import { getDashboardData } from '$lib/server/supabase/repo';

export const load: PageServerLoad = async ({ platform }) => {
	const db = tryGetDb(platform);
	if (!db) return { configured: false, history: [], error: null };
	try {
		const data = await getDashboardData(db, 100);
		return { configured: true, history: data.history, error: null };
	} catch (e) {
		return {
			configured: true,
			history: [],
			error: e instanceof Error ? e.message : 'Failed to load history.'
		};
	}
};
