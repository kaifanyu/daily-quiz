/**
 * Broadcaster dashboard gate.
 *
 * DEVIATION FROM THE SPEC (§3 "Local broadcaster authentication"): the spec asks
 * for this page to be bound to 127.0.0.1. This app runs on Cloudflare Workers,
 * where there is no loopback interface to bind to, so the isolation is layered
 * differently:
 *
 *   1. When Cloudflare Access is configured, the page requires a valid Access
 *      assertion — any identity in the Access policy, not just the viewer.
 *   2. The page itself is inert: it holds no secret and can do nothing until the
 *      broadcaster token is entered, and that token is only ever verified
 *      server-side (`/live/api/ice`, then the signaling socket).
 *
 * The camera stream still never touches the server — it is captured in this page
 * and sent peer-to-peer.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authorizeAnyAccessIdentity, isDevBypassAllowed } from '$lib/server/live/access';
import { getLiveConfig, isAccessConfigured } from '$lib/server/live/config';

export const prerender = false;

export const load: PageServerLoad = async ({ request, platform, fetch, setHeaders }) => {
	const config = getLiveConfig(platform);
	const accessConfigured = isAccessConfigured(config);

	if (accessConfigured && !isDevBypassAllowed(request, config)) {
		const auth = await authorizeAnyAccessIdentity(request, config, fetch);
		if (!auth.ok) {
			console.warn(`[live] broadcaster page denied: ${auth.reason}`);
			throw error(auth.status === 503 ? 503 : 401, 'This room is not open yet.');
		}
	}

	setHeaders({ 'cache-control': 'no-store' });

	return {
		title: config.title,
		// Surfaced as a warning banner so an unprotected deployment is obvious.
		accessConfigured,
		tokenConfigured: config.broadcasterToken.length > 0
	};
};
