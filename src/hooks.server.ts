import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { json, redirect } from '@sveltejs/kit';
import { getNotebookAccess } from '$lib/server/labbook/auth';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

const handleNotebookSecurity: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const editingPage = ['/sources', '/topics', '/prompts', '/quiz/new'].some(
		(prefix) => path === prefix || path.startsWith(prefix + '/')
	);
	const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method);
	if (editingPage || (mutation && path !== '/login' && path !== '/logout')) {
		if (!(await getNotebookAccess(event)).canEdit) {
			if (path.startsWith('/api/') || mutation)
				return json({ message: 'Sign in before changing your notebook.' }, { status: 401 });
			redirect(303, '/login');
		}
		if (mutation && event.request.headers.get('origin') !== event.url.origin)
			return json(
				{ message: 'This request must come from the notebook website.' },
				{ status: 403 }
			);
	}
	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	return response;
};

export const handle: Handle = sequence(handleParaglide, handleNotebookSecurity);
