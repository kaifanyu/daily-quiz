import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeLibrary } from '$lib/labbook/model';
import { getNotebookAccess } from '$lib/server/labbook/auth';
import { readNotebook, saveNotebook } from '$lib/server/labbook/library';
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const MAX_BYTES = 50 * 1024 * 1024;
function failure(error: unknown): Response {
	const status =
		typeof error === 'object' && error && 'status' in error && typeof error.status === 'number'
			? error.status
			: 503;
	const message =
		status === 409
			? 'Another tab saved newer notes. Export your changes and reload before continuing.'
			: status === 400
				? (error as Error).message
				: 'Your notes could not be saved or opened. Please retry; your previous library is preserved.';
	return json({ message }, { status, headers });
}
export const GET: RequestHandler = async (event) => {
	if (!(await getNotebookAccess(event)).canRead)
		return json({ message: 'Sign in to open this notebook.' }, { status: 401, headers });
	try {
		return json(await readNotebook(event), { headers });
	} catch (error) {
		return failure(error);
	}
};
export const PUT: RequestHandler = async (event) => {
	if (!(await getNotebookAccess(event)).canEdit)
		return json({ message: 'Sign in before editing your notebook.' }, { status: 401, headers });
	if (event.request.headers.get('origin') !== event.url.origin)
		return json({ message: 'Save from the notebook website.' }, { status: 403, headers });
	if (!event.request.headers.get('content-type')?.startsWith('application/json'))
		return json({ message: 'The library must be JSON.' }, { status: 415, headers });
	const reader = event.request.body?.getReader();
	if (!reader) return json({ message: 'No library was provided.' }, { status: 400, headers });
	const decoder = new TextDecoder();
	let bytes = 0,
		raw = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_BYTES) {
				await reader.cancel();
				return json({ message: 'The library exceeds 50 MB.' }, { status: 413, headers });
			}
			raw += decoder.decode(value, { stream: true });
		}
		raw += decoder.decode();
		let state;
		try {
			const parsed = JSON.parse(raw);
			if (parsed.version !== 2) throw new Error('Reload Labbook before saving this library.');
			state = normalizeLibrary(parsed).state;
		} catch (error) {
			return json(
				{ message: error instanceof Error ? error.message : 'Invalid notebook data.' },
				{ status: 400, headers }
			);
		}
		return json(await saveNotebook(event, state), { headers });
	} catch (error) {
		return failure(error);
	}
};
