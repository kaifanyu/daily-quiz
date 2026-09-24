import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import { emptyLibrary, emptyNotes } from '../src/lib/labbook/model.ts';

// Node's transform mode also handles TypeScript constructor parameter properties.
// Resolve the one runtime relative import as a file URL without invoking Vite.
const clientUrl = new URL('../src/lib/labbook/client.ts', import.meta.url);
const modelUrl = new URL('../src/lib/labbook/model.ts', import.meta.url);
const source = (await readFile(clientUrl, 'utf8')).replace(
	/from ['"]\.\/model['"]/,
	`from '${modelUrl.href}'`
);
const transformed = stripTypeScriptTypes(source, { mode: 'transform', sourceUrl: clientUrl.href });
const { NotebookClient } = await import(
	`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`
);

const initialLibrary = () => ({
	...emptyLibrary(),
	papers: [
		{
			id: 'paper-1',
			title: 'Test paper',
			authors: 'Author',
			year: '2026',
			tags: [],
			url: '',
			addedAt: '2026-09-24T00:00:00.000Z',
			updatedAt: '2026-09-24T00:00:00.000Z',
			notes: { ...emptyNotes(), 'what-it-does': 'Original note' },
			scratchpad: ''
		}
	]
});
const note = (state) => state.papers[0].notes['what-it-does'];
const response = (status, body) => ({
	ok: status >= 200 && status < 300,
	status,
	json: async () => body
});

// The fake implements only the public IndexedDB operations the notebook uses.
// All requests and transaction completions run asynchronously; writes clone data.
class RecoveryDatabase {
	records = new Map();
	failWrites = false;
	open() {
		const request = {};
		request.result = {
			createObjectStore() {},
			transaction: () => this.transaction()
		};
		queueMicrotask(() => {
			request.onupgradeneeded?.();
			request.onsuccess?.();
		});
		return request;
	}
	transaction() {
		const transaction = {};
		const write = (operation) => {
			queueMicrotask(() => {
				if (this.failWrites) transaction.onerror?.();
				else {
					operation();
					transaction.oncomplete?.();
				}
			});
		};
		transaction.objectStore = () => ({
			getAll: () => {
				const request = {};
				queueMicrotask(() => {
					request.result = structuredClone([...this.records.values()]);
					request.onsuccess?.();
				});
				return request;
			},
			put: (record) => {
				const snapshot = structuredClone(record);
				write(() => this.records.set(snapshot.id, snapshot));
			},
			delete: (id) => write(() => this.records.delete(id))
		});
		return transaction;
	}
}

async function fixture(t, fetcher) {
	const cache = new RecoveryDatabase();
	const previousIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
	Object.defineProperty(globalThis, 'indexedDB', { value: cache, configurable: true });
	t.mock.method(globalThis, 'fetch', fetcher);
	const state = initialLibrary();
	const notices = [];
	const statuses = [];
	const client = new NotebookClient({
		getState: () => structuredClone(state),
		onRevision: (revision) => {
			state.revision = revision;
		},
		onStatus: (status, message) => statuses.push({ status, message }),
		onNotice: (message) => notices.push(message),
		storageMode: 'local'
	});
	await client.open();
	t.after(async () => {
		// A blocked writer flushes its recovery state and stops pending debounce work.
		client.conflict = true;
		await client.flush();
		if (previousIndexedDB) Object.defineProperty(globalThis, 'indexedDB', previousIndexedDB);
		else delete globalThis.indexedDB;
	});
	return {
		cache,
		state,
		client,
		notices,
		statuses,
		edit(text) {
			state.papers[0].notes['what-it-does'] = text;
			client.changed();
		}
	};
}

async function until(predicate) {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (predicate()) return;
		await nextTurn();
	}
	assert.fail('Expected asynchronous operation did not start');
}

