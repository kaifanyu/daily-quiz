/**
 * Viewer page gate.
 *
 * Nothing about the application — not the ICE servers, not the layout, not even
 * the socket path — is handed to a request that is not the one authorized
 * identity (FR-01, FR-02). An unauthorized visitor gets `+error.svelte` instead.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authorizeViewer } from '$lib/server/live/access';
import { getLiveConfig } from '$lib/server/live/config';
import { buildIceConfig } from '$lib/server/live/ice';

export const prerender = false;

export const load: PageServerLoad = async ({ request, platform, fetch, setHeaders }) => {
	const config = getLiveConfig(platform);
	const auth = await authorizeViewer(request, config, fetch);

	if (!auth.ok) {
		console.warn(`[live] viewer page denied: ${auth.reason}`);
		switch (auth.reason) {
			case 'not_configured':
				throw error(503, 'This room is not open yet.');
			case 'wrong_identity':
				throw error(403, 'This room is not for you.');
			default:
				throw error(401, 'Please sign in to come in.');
		}
	}

	// Freshly minted TURN credentials must never be cached by a proxy.
	setHeaders({ 'cache-control': 'no-store' });

	const ice = await buildIceConfig(config, fetch);

	return {
		title: config.title,
		devBypass: auth.via === 'dev-bypass',
		ice: {
			iceServers: ice.iceServers,
			iceTransportPolicy: ice.iceTransportPolicy
		}
	};
};
