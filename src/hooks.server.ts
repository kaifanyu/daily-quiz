import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';

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

/**
 * Security headers for the private /live room (SR-10, SR-11).
 *
 * Scoped to /live so the quiz app's own behaviour is untouched. `script-src`
 * still needs `unsafe-inline` because SvelteKit emits inline hydration data
 * without a nonce; everything else is locked down, and the camera permission is
 * granted only to this origin.
 */
const CSP = [
	"default-src 'self'",
	"base-uri 'none'",
	"form-action 'self'",
	"frame-ancestors 'none'",
	"object-src 'none'",
	"img-src 'self' data: blob:",
	"media-src 'self' blob:",
	"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	'font-src https://fonts.gstatic.com',
	"connect-src 'self' wss:"
].join('; ');

const handleLiveSecurity: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (!event.url.pathname.startsWith('/live')) return response;
	// Never touch a WebSocket upgrade response.
	if (response.status === 101) return response;

	response.headers.set('content-security-policy', CSP);
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'no-referrer');
	response.headers.set('permissions-policy', 'camera=(self), microphone=(self), geolocation=()');
	response.headers.set('x-frame-options', 'DENY');
	return response;
};

export const handle: Handle = sequence(handleParaglide, handleLiveSecurity);
