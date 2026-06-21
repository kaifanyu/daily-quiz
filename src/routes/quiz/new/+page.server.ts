import type { PageServerLoad } from './$types';
import { getEnv, isSupabaseConfigured } from '$lib/server/env';
import { tryGetDb } from '$lib/server/services';
import { listCategoriesWithTopics } from '$lib/server/supabase/repo';

export interface BankCategorySummary {
	name: string;
	topicCount: number;
	/** Effective share of the category mix (0–1), normalized across usable categories. */
	share: number;
}

export const load: PageServerLoad = async ({ platform }) => {
	const env = getEnv(platform);
	const db = tryGetDb(platform);

	let bank: BankCategorySummary[] = [];
	let bankTopicTotal = 0;
	if (db) {
		const cats = await listCategoriesWithTopics(db, { enabledOnly: true });
		const usable = cats.filter((c) => c.weight > 0 && c.topics.length > 0);
		const totalWeight = usable.reduce((a, c) => a + c.weight, 0);
		bankTopicTotal = usable.reduce((a, c) => a + c.topics.length, 0);
		bank = usable
			.map((c) => ({
				name: c.name,
				topicCount: c.topics.length,
				share: totalWeight > 0 ? c.weight / totalWeight : 0
			}))
			.sort((a, b) => b.share - a.share);
	}

	return {
		supabaseConfigured: isSupabaseConfigured(env),
		openaiConfigured: Boolean(env.OPENAI_API_KEY),
		bank,
		bankTopicTotal
	};
};
