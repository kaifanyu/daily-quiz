import type { SupabaseClient } from '@supabase/supabase-js';
import {
	emptyLibrary,
	MAX_LIBRARY_BYTES,
	MAX_REVISION,
	normalizeLibrary
} from '$lib/labbook/model';
import type { Library } from '$lib/labbook/types';
import { getDb } from '$lib/server/services';

export class LabbookStorageError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(code: string, message: string, status = 500) {
		super(message);
		this.name = 'LabbookStorageError';
		this.code = code;
		this.status = status;
	}
}

function database(platform: App.Platform | undefined): SupabaseClient {
	try {
		return getDb(platform);
	} catch {
		throw new LabbookStorageError(
			'labbook_setup_required',
			'Labbook storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.',
			503
		);
	}
}

function databaseError(error: { code?: string } | null): never {
	if (['42P01', '42883', '42501', 'PGRST202', 'PGRST205'].includes(error?.code ?? '')) {
		throw new LabbookStorageError(
			'labbook_setup_required',
			'Labbook storage needs its database migration. Apply supabase/migrations/0004_labbook.sql with the database administrator account.',
			503
		);
	}
	throw new LabbookStorageError(
		'storage_unavailable',
		'Labbook could not reach its saved library. Your existing notes have not been replaced. Please try again.',
		503
	);
}

/** The caller must enforce Labbook access before reading or saving this singleton library. */
export async function readLibrary(platform: App.Platform | undefined): Promise<Library> {
	const db = database(platform);
	let response;
	try {
		response = await db
			.from('research_libraries')
			.select('revision,state')
			.eq('id', 'default')
			.maybeSingle();
	} catch {
		return databaseError(null);
	}
	if (response.error) databaseError(response.error);
	if (!response.data) return emptyLibrary();
	try {
		const { state } = normalizeLibrary(response.data.state);
		if (state.revision !== response.data.revision) throw new Error('Revision mismatch');
		return state;
	} catch {
		throw new LabbookStorageError(
			'library_corrupt',
			'The saved Labbook library could not be validated. It has not been replaced; recover its previous_state backup before saving.'
		);
	}
}

/** Saves and snapshots the previous state in one database transaction, guarded by revision. */
export async function saveLibrary(
	platform: App.Platform | undefined,
	raw: unknown
): Promise<{ revision: number }> {
	if (raw === null || typeof raw !== 'object' || !('version' in raw) || raw.version !== 2) {
		throw new LabbookStorageError(
			'unsupported_version',
			'Reload Labbook before saving. This version requires a version 2 library so concepts are preserved.',
			400
		);
	}
	let state: Library;
	try {
		state = normalizeLibrary(raw).state;
	} catch (error) {
		throw new LabbookStorageError(
			'invalid_library',
			error instanceof Error ? error.message : 'The library is invalid.',
			400
		);
	}
	if (state.revision >= MAX_REVISION) {
		throw new LabbookStorageError(
			'revision_exhausted',
			'The library revision limit has been reached. Export a backup before continuing.',
			409
		);
	}
	if (new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_LIBRARY_BYTES) {
		throw new LabbookStorageError(
			'library_too_large',
			'The library exceeds the 50 MB limit. Export a backup and remove unused attachments.',
			413
		);
	}
	const db = database(platform);
	let response;
	try {
		response = await db.rpc('save_research_library', {
			expected_revision: state.revision,
			next_state: state
		});
	} catch {
		return databaseError(null);
	}
	if (response.error) databaseError(response.error);
	const result = response.data as { saved?: unknown; revision?: unknown } | null;
	if (result?.saved === false) {
		throw new LabbookStorageError(
			'revision_conflict',
			'Another tab saved changes. Export your unsaved notes, then reload the current library before saving again.',
			409
		);
	}
	if (result?.saved !== true || result.revision !== state.revision + 1) {
		throw new LabbookStorageError(
			'invalid_storage_response',
			'The save could not be confirmed. Reload the library before trying again.',
			503
		);
	}
	return { revision: result.revision as number };
}
