/**
 * Server-side environment access.
 *
 * On Cloudflare Workers, secrets are NOT available via `process.env` — they are
 * bound onto `platform.env` at runtime. During `vite dev`, the Cloudflare adapter's
 * platform proxy populates `platform.env` from `.dev.vars`. We also fall back to
 * `process.env` so the app still works under plain Node tooling.
 *
 * Every value here is read server-side only; nothing is ever shipped to the client.
 */

export interface AppEnv {
	OPENAI_API_KEY: string;
	OPENAI_MODEL: string;
	OPENAI_BASE_URL?: string;
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
	SUPABASE_ANON_KEY?: string;
}

export const DEFAULT_OPENAI_MODEL = 'gpt-4o';

function read(platform: App.Platform | undefined, key: string): string | undefined {
	const fromPlatform = (platform?.env as Record<string, string | undefined> | undefined)?.[key];
	if (fromPlatform !== undefined && fromPlatform !== '') return fromPlatform;
	// `process` is undefined on the Workers runtime; guard before touching it.
	if (typeof process !== 'undefined' && process.env) {
		const fromProcess = process.env[key];
		if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
	}
	return undefined;
}

export function getEnv(platform: App.Platform | undefined): AppEnv {
	return {
		OPENAI_API_KEY: read(platform, 'OPENAI_API_KEY') ?? '',
		OPENAI_MODEL: read(platform, 'OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL,
		OPENAI_BASE_URL: read(platform, 'OPENAI_BASE_URL'),
		SUPABASE_URL: read(platform, 'SUPABASE_URL') ?? '',
		SUPABASE_SERVICE_ROLE_KEY: read(platform, 'SUPABASE_SERVICE_ROLE_KEY') ?? '',
		SUPABASE_ANON_KEY: read(platform, 'SUPABASE_ANON_KEY')
	};
}

/** Throws a clear error if the AI integration is not configured. */
export function requireOpenAI(env: AppEnv): void {
	if (!env.OPENAI_API_KEY) {
		throw new Error(
			'OPENAI_API_KEY is not set. Add it to .dev.vars (local) or as a Worker secret (deploy).'
		);
	}
}

/** Throws a clear error if Supabase is not configured. */
export function requireSupabase(env: AppEnv): void {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
		throw new Error(
			'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Add them to .dev.vars (local) or as Worker secrets (deploy).'
		);
	}
}

export function isSupabaseConfigured(env: AppEnv): boolean {
	return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}
