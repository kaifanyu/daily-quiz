import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import {
	allEntries,
	attachmentIds,
	emptyLibrary,
	emptyNotes,
	normalizeLibrary,
	parseBackup,
	sameRecord
} from '../src/lib/labbook/model.ts';

const date = '2026-09-24T00:00:00.000Z';
const paper = (id = 'paper-1') => ({
	id,
	title: 'Test paper',
	authors: 'Ada Example',
	year: '2026',
	tags: ['robotics'],
	url: 'https://example.org/paper',
	addedAt: date,
	updatedAt: date,
	notes: emptyNotes(),
	scratchpad: ''
});
const concept = (id = 'concept-1') => ({
	id,
	title: 'Feedback control',
	tags: ['control'],
	url: '',
	addedAt: date,
	updatedAt: date,
	notes: emptyNotes('concept')
});
const library = () => ({
	...emptyLibrary(),
	revision: 7,
	papers: [paper()],
	concepts: [concept()]
});
const image = () => ({
	name: 'diagram.png',
	mime: 'image/png',
	data: 'data:image/png;base64,aW1hZ2U='
});

test('empty libraries and note maps have independent mutable state', () => {
	const one = emptyLibrary();
	one.papers.push(paper());
	assert.equal(emptyLibrary().papers.length, 0);
	const notes = emptyNotes('concept');
	notes['what-it-does'] = 'changed';
	assert.equal(emptyNotes('concept')['what-it-does'], '');
	assert.deepEqual(Object.keys(emptyNotes()), [
		'input-output',
		'what-it-does',
		'how-it-does',
		'pseudocode',
		'results'
	]);
});

test('version one migration preserves all old notes and attachments without mutating its source', () => {
	const original = { ...library(), version: 1 };
	delete original.concepts;
	original.papers[0].notes['input-output'] = 'Inputs and outputs';
	original.papers[0].notes['what-it-does'] = 'Existing summary';
	original.papers[0].notes.pseudocode = 'Old algorithm';
	original.papers[0].scratchpad = '- Keep this idea\n![diagram](attachment:image-1)';
	original.attachments['image-1'] = image();
	const snapshot = structuredClone(original);
	const result = normalizeLibrary(original);
	assert.equal(result.changed, true);
	assert.equal(result.state.revision, 7);
	assert.equal(result.state.version, 2);
	assert.equal(
		result.state.papers[0].notes['what-it-does'],
		'Existing summary\n\nInputs and outputs'
	);
	assert.equal(result.state.papers[0].notes['input-output'], '');
	assert.equal(result.state.papers[0].notes.pseudocode, 'Old algorithm');
	assert.equal(result.state.papers[0].scratchpad, '');
	assert.equal(result.state.concepts[0].title, 'Ideas — Test paper');
	assert.equal(result.state.concepts[0].notes['what-it-does'], snapshot.papers[0].scratchpad);
	assert.deepEqual(result.state.attachments, snapshot.attachments);
	assert.deepEqual(original, snapshot);
	assert.deepEqual(normalizeLibrary(result.state), { state: result.state, changed: false });
});

test('concept section migration combines text in order and is idempotent', () => {
	const original = library();
	original.concepts[0].notes = {
		'what-it-does': 'Definition\n',
		'how-it-does': 'How it works',
		results: 'An example'
	};
	const result = normalizeLibrary(original);
	assert.equal(
		result.state.concepts[0].notes['what-it-does'],
		'Definition\n\n\nHow it works\n\nAn example'
	);
	assert.equal(result.state.concepts[0].notes['how-it-does'], '');
	assert.equal(result.state.concepts[0].notes.results, '');
	assert.equal(normalizeLibrary(result.state).changed, false);
	assert.equal(original.concepts[0].notes.results, 'An example');
});

test('scratchpad migration avoids occupied IDs and does not create duplicate migrated ideas', () => {
	const original = library();
	original.papers[0].scratchpad = '- An idea';
	original.concepts[0].id = 'ideas-paper-1';
	const first = normalizeLibrary(original).state;
	assert.equal(first.concepts[1].id, 'ideas-paper-1-1');
	first.papers[0].scratchpad = '- An idea';
	const second = normalizeLibrary(first).state;
	assert.equal(second.concepts.length, 2);
	assert.equal(second.papers[0].scratchpad, '');
});

test('legacy backups accept preview metadata and inline attachment data', () => {
	const result = parseBackup({
		papers: [
			{ id: 'legacy', title: 'Preview notes', meta: 'Author', notes: { results: 'A result' } }
		],
		attachments: { image: image().data }
	});
	assert.equal(result.papers[0].authors, 'Author');
	assert.equal(result.papers[0].notes.results, 'A result');
	assert.equal(result.papers[0].notes.pseudocode, '');
	assert.equal(result.attachments.image.name, 'Imported image');
	assert.equal(result.revision, 0);
});

