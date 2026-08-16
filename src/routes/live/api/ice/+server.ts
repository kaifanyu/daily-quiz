/**
 * Short-lived ICE/TURN credentials.
 *
 * Credentials are minted per request and never embedded in the client bundle.
 * Two callers are allowed: the authorized viewer (via Cloudflare Access) and the
 * broadcaster (via the broadcaster token, sent as a header).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeViewer, tokenMatches } from '$lib/server/live/access';
import { getLiveConfig } from '$lib/server/live/config';
import { buildIceConfig } from '$lib/server/live/ice';

export const GET: RequestHandler = async ({ request, platform, fetch }) => {
	const config = getLiveConfig(platform);
	const presentedToken = request.headers.get('x-broadcaster-token');

	if (presentedToken !== null) {
		if (!tokenMatches(presentedToken, config.broadcasterToken)) {
			console.warn('[live] ice request rejected: bad broadcaster token');
			return new Response('Not authorized.', { status: 401 });
		}
	} else {
		const auth = await authorizeViewer(request, config, fetch);
		if (!auth.ok) {
			console.warn(`[live] ice request rejected: ${auth.reason}`);
			return new Response('Not authorized.', { status: auth.status });
		}
	}

	const ice = await buildIceConfig(config, fetch);
	return json(ice, { headers: { 'cache-control': 'no-store' } });
};
