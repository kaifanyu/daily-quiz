import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	createOwnerSession,
	getNotebookAccess,
	verifyOwnerPassword
} from '$lib/server/labbook/auth';
export const load: PageServerLoad = async (event) => {
	const access = await getNotebookAccess(event);
	if (access.canEdit) redirect(303, '/');
	return { loginConfigured: access.loginConfigured };
};
export const actions: Actions = {
	default: async (event) => {
		if (Number(event.request.headers.get('content-length') || 0) > 8192)
			return fail(400, { message: 'Unable to sign in.' });
		const reader = event.request.body?.getReader();
		if (!reader) return fail(400, { message: 'Unable to sign in.' });
		let size = 0;
		const parts: Uint8Array<ArrayBuffer>[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 8192) {
				await reader.cancel();
				return fail(400, { message: 'Unable to sign in.' });
			}
			parts.push(new Uint8Array(value));
		}
		let form: FormData;
		try {
			form = await new Request(event.url, {
				method: 'POST',
				headers: event.request.headers,
				body: new Blob(parts)
			}).formData();
		} catch {
			return fail(400, { message: 'Unable to sign in.' });
		}
		const password = form.get('password');
		if (typeof password !== 'string' || !(await verifyOwnerPassword(event.platform, password)))
			return fail(400, { message: 'That password did not match. Please try again.' });
		await createOwnerSession(event);
		redirect(303, '/');
	}
};
