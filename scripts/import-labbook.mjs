#!/usr/bin/env node
/**
 * Node 22.18+ (native TypeScript support). No network or writes without --apply.
 *   node scripts/import-labbook.mjs --file ../Research/_Paper/data/library.json
 *   node scripts/import-labbook.mjs --file <library.json> --apply [--merge]
 * Never prints credentials or note contents. Does not change the source library.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import {
	emptyLibrary,
	MAX_LIBRARY_BYTES,
	normalizeLibrary,
	parseBackup,
	sameRecord
} from '../src/lib/labbook/model.ts';

const projectRoot = path.resolve(import.meta.dirname, '..');

function options(args) {
	const result = {
		file: path.resolve(projectRoot, '../Research/_Paper/data/library.json'),
		env: path.join(projectRoot, '.dev.vars'),
		apply: false,
		merge: false,
		backupDir: undefined,
		help: false
	};
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === '--apply') result.apply = true;
		else if (argument === '--merge') result.merge = true;
		else if (argument === '--help' || argument === '-h') result.help = true;
		else if (['--file', '--env-file', '--backup-dir'].includes(argument)) {
			const value = args[++index];
			if (!value || value.startsWith('--')) throw new Error(`${argument} needs a path.`);
			result[argument === '--file' ? 'file' : argument === '--env-file' ? 'env' : 'backupDir'] =
				path.resolve(value);
		} else throw new Error(`Unknown argument: ${argument}`);
	}
	return result;
}

const summary = (state) =>
	`${state.papers.length} papers, ${state.concepts.length} concepts, ${Object.keys(state.attachments).length} attachments`;

function mergeLibraries(remote, incoming) {
	const result = structuredClone(remote);
	const attachmentMap = new Map();
	for (const [id, value] of Object.entries(incoming.attachments)) {
		const existing = Object.hasOwn(result.attachments, id) ? result.attachments[id] : undefined;
		let destination = id;
		if (existing && !sameRecord(existing, value)) {
			const previouslyImported = Object.entries(result.attachments).find(([, saved]) =>
				sameRecord(saved, value)
			);
			if (previouslyImported) destination = previouslyImported[0];
			else {
				do destination = randomUUID();
				while (Object.hasOwn(result.attachments, destination));
			}
		}
		attachmentMap.set(id, destination);
		Object.defineProperty(result.attachments, destination, {
			value: structuredClone(value),
			enumerable: true,
			configurable: true,
			writable: true
		});
	}
	const used = new Set([...result.papers, ...result.concepts].map((entry) => entry.id));
	let added = 0;
	let skipped = 0;
	const withoutId = ({ id: _id, ...value }) => value;
	for (const collection of ['papers', 'concepts']) {
		for (const source of incoming[collection]) {
			const entry = structuredClone(source);
			for (const key of Object.keys(entry.notes)) {
				entry.notes[key] = entry.notes[key].replace(
					/\(attachment:([A-Za-z0-9_-]+)\)/g,
					(_match, id) => `(attachment:${attachmentMap.get(id) ?? id})`
				);
			}
			if (entry.pdfId) entry.pdfId = attachmentMap.get(entry.pdfId) ?? entry.pdfId;
			if (
				result[collection].some((existing) => sameRecord(withoutId(existing), withoutId(entry)))
			) {
				skipped++;
				continue;
			}
			if (used.has(entry.id)) {
				do entry.id = randomUUID();
				while (used.has(entry.id));
			}
			used.add(entry.id);
			result[collection].push(entry);
			added++;
		}
	}
	return { state: normalizeLibrary(result).state, added, skipped };
}

function requireSize(state) {
	if (Buffer.byteLength(JSON.stringify(state), 'utf8') > MAX_LIBRARY_BYTES) {
		throw new Error('The resulting library exceeds the 50 MB limit. Nothing was uploaded.');
	}
}

async function readRemote(db) {
	const { data, error } = await db
		.from('research_libraries')
		.select('revision,state')
		.eq('id', 'default')
		.maybeSingle();
	if (error) {
		if (['42P01', '42501', 'PGRST205'].includes(error.code)) {
			throw new Error(
				'Remote Labbook storage is not ready. Apply 0004_labbook.sql with an administrator account first.'
			);
		}
		throw new Error(
			'Could not read the remote library. Check the server credentials and connection.'
		);
	}
	if (!data) return { original: emptyLibrary(), state: emptyLibrary() };
	const { state } = normalizeLibrary(data.state);
	if (state.revision !== data.revision)
		throw new Error('The remote revision is inconsistent. Nothing was uploaded.');
	return { original: data.state, state };
}

async function main() {
	const args = options(process.argv.slice(2));
	if (args.help) {
		console.log(
			'Usage: node scripts/import-labbook.mjs [--file library.json] [--env-file .dev.vars] [--apply] [--merge] [--backup-dir folder]'
		);
		console.log(
			'Default is a local-only dry run. --apply uploads after saving source and remote snapshots; --merge preserves a nonempty remote library.'
		);
		return;
	}
	const sourceStat = await stat(args.file);
	if (!sourceStat.isFile() || sourceStat.size > MAX_LIBRARY_BYTES) {
		throw new Error('The source must be a JSON library or backup no larger than 50 MB.');
	}
	const original = await readFile(args.file);
	let incoming;
	try {
		incoming = parseBackup(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(original)));
	} catch (error) {
		const reason =
			error instanceof SyntaxError || error instanceof TypeError
				? 'invalid UTF-8 JSON'
				: error instanceof Error
					? error.message
					: 'invalid library';
		throw new Error(`The source library could not be validated: ${reason}`);
	}
	requireSize(incoming);
	console.log(`Validated local library: ${summary(incoming)}.`);
	if (!args.apply) {
		console.log('Dry run complete. No network requests, file changes, or uploads were made.');
		console.log(
			'Use --apply to import; include --merge to preserve and combine an existing remote library.'
		);
		return;
	}
	let fileEnv = {};
	try {
		fileEnv = parseEnv(await readFile(args.env, 'utf8'));
	} catch (error) {
		if (error?.code !== 'ENOENT')
			throw new Error('Could not read the environment configuration file.');
	}
	const url = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key)
		throw new Error(
			'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .dev.vars or the environment before applying.'
		);
	const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
	const remote = await readRemote(db);
	const nonempty =
		remote.state.papers.length ||
		remote.state.concepts.length ||
		Object.keys(remote.state.attachments).length;
	if (nonempty && !args.merge) {
		throw new Error(
			'The remote library already contains notes or attachments. Nothing was uploaded. Use --merge to preserve them and import additional entries.'
		);
	}
	const merged = args.merge
		? mergeLibraries(remote.state, incoming)
		: {
				state: { ...incoming, revision: remote.state.revision },
				added: incoming.papers.length + incoming.concepts.length,
				skipped: 0
			};
	requireSize(merged.state);
	const backupRoot = args.backupDir ?? path.join(path.dirname(args.file), 'labbook-import-backups');
	const backupDir = path.join(
		backupRoot,
		`${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
	);
	await mkdir(backupDir, { recursive: true, mode: 0o700 });
	await writeFile(path.join(backupDir, 'source.json'), original, { flag: 'wx', mode: 0o600 });
	await writeFile(
		path.join(backupDir, 'remote-before-import.json'),
		JSON.stringify(remote.original, null, 2),
		{ flag: 'wx', mode: 0o600 }
	);
	console.log(`Saved local source and remote snapshots in ${backupDir}.`);
	const { data, error } = await db.rpc('save_research_library', {
		expected_revision: remote.state.revision,
		next_state: merged.state
	});
	if (error)
		throw new Error(
			'The remote save could not be confirmed. The source and snapshots are intact; inspect the remote library before retrying.'
		);
	if (data?.saved === false)
		throw new Error(
			'The remote library changed during import. No notes were overwritten. Review its latest contents and retry.'
		);
	if (data?.saved !== true || data.revision !== remote.state.revision + 1) {
		throw new Error(
			'Unexpected save response. Inspect the remote library before retrying; local snapshots are available.'
		);
	}
	const verified = await readRemote(db);
	if (
		verified.state.revision === data.revision &&
		!sameRecord(verified.state, { ...merged.state, revision: data.revision })
	) {
		throw new Error(
			'The uploaded library did not match during verification. Keep the snapshots and inspect the database before retrying.'
		);
	}
	console.log(
		`Imported ${merged.added} entries; skipped ${merged.skipped} duplicates. Saved revision ${data.revision}.`
	);
	if (verified.state.revision !== data.revision)
		console.log(
			'The library received another save after import; inspect its current version before making further changes.'
		);
	console.log('The source library was not modified.');
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : 'Import failed.');
	process.exitCode = 1;
});
