/** Development-only disk store. Production uses Supabase, never a Worker filesystem. */
import { mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
	emptyLibrary,
	MAX_LIBRARY_BYTES,
	MAX_REVISION,
	normalizeLibrary
} from '$lib/labbook/model';
import type { Library } from '$lib/labbook/types';
const directory = () => resolve(process.env.LABBOOK_LOCAL_DIR || '.labbook');
export async function readLocalLibrary(): Promise<Library> {
	try {
		return normalizeLibrary(JSON.parse(await readFile(join(directory(), 'library.json'), 'utf8')))
			.state;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyLibrary();
		throw error;
	}
}
const storageError = (message: string, status: number) =>
	Object.assign(new Error(message), { status });
const busy = () => storageError('Another save is running. Retry in a moment.', 409);
function processAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
	}
}
async function removeRetiredLock(path: string, owner: string): Promise<void> {
	await unlink(join(path, owner)).catch(() => {});
	await rmdir(path).catch(() => {});
}
async function acquireLock(dir: string): Promise<() => Promise<void>> {
	const lock = join(dir, '.save-lock');
	const token = crypto.randomUUID(),
		owner = `owner-${process.pid}-${token}`;
	const prepared = join(dir, `.save-lock-${token}`);
	await mkdir(prepared);
	try {
		await writeFile(join(prepared, owner), '', { flag: 'wx' });
		for (let attempt = 0; attempt < 5; attempt++) {
			let entries: string[];
			try {
				entries = await readdir(lock);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
				try {
					// Publishing the directory atomically never leaves an ownerless active lock.
					await rename(prepared, lock);
					return async () => {
						const retired = `${prepared}-released`;
						await rename(lock, retired);
						await removeRetiredLock(retired, owner);
					};
				} catch (error) {
					if (
						!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(
							(error as NodeJS.ErrnoException).code || ''
						)
					)
						throw error;
					continue;
				}
			}
			const previous = entries.length === 1 ? entries[0] : '';
			const match = /^owner-([1-9]\d*)-[0-9a-f-]{36}$/.exec(previous);
			if (!match)
				throw storageError(
					'An older or incomplete save lock remains. Stop Labbook before removing .labbook/.save-lock, then restart.',
					503
				);
			if (processAlive(Number(match[1]))) throw busy();
			try {
				// Claim this exact dead owner's marker. A competing reclaimer can only lose.
				await rename(join(lock, previous), join(lock, owner));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
				throw error;
			}
			const retired = `${prepared}-stale-${attempt}`;
			await rename(lock, retired);
			await removeRetiredLock(retired, owner);
		}
		throw busy();
	} finally {
		await removeRetiredLock(prepared, owner);
	}
}

export async function saveLocalLibrary(raw: unknown): Promise<{ revision: number }> {
	if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== 2)
		throw storageError('Reload Labbook before saving. A version 2 library is required.', 400);
	let state: Library;
	try {
		state = normalizeLibrary(raw).state;
	} catch (error) {
		throw storageError(error instanceof Error ? error.message : 'Invalid library.', 400);
	}
	if (state.revision >= MAX_REVISION)
		throw storageError(
			'The library revision limit has been reached. Export a backup before continuing.',
			409
		);
	if (new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_LIBRARY_BYTES)
		throw storageError('The library exceeds the 50 MB limit.', 413);
	const dir = directory();
	await mkdir(dir, { recursive: true });
	const release = await acquireLock(dir);
	try {
		const current = await readLocalLibrary();
		if (state.revision !== current.revision)
			throw Object.assign(
				new Error(
					'Another tab saved newer notes. Export your changes and reload before continuing.'
				),
				{ status: 409 }
			);
		const next = { ...state, revision: current.revision + 1 },
			temporary = join(dir, `library-${crypto.randomUUID()}.tmp`);
		await writeFile(temporary, JSON.stringify(next, null, 2), 'utf8');
		try {
			await writeFile(join(dir, 'library.backup.json'), await readFile(join(dir, 'library.json')));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
		await rename(temporary, join(dir, 'library.json'));
		return { revision: next.revision };
	} finally {
		await release();
	}
}
