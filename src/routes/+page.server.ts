import type { PageServerLoad } from './$types';
import { getNotebookAccess } from '$lib/server/labbook/auth';
import { readNotebook } from '$lib/server/labbook/library';

export const load: PageServerLoad = async (event) => {
	const access = await getNotebookAccess(event);
	const storageMode = access.local ? ('local' as const) : ('cloud' as const);
	try {
		return {
			library: await readNotebook(event),
			canEdit: access.canEdit,
			storageMode,
			problem: null
		};
	} catch (error) {
		console.error(
			'Notebook load failed:',
			error instanceof Error ? error.message : 'unknown error'
		);
		return {
			library: null,
			canEdit: access.canEdit,
			storageMode,
			problem: 'The notebook could not be opened. Please try again shortly.'
		};
	}
};
