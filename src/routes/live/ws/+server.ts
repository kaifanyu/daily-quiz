/**
 * Authenticated signaling socket (`/live/ws`).
 *
 * This is the only door into the room, and it is guarded before a socket is ever
 * created (SR-14):
 *
 *   viewer      — must present a valid Cloudflare Access assertion for the one
 *                 authorized identity.
 *   broadcaster — must present the broadcaster token as a WebSocket subprotocol
 *                 (`bt.<token>`), so it never appears in a URL or server log.
 *
 * The role is decided here and passed to the Durable Object; a client can never
 * ask to be the broadcaster.
 */

import type { RequestHandler } from './$types';
import { authorizeViewer, tokenMatches } from '$lib/server/live/access';
import { getLiveConfig } from '$lib/server/live/config';
import {
	decodeBroadcasterToken,
	WS_BROADCASTER_TOKEN_PREFIX,
	WS_PROTOCOL
} from '$lib/live/protocol';

/** `Sec-WebSocket-Protocol: live.v1, bt.abc123` -> ['live.v1', 'bt.abc123'] */
function subprotocols(request: Request): string[] {
	return (request.headers.get('sec-websocket-protocol') ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
}

export const GET: RequestHandler = async ({ request, platform }) => {
	if ((request.headers.get('upgrade') ?? '').toLowerCase() !== 'websocket') {
		return new Response('Expected a WebSocket upgrade.', { status: 426 });
	}

	// Bindings are only present on the Workers runtime, so read defensively —
	// `vite dev` has no Durable Objects (use `yarn dev:live` instead).
	const room = (platform?.env as { LIVE_ROOM?: DurableObjectNamespace } | undefined)?.LIVE_ROOM;
	if (!room) {
		console.error('[live] LIVE_ROOM durable object binding is missing');
		return new Response('Signaling is unavailable.', { status: 503 });
	}

	const config = getLiveConfig(platform);
	const offered = subprotocols(request);
	// `bt.<base64url token>` — see `encodeBroadcasterToken` for why it is encoded.
	const presentedProtocol = offered
		.find((value) => value.startsWith(WS_BROADCASTER_TOKEN_PREFIX))
		?.slice(WS_BROADCASTER_TOKEN_PREFIX.length);
	const presentedToken =
		presentedProtocol === undefined ? undefined : (decodeBroadcasterToken(presentedProtocol) ?? '');

	let role: 'viewer' | 'broadcaster';

	if (presentedToken !== undefined) {
		if (!tokenMatches(presentedToken, config.broadcasterToken)) {
			console.warn('[live] broadcaster token rejected');
			return new Response('Not authorized.', { status: 401 });
		}
		role = 'broadcaster';
	} else {
		const auth = await authorizeViewer(request, config);
		if (!auth.ok) {
			console.warn(`[live] viewer socket rejected: ${auth.reason}`);
			return new Response('Not authorized.', { status: auth.status });
		}
		role = 'viewer';
	}

	// One logical room, always. Clients never supply a room id (§16).
	const stub = room.get(room.idFromName('main'));
	const target = new URL(request.url);
	target.searchParams.set('role', role);

	const response = await stub.fetch(new Request(target, request));
	const socket = (response as unknown as { webSocket?: WebSocket }).webSocket;
	if (!socket) {
		console.error('[live] durable object did not return a websocket');
		return new Response('Signaling failed.', { status: 500 });
	}

	// Rebuild the response so SvelteKit is free to attach headers to it — the
	// response handed back by a Durable Object has immutable headers.
	const headers = new Headers();
	const negotiated = response.headers.get('sec-websocket-protocol');
	if (negotiated) headers.set('sec-websocket-protocol', negotiated);
	else if (offered.includes(WS_PROTOCOL)) headers.set('sec-websocket-protocol', WS_PROTOCOL);

	return new Response(null, {
		status: 101,
		headers,
		// `webSocket` is a Cloudflare extension to ResponseInit.
		webSocket: socket
	} as ResponseInit & { webSocket: WebSocket });
};