test('library export metadata is accepted only by the backup parser', () => {
	const backup = { ...library(), format: 'labbook-library', exportedAt: date };
	assert.deepEqual(parseBackup(backup), library());
	assert.throws(() => normalizeLibrary(backup), /unsupported fields/);
	assert.throws(() => parseBackup({ ...backup, format: 'unrelated-app' }), /not a Labbook backup/);
});

test('invalid entries and dangling PDFs fail instead of dropping their data', () => {
	const mutations = [
		(state) => state.concepts.push(structuredClone(state.concepts[0])),
		(state) => {
			state.concepts[0].id = state.papers[0].id;
		},
		(state) => {
			state.concepts[0].notes.pseudocode = 'unexpected';
		},
		(state) => {
			state.papers[0].notes = {};
		},
		(state) => {
			state.concepts[0].pdfId = 'missing';
		},
		(state) => {
			state.attachments.image = image();
			state.concepts[0].pdfId = 'image';
		},
		(state) => {
			state.concepts[0].title = '\ud800';
		},
		(state) => {
			state.concepts[0].url = 'javascript:alert(1)';
		},
		(state) => {
			state.concepts[0].tags = [true];
		},
		(state) => {
			state.revision = true;
		},
		(state) => {
			state.concepts[0].scratchpad = 'unexpected';
		},
		(state) => {
			state.attachments.image = { ...image(), data: 'data:image/png;base64,%%%=' };
		}
	];
	for (const mutation of mutations) {
		const state = library();
		mutation(state);
		const snapshot = structuredClone(state);
		assert.throws(() => normalizeLibrary(state));
		assert.deepEqual(state, snapshot);
	}
});

test('a failed note migration does not truncate or mutate source text', () => {
	const original = library();
	original.concepts[0].notes['what-it-does'] = 'x'.repeat(1000000);
	original.concepts[0].notes.results = 'y'.repeat(1000000);
	assert.throws(() => normalizeLibrary(original), /Combined concept note/);
	assert.equal(original.concepts[0].notes.results.length, 1000000);
});

test('shared attachments, hidden legacy notes, and prototype-like IDs are retained', () => {
	const state = library();
	state.attachments = JSON.parse(
		'{"__proto__":{"name":"diagram.png","mime":"image/png","data":"data:image/png;base64,aW1hZ2U="}}'
	);
	state.attachments.pdf = {
		name: 'paper.pdf',
		mime: 'application/pdf',
		data: 'data:application/pdf;base64,cGRm'
	};
	state.papers[0].notes.pseudocode = '![image](attachment:__proto__)';
	state.concepts[0].notes['what-it-does'] = '![image](attachment:__proto__)';
	state.papers[0].pdfId = 'pdf';
	state.concepts[0].pdfId = 'pdf';
	const normalized = normalizeLibrary(state).state;
	assert.equal(Object.hasOwn(normalized.attachments, '__proto__'), true);
	assert.deepEqual([...attachmentIds(allEntries(normalized))].sort(), ['__proto__', 'pdf']);
	assert.deepEqual(normalized.attachments, state.attachments);
});

test('record comparisons ignore key order and distinguish text or array changes', () => {
	assert.equal(sameRecord({ a: 1, b: ['x'] }, { b: ['x'], a: 1 }), true);
	assert.equal(sameRecord({ a: ['x'] }, { a: ['y'] }), false);
	assert.equal(sameRecord([], {}), false);
});

test('import defaults to a local-only dry run and never prints private note contents', async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'labbook-import-test-'));
	try {
		const file = path.join(directory, 'library.json');
		const state = library();
		state.papers[0].notes.results = 'PRIVATE_TEST_NOTE';
		const source = JSON.stringify(state);
		await writeFile(file, source);
		const result = spawnSync(process.execPath, ['scripts/import-labbook.mjs', '--file', file], {
			cwd: path.resolve(import.meta.dirname, '..'),
			encoding: 'utf8',
			timeout: 15000,
			env: {
				...process.env,
				SUPABASE_URL: 'http://127.0.0.1:1',
				SUPABASE_SERVICE_ROLE_KEY: 'PRIVATE_TEST_KEY'
			}
		});
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /No network requests, file changes, or uploads/);
		assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_TEST_NOTE|PRIVATE_TEST_KEY/);
		assert.equal(await readFile(file, 'utf8'), source);
		await writeFile(file, '{"private": "PRIVATE_TEST_NOTE", broken');
		const invalid = spawnSync(process.execPath, ['scripts/import-labbook.mjs', '--file', file], {
			cwd: path.resolve(import.meta.dirname, '..'),
			encoding: 'utf8',
			timeout: 15000
		});
		assert.equal(invalid.status, 1);
		assert.doesNotMatch(invalid.stdout + invalid.stderr, /PRIVATE_TEST_NOTE/);
	} finally {
		assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
		await rm(directory, { recursive: true, force: true });
	}
});