test('flushing while an earlier save is in flight preserves and then saves the newest edit', async (t) => {
	let server = initialLibrary();
	const submitted = [];
	let releaseFirst;
	const firstResponse = new Promise((resolve) => {
		releaseFirst = resolve;
	});
	const f = await fixture(t, async (url, request) => {
		assert.equal(url, '/api/library');
		assert.equal(request.method, 'PUT');
		const snapshot = JSON.parse(request.body);
		submitted.push(snapshot);
		if (submitted.length === 1) await firstResponse;
		assert.equal(snapshot.revision, server.revision);
		server = { ...snapshot, revision: server.revision + 1 };
		return response(200, { revision: server.revision });
	});
	f.edit('First unsaved edit');
	const firstSave = f.client.flush();
	await until(() => submitted.length === 1);
	f.edit('Newest edit typed while saving');
	assert.equal(await f.client.flush(), false);
	assert.equal(note(server), 'Original note');
	assert.equal(note([...f.cache.records.values()][0].state), 'Newest edit typed while saving');
	releaseFirst();
	await firstSave;
	assert.equal(await f.client.settle(), true);
	assert.deepEqual(submitted.map(note), ['First unsaved edit', 'Newest edit typed while saving']);
	assert.equal(note(server), 'Newest edit typed while saving');
	assert.equal(server.revision, 2);
	assert.equal(f.state.revision, 2);
	assert.equal(f.client.dirty, false);
	assert.equal(f.cache.records.size, 0);
});

test('a revision conflict retains later edits for recovery without overwriting the server', async (t) => {
	const server = initialLibrary();
	server.revision = 4;
	server.papers[0].notes['what-it-does'] = 'Another tab saved this';
	let requests = 0;
	const f = await fixture(t, async () => {
		requests++;
		return response(409, { message: 'Conflict' });
	});
	f.edit('Draft before conflict');
	assert.equal(await f.client.flush(), false);
	f.edit('Latest draft after conflict');
	assert.equal(await f.client.flush(), false);
	assert.equal(requests, 1);
	assert.equal(note(server), 'Another tab saved this');
	const reopened = new NotebookClient({
		getState: () => structuredClone(server),
		onRevision() {},
		onStatus() {},
		onNotice() {},
		storageMode: 'local'
	});
	const recovered = await reopened.open();
	assert.equal(recovered.length, 1);
	assert.equal(note(recovered[0].state), 'Latest draft after conflict');
	assert.equal(f.client.dirty, true);
	assert.equal(f.client.conflict, true);
});

for (const failure of ['conflict', 'offline']) {
	test(`failed browser recovery plus ${failure} keeps edits and asks for export without claiming a saved draft`, async (t) => {
		const f = await fixture(t, async () => {
			if (failure === 'offline') throw new TypeError('Network unavailable');
			return response(409, { message: 'Conflict' });
		});
		f.cache.failWrites = true;
		f.edit('Unsaved text that must still be exportable');
		assert.equal(await f.client.flush(), false);
		assert.equal(f.cache.records.size, 0);
		assert.equal(note(f.state), 'Unsaved text that must still be exportable');
		assert.equal(f.client.dirty, true);
		const visibleNotice = f.notices.at(-1);
		assert.match(visibleNotice, /export/i);
		assert.match(visibleNotice, /unavailable|could not|not (?:be )?saved|not (?:be )?kept|failed/i);
		assert.doesNotMatch(visibleNotice, /draft is preserved|draft (?:was |is )?kept/i);
		assert.doesNotMatch(f.statuses.at(-1).message, /draft kept/i);
	});
}

for (const revision of [0, 2, 1.5, '1']) {
	test(`an invalid server acknowledgement (${JSON.stringify(revision)}) cannot discard the recoverable draft`, async (t) => {
		const f = await fixture(t, async () => response(200, { revision }));
		f.edit('Must survive an unconfirmed save');
		assert.equal(await f.client.flush(), false);
		assert.equal(f.state.revision, 0);
		assert.equal(f.client.dirty, true);
		assert.equal(note([...f.cache.records.values()][0].state), 'Must survive an unconfirmed save');
		assert.equal(f.statuses.at(-1).status, 'error');
	});
}
