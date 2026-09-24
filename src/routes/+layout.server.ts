import type { LayoutServerLoad } from './$types';
import { getNotebookAccess } from '$lib/server/labbook/auth';
export const load: LayoutServerLoad = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	return { notebookAccess: await getNotebookAccess(event) };
};