test('import snapshots before guarded merges and preserves colliding entries and attachments', async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'labbook-merge-test-'));
	let remote = library();
	remote.papers[0].notes.results = 'Existing remote paper';
	remote.attachments.image = { ...image(), data: 'data:image/png;base64,b2xk' };
	const originalRemote = structuredClone(remote);
	let writes = 0;
	let conflictNext = false;
	const fakeDatabase = createServer(async (request, response) => {
		response.setHeader('content-type', 'application/json');
		if (request.method === 'GET' && request.url.startsWith('/rest/v1/research_libraries?')) {
			response.end(JSON.stringify([{ revision: remote.revision, state: remote }]));
			return;
		}
		if (request.method === 'POST' && request.url === '/rest/v1/rpc/save_research_library') {
			const chunks = [];
			for await (const chunk of request) chunks.push(chunk);
			const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
			if (conflictNext) {
				remote.revision++;
				conflictNext = false;
			}
			if (input.expected_revision !== remote.revision) {
				response.end(JSON.stringify({ saved: false, revision: remote.revision }));
				return;
			}
			remote = { ...input.next_state, revision: remote.revision + 1 };
			writes++;
			response.end(JSON.stringify({ saved: true, revision: remote.revision }));
			return;
		}
		response.statusCode = 404;
		response.end(JSON.stringify({ message: 'Unexpected test request' }));
	});
	await new Promise((resolve, reject) => {
		fakeDatabase.once('error', reject);
		fakeDatabase.listen(0, '127.0.0.1', resolve);
	});
	try {
		const file = path.join(directory, 'library.json');
		const sourceState = library();
		sourceState.papers[0].notes.results = 'Incoming paper ![diagram](attachment:image)';
		sourceState.attachments.image = image();
		const source = JSON.stringify(sourceState);
		await writeFile(file, source);
		const run = (extra = []) =>
			new Promise((resolve, reject) => {
				const child = spawn(
					process.execPath,
					['scripts/import-labbook.mjs', '--file', file, '--apply', ...extra],
					{
						cwd: path.resolve(import.meta.dirname, '..'),
						env: {
							...process.env,
							SUPABASE_URL: `http://127.0.0.1:${fakeDatabase.address().port}`,
							SUPABASE_SERVICE_ROLE_KEY: 'LOCAL_TEST_KEY'
						},
						windowsHide: true,
						timeout: 15000
					}
				);
				let output = '';
				child.stdout.on('data', (chunk) => (output += chunk));
				child.stderr.on('data', (chunk) => (output += chunk));
				child.once('error', reject);
				child.once('close', (status) => resolve({ status, output }));
			});
		const refused = await run();
		assert.equal(refused.status, 1, refused.output);
		assert.match(refused.output, /already contains notes or attachments/);
		assert.equal(writes, 0);
		assert.deepEqual(remote, originalRemote);
		const applied = await run(['--merge']);
		assert.equal(applied.status, 0, applied.output);
		assert.equal(writes, 1);
		assert.equal(remote.papers.length, 2);
		assert.equal(remote.concepts.length, 1);
		assert.equal(Object.keys(remote.attachments).length, 2);
		assert.equal(remote.papers[0].notes.results, 'Existing remote paper');
		assert.equal(remote.attachments.image.data, originalRemote.attachments.image.data);
		const importedId = remote.papers[1].notes.results.match(/attachment:([^)]*)/)[1];
		assert.notEqual(importedId, 'image');
		assert.deepEqual(remote.attachments[importedId], image());
		const snapshots = await readdir(path.join(directory, 'labbook-import-backups'));
		assert.equal(snapshots.length, 1);
		const snapshotDir = path.join(directory, 'labbook-import-backups', snapshots[0]);
		assert.equal(await readFile(path.join(snapshotDir, 'source.json'), 'utf8'), source);
		assert.deepEqual(
			JSON.parse(await readFile(path.join(snapshotDir, 'remote-before-import.json'), 'utf8')),
			originalRemote
		);
		const repeated = await run(['--merge']);
		assert.equal(repeated.status, 0, repeated.output);
		assert.equal(remote.papers.length, 2);
		assert.equal(Object.keys(remote.attachments).length, 2);
		assert.match(repeated.output, /Imported 0 entries; skipped 2 duplicates/);
		conflictNext = true;
		const beforeConflict = structuredClone(remote);
		const conflict = await run(['--merge']);
		assert.equal(conflict.status, 1, conflict.output);
		assert.match(conflict.output, /No notes were overwritten/);
		assert.deepEqual(remote, { ...beforeConflict, revision: beforeConflict.revision + 1 });
		assert.equal(writes, 2);
		assert.equal(await readFile(file, 'utf8'), source);
	} finally {
		await new Promise((resolve) => fakeDatabase.close(resolve));
		assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
		await rm(directory, { recursive: true, force: true });
	}
});
