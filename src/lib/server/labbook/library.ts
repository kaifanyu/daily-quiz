import type { RequestEvent } from '@sveltejs/kit';
import type { Library } from '$lib/labbook/types';
import { isLocalNotebook } from './auth';
import { readLibrary, saveLibrary } from './storage';
export async function readNotebook(event: RequestEvent): Promise<Library> {
	if (isLocalNotebook(event)) return (await import('./local')).readLocalLibrary();
	return readLibrary(event.platform);
}
export async function saveNotebook(
	event: RequestEvent,
	state: Library
): Promise<{ revision: number }> {
	if (isLocalNotebook(event)) return (await import('./local')).saveLocalLibrary(state);
	return saveLibrary(event.platform, state);
}
