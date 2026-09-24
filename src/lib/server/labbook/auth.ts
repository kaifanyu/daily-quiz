import { dev } from '$app/environment';
import type { RequestEvent } from '@sveltejs/kit';

export interface NotebookAccess {
	canRead: boolean;
	canEdit: boolean;
	local: boolean;
	loginConfigured: boolean;
}
export const SESSION_COOKIE = 'labbook_owner';
const MAX_AGE = 60 * 60 * 12;
const encoder = new TextEncoder();

export function notebookSetting(platform: App.Platform | undefined, name: string): string {
	const value = (platform?.env as Record<string, unknown> | undefined)?.[name];
	if (typeof value === 'string') return value;
	return typeof process !== 'undefined' ? (process.env[name] ?? '') : '';
}

export function isLocalNotebook(event: Pick<RequestEvent, 'url' | 'platform'>): boolean {
	return (
		dev &&
		['localhost', '127.0.0.1', '[::1]'].includes(event.url.hostname) &&
		notebookSetting(event.platform, 'LABBOOK_STORAGE') !== 'cloud'
	);
}

const password = (platform: App.Platform | undefined) =>
	notebookSetting(platform, 'LABBOOK_ADMIN_PASSWORD');
function encode(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}
function decode(text: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(
		atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)),
		(c) => c.charCodeAt(0)
	);
}
async function key(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}
export async function verifyOwnerPassword(
	platform: App.Platform | undefined,
	supplied: string
): Promise<boolean> {
	const expected = password(platform);
	if (expected.length < 20 || supplied.length > 4096) return false;
	const signingKey = await key(expected);
	const signature = await crypto.subtle.sign('HMAC', signingKey, encoder.encode(expected));
	return crypto.subtle.verify('HMAC', signingKey, signature, encoder.encode(supplied));
}
export async function createOwnerSession(event: RequestEvent): Promise<void> {
	const payload = encode(
		encoder.encode(
			JSON.stringify({ exp: Math.floor(Date.now() / 1000) + MAX_AGE, nonce: crypto.randomUUID() })
		)
	);
	const signature = encode(
		new Uint8Array(
			await crypto.subtle.sign('HMAC', await key(password(event.platform)), encoder.encode(payload))
		)
	);
	event.cookies.set(SESSION_COOKIE, `${payload}.${signature}`, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'strict',
		maxAge: MAX_AGE
	});
}
export async function getNotebookAccess(event: RequestEvent): Promise<NotebookAccess> {
	const local = isLocalNotebook(event),
		secret = password(event.platform),
		loginConfigured = secret.length >= 20;
	let owner = false;
	const token = event.cookies.get(SESSION_COOKIE);
	if (loginConfigured && token && token.length < 1024) {
		try {
			const [payload, signature, extra] = token.split('.');
			if (
				!extra &&
				payload &&
				signature &&
				(await crypto.subtle.verify(
					'HMAC',
					await key(secret),
					decode(signature),
					encoder.encode(payload)
				))
			) {
				const data = JSON.parse(new TextDecoder().decode(decode(payload))),
					now = Math.floor(Date.now() / 1000);
				owner = Number.isInteger(data.exp) && data.exp > now && data.exp <= now + MAX_AGE;
			}
		} catch {
			/* Invalid sessions never grant access. */
		}
	}
	const canEdit = local || owner;
	return {
		canRead: canEdit || notebookSetting(event.platform, 'LABBOOK_PUBLIC_READ') !== 'false',
		canEdit,
		local,
		loginConfigured
	};
}
