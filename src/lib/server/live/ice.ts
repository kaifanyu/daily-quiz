/**
 * ICE server configuration.
 *
 * TURN credentials are minted per request and short-lived wherever possible —
 * they are never baked into the client bundle (SR-14 / §7 "STUN/TURN").
 *
 * Three sources are supported, in order of preference:
 *   1. Cloudflare Realtime TURN  (CF_TURN_KEY_ID + CF_TURN_API_TOKEN)
 *   2. coturn REST credentials   (TURN_URL + TURN_SECRET)
 *   3. static TURN credentials   (TURN_URL + TURN_USERNAME + TURN_CREDENTIAL)
 */

import type { LiveConfig } from './config';

export interface IceServer {
	urls: string | string[];
	username?: string;
	credential?: string;
}

export interface IceConfig {
	iceServers: IceServer[];
	iceTransportPolicy: 'all' | 'relay';
	/** Seconds until the returned credentials stop working. */
	ttl: number;
}

const TURN_TTL_SECONDS = 2 * 60 * 60;

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/** coturn `use-auth-secret` scheme: username is `<unix-expiry>:<name>`. */
async function coturnCredentials(
	secret: string,
	name = 'live'
): Promise<{ username: string; credential: string }> {
	const username = `${Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS}:${name}`;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret) as unknown as BufferSource,
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(username) as unknown as BufferSource
	);
	return { username, credential: toBase64(new Uint8Array(signature)) };
}

async function cloudflareTurn(
	config: LiveConfig,
	fetchImpl: typeof fetch
): Promise<IceServer | null> {
	try {
		const response = await fetchImpl(
			`https://rtc.live.cloudflare.com/v1/turn/keys/${config.cfTurnKeyId}/credentials/generate-ice-servers`,
			{
				method: 'POST',
				headers: {
					authorization: `Bearer ${config.cfTurnApiToken}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ ttl: TURN_TTL_SECONDS })
			}
		);
		if (!response.ok) {
			console.warn('[live] cloudflare turn request failed', response.status);
			return null;
		}
		const body = (await response.json()) as { iceServers?: IceServer | IceServer[] };
		const servers = body.iceServers;
		if (!servers) return null;
		return Array.isArray(servers) ? (servers[0] ?? null) : servers;
	} catch (error) {
		console.warn('[live] cloudflare turn request errored', (error as Error).message);
		return null;
	}
}

export async function buildIceConfig(
	config: LiveConfig,
	fetchImpl: typeof fetch = fetch
): Promise<IceConfig> {
	const iceServers: IceServer[] = [];
	if (config.stunUrls.length > 0) iceServers.push({ urls: config.stunUrls });

	let hasTurn = false;

	if (config.cfTurnKeyId && config.cfTurnApiToken) {
		const server = await cloudflareTurn(config, fetchImpl);
		if (server) {
			iceServers.push(server);
			hasTurn = true;
		}
	}

	if (!hasTurn && config.turnUrl && config.turnSecret) {
		const { username, credential } = await coturnCredentials(config.turnSecret);
		iceServers.push({ urls: config.turnUrl, username, credential });
		hasTurn = true;
	}

	if (!hasTurn && config.turnUrl && config.turnUsername && config.turnCredential) {
		iceServers.push({
			urls: config.turnUrl,
			username: config.turnUsername,
			credential: config.turnCredential
		});
		hasTurn = true;
	}

	return {
		iceServers,
		// Relaying without a TURN server would make the call impossible, so only
		// honour FORCE_TURN once we actually have one.
		iceTransportPolicy: config.forceTurn && hasTurn ? 'relay' : 'all',
		ttl: TURN_TTL_SECONDS
	};
}
