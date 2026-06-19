import type { PageServerLoad } from './$types';
import { getEnv, isSupabaseConfigured } from '$lib/server/env';

export const load: PageServerLoad = ({ platform }) => {
	const env = getEnv(platform);
	return {
		supabaseConfigured: isSupabaseConfigured(env),
		openaiConfigured: Boolean(env.OPENAI_API_KEY)
	};
};
