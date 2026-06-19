import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireSupabase, type AppEnv } from '$lib/server/env';

/**
 * Creates a server-only Supabase client using the service-role key.
 * This bypasses RLS — appropriate for a single-user, no-auth personal app where
 * all DB access happens through trusted server endpoints. The key is never
 * exposed to the browser.
 */
export function createSupabaseServerClient(env: AppEnv): SupabaseClient {
	requireSupabase(env);
	return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: {
			persistSession: false,
			autoRefreshToken: false
		},
		global: {
			headers: { 'x-application-name': 'daily-quiz' }
		}
	});
}
