import type { PageServerLoad } from './$types';
import { tryGetDb } from '$lib/server/services';
import { getDashboardData } from '$lib/server/supabase/repo';

export const load: PageServerLoad = async ({ platform }) => {
	const db = tryGetDb(platform);
	if (!db) return { configured: false, data: null, error: null };
	try {
		const data = await getDashboardData(db);
		return { configured: true, data, error: null };
	} catch (e) {
		return {
			configured: true,
			data: null,
			error: e instanceof Error ? e.message : 'Failed to load dashboard data.'
		};
	}
};
