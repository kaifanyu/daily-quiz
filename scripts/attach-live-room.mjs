/**
 * Post-build step for the /live app.
 *
 * `@sveltejs/adapter-cloudflare` generates `.svelte-kit/cloudflare/_worker.js`
 * and only exports the SvelteKit handler as `default`. A Durable Object class
 * has to be a named export of the Worker entrypoint, so we append that export
 * after the adapter has written the file. Wrangler bundles the TypeScript source
 * for us when it builds the Worker.
 *
 * Runs automatically as part of `yarn build`.
 */

import { existsSync, readFileSync, appendFileSync } from 'node:fs';

const WORKER = '.svelte-kit/cloudflare/_worker.js';
const EXPORT_LINE = "export { LiveRoom } from '../../src/lib/server/live/room.ts';";

if (!existsSync(WORKER)) {
	console.error(`[live] ${WORKER} not found — run \`vite build\` first.`);
	process.exit(1);
}

if (readFileSync(WORKER, 'utf8').includes(EXPORT_LINE)) {
	console.log('[live] LiveRoom export already present.');
} else {
	appendFileSync(
		WORKER,
		`\n\n// --- /live signaling room (added by scripts/attach-live-room.mjs)\n${EXPORT_LINE}\n`
	);
	console.log('[live] LiveRoom durable object exported from the worker entrypoint.');
}
