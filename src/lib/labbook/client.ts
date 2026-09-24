import type { Library } from './types';
import { sameRecord } from './model';

export type SaveStatus = 'saved' | 'saving' | 'error' | 'conflict';
export type BrowserDraft = { id: string; state: Library; savedAt: number };
type Options = {
	getState: () => Library;
	onRevision: (revision: number) => void;
	onStatus: (status: SaveStatus, message: string) => void;
	onNotice: (message: string) => void;
	storageMode: 'local' | 'cloud';
};
const content = (value: Library) => ({
	papers: value.papers,
	concepts: value.concepts,
	attachments: value.attachments
});

/** Revision-checked server saves with independent, recoverable drafts per tab. */
export class NotebookClient {
	dirty = false;
	saving = false;
	conflict = false;
	private generation = 0;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private cacheTimer: ReturnType<typeof setTimeout> | undefined;
	private db: IDBDatabase | null = null;
	private readonly draftId = crypto.randomUUID();
	private cachedGeneration = -1;
	constructor(private options: Options) {}

	async open(): Promise<BrowserDraft[]> {
		this.db = await new Promise<IDBDatabase | null>((resolve) => {
			try {
				const request = indexedDB.open('labbook-site-drafts-v1', 1);
				request.onupgradeneeded = () =>
					request.result.createObjectStore('drafts', { keyPath: 'id' });
				request.onsuccess = () => resolve(request.result);
				request.onerror = request.onblocked = () => resolve(null);
			} catch {
				resolve(null);
			}
		});
		if (!this.db) {
			this.options.onNotice(
				'Browser recovery storage is unavailable. Server autosave is still active; export a backup before closing if a save fails.'
			);
			return [];
		}
		return new Promise((resolve) => {
			const request = this.db!.transaction('drafts').objectStore('drafts').getAll();
			request.onsuccess = () =>
				resolve(
					(request.result as BrowserDraft[]).filter(
						(draft) => !sameRecord(content(draft.state), content(this.options.getState()))
					)
				);
			request.onerror = () => resolve([]);
		});
	}

	private cache(snapshot: Library): Promise<void> {
		if (!this.db) return Promise.reject(new Error('Browser recovery storage is unavailable.'));
		const generation = this.generation;
		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction('drafts', 'readwrite');
			tx.objectStore('drafts').put({
				id: this.draftId,
				state: snapshot,
				savedAt: Date.now()
			} satisfies BrowserDraft);
			tx.oncomplete = () => {
				this.cachedGeneration = generation;
				resolve();
			};
			tx.onerror = tx.onabort = () =>
				reject(
					new Error(
						'The browser recovery copy could not be saved. Export your notes if server saving fails.'
					)
				);
		});
	}

	async clearDraft(id: string): Promise<void> {
		if (!this.db) return;
		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction('drafts', 'readwrite');
			tx.objectStore('drafts').delete(id);
			tx.oncomplete = () => resolve();
			tx.onerror = tx.onabort = () =>
				reject(new Error('The recovered browser copy is still available.'));
		});
	}

	changed(): void {
		this.dirty = true;
		this.generation++;
		this.options.onStatus(
			this.conflict ? 'conflict' : 'saving',
			this.conflict ? 'Save conflict · export your changes' : 'Saving…'
		);
		clearTimeout(this.cacheTimer);
		this.cacheTimer = setTimeout(
			() =>
				void this.cache(this.options.getState()).catch((error) =>
					this.options.onNotice(error.message)
				),
			150
		);
		clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.flush(), 550);
	}

	async settle(): Promise<boolean> {
		while (this.saving) await new Promise<void>((resolve) => setTimeout(resolve, 30));
		return this.flush();
	}

	async flush(): Promise<boolean> {
		clearTimeout(this.timer);
		clearTimeout(this.cacheTimer);
		if (!this.dirty) return true;
		if (this.saving || this.conflict) {
			// Closing, navigating, or saving again must retain the latest draft even
			// when an earlier request is in flight or revision checks block writes.
			await this.cache(this.options.getState()).catch((error) =>
				this.options.onNotice(error.message)
			);
			return false;
		}
		this.saving = true;
		const generation = this.generation;
		const snapshot = this.options.getState();
		try {
			await this.cache(snapshot).catch(() => {});
			const response = await fetch('/api/library', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(snapshot),
				signal: AbortSignal.timeout(25000)
			});
			const result = (await response.json()) as { revision?: number; message?: string };
			if (response.status === 409) {
				this.conflict = true;
				throw new Error(
					this.cachedGeneration === this.generation
						? 'A newer version was saved elsewhere. Your latest draft is preserved in this browser. Export your current notes, then reload to recover or merge them.'
						: 'A newer version was saved elsewhere. Export your current notes before closing or reloading; the latest browser recovery copy could not be confirmed.'
				);
			}
			if (
				!response.ok ||
				!Number.isSafeInteger(result.revision) ||
				result.revision !== snapshot.revision + 1
			)
				throw new Error(
					result.message || 'Your notes could not be saved. Retry or export a backup.'
				);
			this.options.onRevision(result.revision);
			if (this.generation === generation) {
				this.dirty = false;
				await this.clearDraft(this.draftId).catch(() => {});
				// If another keystroke arrived while clearing, its draft must be preserved.
				if (this.generation !== generation)
					await this.cache(this.options.getState()).catch(() => {});
				else {
					this.options.onStatus(
						'saved',
						this.options.storageMode === 'local' ? 'Saved on this device' : 'Saved to your library'
					);
					this.options.onNotice('');
				}
			}
			return !this.dirty;
		} catch (error) {
			this.options.onStatus(
				this.conflict ? 'conflict' : 'error',
				this.conflict ? 'Save conflict · export your changes' : 'Not saved · retry'
			);
			const message = error instanceof Error ? error.message : 'The save failed.';
			this.options.onNotice(
				this.cachedGeneration === this.generation
					? message
					: `${message} Browser recovery is unavailable for your latest changes. Export a backup before closing or reloading.`
			);
			return false;
		} finally {
			this.saving = false;
			if (this.dirty && this.generation !== generation && !this.conflict)
				this.timer = setTimeout(() => void this.flush(), 100);
		}
	}
}
