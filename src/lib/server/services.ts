import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEnv, isSupabaseConfigured, requireOpenAI, requireSupabase, type AppEnv } from './env';
import { createSupabaseServerClient } from './supabase/client';
import { createOpenAIClient } from './ai/openai';

export interface AiServices {
	env: AppEnv;
	db: SupabaseClient;
	client: OpenAI;
	model: string;
}

/** For data-only routes that need Supabase but not the AI client. */
export function getDb(platform: App.Platform | undefined): SupabaseClient {
	return createSupabaseServerClient(getEnv(platform));
}

/** Returns null instead of throwing when Supabase isn't configured yet. */
export function tryGetDb(platform: App.Platform | undefined): SupabaseClient | null {
	const env = getEnv(platform);
	return isSupabaseConfigured(env) ? createSupabaseServerClient(env) : null;
}

/** For AI routes that need both OpenAI and Supabase. Throws if misconfigured. */
export function getAiServices(platform: App.Platform | undefined): AiServices {
	const env = getEnv(platform);
	requireSupabase(env);
	requireOpenAI(env);
	return {
		env,
		db: createSupabaseServerClient(env),
		client: createOpenAIClient(env),
		model: env.OPENAI_MODEL
	};
}
