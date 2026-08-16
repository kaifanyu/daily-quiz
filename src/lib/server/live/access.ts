/**
 * Cloudflare Access JWT verification (SR-03).
 *
 * The edge is the primary gate, but the application must never *assume* the edge
 * did its job — every request that reaches us is re-verified here: signature,
 * issuer, audience, expiry, and finally the exact authorized identity.
 *
 * Implemented with WebCrypto so it runs on the Workers runtime with no extra
 * dependency (SR-22).
 */

import type { LiveConfig } from './config';
import { isAccessConfigured } from './config';

export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';
export const ACCESS_COOKIE = 'CF_Authorization';

/** Allow a little clock drift when checking exp/nbf. */
const CLOCK_SKEW_SECONDS = 60;
/** JWKS are cached per isolate; Access rotates keys slowly. */
const JWKS_TTL_MS = 60 * 60 * 1000;

export type AuthResult =
	| { ok: true; email: string; via: 'access' | 'dev-bypass' }
	| { ok: false; status: 401 | 403 | 503; reason: AuthFailure };

export type AuthFailure =
	| 'not_configured'
	| 'missing_assertion'
	| 'invalid_assertion'
	| 'wrong_identity';

interface AccessPayload {
	aud?: string | string[];
	iss?: string;
	exp?: number;
	nbf?: number;
	email?: string;
	sub?: string;
	identity_nonce?: string;
}

interface CachedJwks {
	keys: JsonWebKey[];
	fetchedAt: number;
}

const jwksCache = new Map<string, CachedJwks>();

function base64UrlToBytes(input: string): Uint8Array {
	const padded = input.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function decodeJson<T>(segment: string): T | null {
	try {
		return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as T;
	} catch {
		return null;
	}
}

async function getJwks(teamDomain: string, fetchImpl: typeof fetch): Promise<JsonWebKey[]> {
	const cached = jwksCache.get(teamDomain);
	if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

	const response = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
	if (!response.ok) throw new Error(`Access certs request failed: ${response.status}`);
	const body = (await response.json()) as { keys?: JsonWebKey[] };
	const keys = body.keys ?? [];
	jwksCache.set(teamDomain, { keys, fetchedAt: Date.now() });
	return keys;
}

async function verifySignature(
	token: string,
	teamDomain: string,
	kid: string | undefined,
	fetchImpl: typeof fetch
): Promise<boolean> {
	const [headerB64, payloadB64, signatureB64] = token.split('.');
	const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
	const signature = base64UrlToBytes(signatureB64);

	let keys = await getJwks(teamDomain, fetchImpl);
	let candidates = kid ? keys.filter((k) => (k as { kid?: string }).kid === kid) : keys;

	// A rotated key we have not seen yet: refresh once before giving up.
	if (candidates.length === 0) {
		jwksCache.delete(teamDomain);
		keys = await getJwks(teamDomain, fetchImpl);
		candidates = kid ? keys.filter((k) => (k as { kid?: string }).kid === kid) : keys;
	}

	for (const jwk of candidates) {
		try {
			const key = await crypto.subtle.importKey(
				'jwk',
				{ ...jwk, alg: 'RS256', ext: true, key_ops: ['verify'] },
				{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
				false,
				['verify']
			);
			const valid = await crypto.subtle.verify(
				'RSASSA-PKCS1-v1_5',
				key,
				signature as unknown as BufferSource,
				data as unknown as BufferSource
			);
			if (valid) return true;
		} catch {
			// Try the next key.
		}
	}
	return false;
}

function readCookie(request: Request, name: string): string | undefined {
	const header = request.headers.get('cookie');
	if (!header) return undefined;
	for (const part of header.split(';')) {
		const [key, ...rest] = part.trim().split('=');
		if (key === name) return rest.join('=');
	}
	return undefined;
}

export function getAssertion(request: Request): string | undefined {
	return request.headers.get(ACCESS_JWT_HEADER) ?? readCookie(request, ACCESS_COOKIE) ?? undefined;
}

/** Loopback-only, and only when explicitly opted in — never silent in production. */
export function isDevBypassAllowed(request: Request, config: LiveConfig): boolean {
	if (!config.devOpen) return false;
	const host = new URL(request.url).hostname;
	return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/**
 * Verify the Access assertion and confirm it belongs to the one authorized viewer.
 * Deny by default: an unconfigured deployment serves nothing.
 */
export async function authorizeViewer(
	request: Request,
	config: LiveConfig,
	fetchImpl: typeof fetch = fetch,
	options: { requireExactViewer?: boolean } = {}
): Promise<AuthResult> {
	const requireExactViewer = options.requireExactViewer ?? true;
	if (isDevBypassAllowed(request, config)) {
		return { ok: true, email: config.viewerEmail || 'dev@localhost', via: 'dev-bypass' };
	}

	if (!isAccessConfigured(config)) {
		return { ok: false, status: 503, reason: 'not_configured' };
	}

	const token = getAssertion(request);
	if (!token) return { ok: false, status: 401, reason: 'missing_assertion' };

	const parts = token.split('.');
	if (parts.length !== 3) return { ok: false, status: 401, reason: 'invalid_assertion' };

	const header = decodeJson<{ alg?: string; kid?: string }>(parts[0]);
	const payload = decodeJson<AccessPayload>(parts[1]);
	if (!header || !payload) return { ok: false, status: 401, reason: 'invalid_assertion' };
	// Pin the algorithm: never let the token choose `none` or a symmetric alg.
	if (header.alg !== 'RS256') return { ok: false, status: 401, reason: 'invalid_assertion' };

	const now = Math.floor(Date.now() / 1000);
	if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < now) {
		return { ok: false, status: 401, reason: 'invalid_assertion' };
	}
	if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > now) {
		return { ok: false, status: 401, reason: 'invalid_assertion' };
	}
	if (payload.iss !== `https://${config.accessTeamDomain}`) {
		return { ok: false, status: 401, reason: 'invalid_assertion' };
	}
	const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
	if (!audiences.includes(config.accessAud)) {
		return { ok: false, status: 401, reason: 'invalid_assertion' };
	}

	let signatureValid = false;
	try {
		signatureValid = await verifySignature(token, config.accessTeamDomain, header.kid, fetchImpl);
	} catch {
		signatureValid = false;
	}
	if (!signatureValid) return { ok: false, status: 401, reason: 'invalid_assertion' };

	const email = (payload.email ?? '').trim().toLowerCase();
	// FR-02: one exact identity, no domain wildcards, no fallbacks.
	if (requireExactViewer && (!email || email !== config.viewerEmail)) {
		return { ok: false, status: 403, reason: 'wrong_identity' };
	}

	return { ok: true, email, via: 'access' };
}

/**
 * Weaker gate used only by the local broadcaster page: any identity Cloudflare
 * Access already let through may load the (inert) dashboard shell. Nothing
 * actually happens without the broadcaster token, which this never checks.
 */
export async function authorizeAnyAccessIdentity(
	request: Request,
	config: LiveConfig,
	fetchImpl: typeof fetch = fetch
): Promise<AuthResult> {
	return authorizeViewer(request, config, fetchImpl, { requireExactViewer: false });
}

/** Constant-time-ish comparison for the broadcaster token. */
export function tokenMatches(provided: string, expected: string): boolean {
	if (!expected || !provided) return false;
	const a = new TextEncoder().encode(provided);
	const b = new TextEncoder().encode(expected);
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}
