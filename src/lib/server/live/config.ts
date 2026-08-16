/**
 * Configuration for the /live private webcam app.
 *
 * Everything here is read server-side only (SR-08, SR-21). Values come from
 * `platform.env` on Workers (`.dev.vars` locally, `wrangler secret put` in prod)
 * with a `process.env` fallback for plain Node tooling.
 */

export interface LiveConfig {
	/** Cloudflare Access team domain, e.g. `myteam.cloudflareaccess.com`. */
	accessTeamDomain: string;
	/** Cloudflare Access application audience (AUD) tag. */
	accessAud: string;
	/** The single email allowed to view the stream. */
	viewerEmail: string;
	/** Cute window title shown to the viewer. */
	title: string;
	/** Shared secret the local broadcaster presents when it opens the socket. */
	broadcasterToken: string;
	/** Comma-separated STUN urls. */
	stunUrls: string[];
	turnUrl: string;
	turnUsername: string;
	turnCredential: string;
	/** coturn `static-auth-secret` — enables short-lived REST credentials. */
	turnSecret: string;
	/** Cloudflare Realtime TURN key (preferred: short-lived creds, no VPS). */
	cfTurnKeyId: string;
	cfTurnApiToken: string;
	/** Relay all media through TURN instead of trying peer-to-peer first. */
	forceTurn: boolean;
	/**
	 * Dev-only escape hatch. Only honoured when the request is local AND the
	 * platform is not a real deployment. Never enables itself silently.
	 */
	devOpen: boolean;
}

type EnvSource = Record<string, string | undefined> | undefined;

function read(platform: App.Platform | undefined, key: string): string {
	const fromPlatform = (platform?.env as EnvSource)?.[key];
	if (fromPlatform !== undefined && fromPlatform !== '') return fromPlatform;
	if (typeof process !== 'undefined' && process.env) {
		const fromProcess = process.env[key];
		if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
	}
	return '';
}

function bool(value: string): boolean {
	return value.toLowerCase() === 'true' || value === '1';
}

export function getLiveConfig(platform: App.Platform | undefined): LiveConfig {
	const stun = read(platform, 'STUN_URLS');
	return {
		accessTeamDomain: read(platform, 'CF_ACCESS_TEAM_DOMAIN').replace(/^https?:\/\//, ''),
		accessAud: read(platform, 'CF_ACCESS_AUD'),
		viewerEmail: read(platform, 'AUTHORIZED_VIEWER_EMAIL').trim().toLowerCase(),
		title: read(platform, 'LIVE_TITLE') || 'our little window ♡',
		broadcasterToken: read(platform, 'BROADCASTER_TOKEN'),
		stunUrls: stun
			? stun
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			: ['stun:stun.cloudflare.com:3478'],
		turnUrl: read(platform, 'TURN_URL'),
		turnUsername: read(platform, 'TURN_USERNAME'),
		turnCredential: read(platform, 'TURN_CREDENTIAL'),
		turnSecret: read(platform, 'TURN_SECRET'),
		cfTurnKeyId: read(platform, 'CF_TURN_KEY_ID'),
		cfTurnApiToken: read(platform, 'CF_TURN_API_TOKEN'),
		forceTurn: bool(read(platform, 'FORCE_TURN')),
		devOpen: bool(read(platform, 'LIVE_DEV_OPEN'))
	};
}

/** Access can only be enforced once both the team domain and the AUD are known. */
export function isAccessConfigured(config: LiveConfig): boolean {
	return Boolean(config.accessTeamDomain && config.accessAud && config.viewerEmail);
}
