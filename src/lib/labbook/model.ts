import type {
	Attachment,
	Concept,
	ConceptNotes,
	EntryKind,
	Library,
	LibraryEntry,
	Paper,
	PaperNotes
} from './types.ts';

export const PAPER_NOTE_KEYS = [
	'input-output',
	'what-it-does',
	'how-it-does',
	'pseudocode',
	'results'
] as const;
export const CONCEPT_NOTE_KEYS = ['what-it-does', 'how-it-does', 'results'] as const;
export const MAX_LIBRARY_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_REVISION = Number.MAX_SAFE_INTEGER - 1;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const MIME_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'application/pdf'
]);
const own = (object: object, key: PropertyKey): boolean =>
	Object.prototype.hasOwnProperty.call(object, key);
const record = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

export function emptyLibrary(): Library {
	return { version: 2, revision: 0, papers: [], concepts: [], attachments: {} };
}

export function emptyNotes(kind?: 'paper'): PaperNotes;
export function emptyNotes(kind: 'concept'): ConceptNotes;
export function emptyNotes(kind: EntryKind): PaperNotes | ConceptNotes;
export function emptyNotes(kind: EntryKind = 'paper'): PaperNotes | ConceptNotes {
	return Object.fromEntries(
		(kind === 'concept' ? CONCEPT_NOTE_KEYS : PAPER_NOTE_KEYS).map((key) => [key, ''])
	) as PaperNotes | ConceptNotes;
}

export function allEntries(state: Library): LibraryEntry[] {
	return [...state.papers, ...state.concepts];
}

function text(value: unknown, label: string, limit: number): string {
	if (typeof value !== 'string') throw new Error(`${label} must be text.`);
	let count = 0;
	for (const character of value) {
		const point = character.codePointAt(0)!;
		if (point >= 0xd800 && point <= 0xdfff) throw new Error(`${label} contains invalid Unicode.`);
		if (++count > limit) {
			throw new Error(`${label} exceeds the ${limit.toLocaleString('en-US')}-character limit.`);
		}
	}
	return value;
}

function identifier(value: unknown, label: string): string {
	if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
		throw new Error(`${label} must use 1–120 letters, numbers, underscores, or hyphens.`);
	}
	return value;
}

function fields(
	value: unknown,
	required: readonly string[],
	optional: readonly string[],
	label: string
): asserts value is Record<string, unknown> {
	if (
		!record(value) ||
		required.some((key) => !own(value, key)) ||
		Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
	) {
		throw new Error(`${label} has missing or unsupported fields.`);
	}
}

function link(value: unknown, label: string): string {
	const url = text(value, label, 8192);
	if (url) {
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			throw new Error(`${label} must start with http:// or https://.`);
		}
		if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
			throw new Error(`${label} must start with http:// or https://.`);
		}
	}
	return url;
}

function attachment(value: unknown, id: string, legacy: boolean): Attachment {
	identifier(id, 'Attachment ID');
	if (legacy && typeof value === 'string') {
		value = { name: 'Imported image', mime: value.match(/^data:([^;]+);/)?.[1], data: value };
	}
	fields(value, ['name', 'mime', 'data'], [], 'An attachment');
	const name = text(value.name, 'Attachment name', 500);
	if (typeof value.mime !== 'string' || !MIME_TYPES.has(value.mime)) {
		throw new Error('Attachments must be PNG, JPEG, WebP, GIF, or PDF files.');
	}
	const prefix = `data:${value.mime};base64,`;
	if (typeof value.data !== 'string' || !value.data.startsWith(prefix)) {
		throw new Error('An attachment must use a matching base64 data URL.');
	}
	if (value.data.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 + prefix.length) {
		throw new Error('Attachments must be at most 20 MB.');
	}
	const payload = value.data.slice(prefix.length);
	if (!payload || payload.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
		throw new Error('An attachment contains invalid base64 data.');
	}
	const byteLength =
		(payload.length / 4) * 3 - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
	if (byteLength > MAX_ATTACHMENT_BYTES) throw new Error('Attachments must be at most 20 MB.');
	return { name, mime: value.mime as Attachment['mime'], data: value.data };
}

function entry(
	raw: unknown,
	kind: EntryKind,
	attachments: Library['attachments'],
	seen: Set<string>,
	legacy: boolean,
	fallbackDate: string
): LibraryEntry {
	const isPaper = kind === 'paper';
	const label = isPaper ? 'Paper' : 'Concept';
	const required = [
		'id',
		'title',
		'tags',
		'url',
		'addedAt',
		'updatedAt',
		'notes',
		...(isPaper ? ['authors', 'year', 'scratchpad'] : [])
	];
	let value: Record<string, unknown>;
	if (legacy && isPaper) {
		fields(
			raw,
			['id', 'title'],
			[...required.filter((key) => key !== 'id' && key !== 'title'), 'pdfId', 'meta'],
			label
		);
		if (own(raw, 'meta')) {
			text(raw.meta, 'Legacy paper metadata', 4000);
			if (own(raw, 'authors') && raw.authors !== raw.meta) {
				throw new Error('A legacy paper contains conflicting author metadata.');
			}
		}
		value = {
			authors: own(raw, 'meta') ? raw.meta : '',
			year: '',
			tags: [],
			url: '',
			addedAt: fallbackDate,
			updatedAt: fallbackDate,
			notes: {},
			scratchpad: '',
			...raw
		};
	} else {
		fields(raw, required, ['pdfId'], label);
		value = raw;
	}
	const id = identifier(value.id, `${label} ID`);
	if (seen.has(id)) throw new Error('Each paper and concept must have a unique ID.');
	seen.add(id);
	const title = text(value.title, `${label} title`, 1000);
	if (!title.trim()) throw new Error(`Each ${kind} needs a title.`);
	const url = link(value.url, `${label} link`);
	const addedAt = text(value.addedAt, `${label} creation date`, 64);
	const updatedAt = text(value.updatedAt, `${label} update date`, 64);
	if (!Array.isArray(value.tags) || value.tags.length > 100) {
		throw new Error(`${label} tags must be a list of at most 100 tags.`);
	}
	const tags = value.tags.map((tag) => text(tag, 'Tag', 100));
	const keys = isPaper ? PAPER_NOTE_KEYS : CONCEPT_NOTE_KEYS;
	const rawNotes = value.notes;
	fields(rawNotes, legacy && isPaper ? [] : keys, legacy && isPaper ? keys : [], `${label} notes`);
	const notes = Object.fromEntries(
		keys.map((key) => [
			key,
			text(own(rawNotes, key) ? rawNotes[key] : '', `${label} note`, 2000000)
		])
	);
	const common = { id, title, tags, url, addedAt, updatedAt };
	let result: LibraryEntry;
	if (isPaper) {
		const authors = text(value.authors, 'Paper authors', 4000);
		const year = value.year;
		if (typeof year === 'string') text(year, 'Paper year', 20);
		else if (typeof year !== 'number' || !Number.isInteger(year) || year < 0 || year > 9999) {
			throw new Error('Paper year must be text or an integer from 0 to 9999.');
		}
		const scratchpad = text(value.scratchpad, 'Paper scratchpad', 1000000);
		result = { ...common, authors, year, scratchpad, notes: notes as PaperNotes };
	} else result = { ...common, notes: notes as ConceptNotes };
	if (own(value, 'pdfId')) {
		const pdfId = value.pdfId;
		if (pdfId !== null && pdfId !== '') {
			identifier(pdfId, `${label} PDF ID`);
			if (
				typeof pdfId !== 'string' ||
				!own(attachments, pdfId) ||
				attachments[pdfId].mime !== 'application/pdf'
			) {
				throw new Error(`A ${kind} references a missing PDF attachment.`);
			}
		}
		result.pdfId = pdfId as string | null;
	}
	return result;
}

function readLibrary(raw: unknown, backup: boolean): Library {
	if (!record(raw)) throw new Error('This file is not a Labbook library.');
	const version = !own(raw, 'version') && backup ? 1 : raw.version;
	if (version !== 1 && version !== 2) throw new Error('This library uses an unsupported version.');
	const legacy = backup && version === 1;
	const required = legacy
		? ['papers']
		: ['version', 'revision', 'papers', 'attachments', ...(version === 2 ? ['concepts'] : [])];
	const optional = backup
		? ['format', 'exportedAt', ...(legacy ? ['version', 'revision', 'attachments'] : [])]
		: [];
	fields(raw, required, optional, 'The library');
	if (own(raw, 'format') && raw.format !== 'labbook-library')
		throw new Error('This file is not a Labbook backup.');
	if (own(raw, 'exportedAt')) text(raw.exportedAt, 'Backup date', 64);
	const revision = legacy && !own(raw, 'revision') ? 0 : raw.revision;
	if (
		typeof revision !== 'number' ||
		!Number.isSafeInteger(revision) ||
		revision < 0 ||
		revision > MAX_REVISION
	) {
		throw new Error('The library revision must be a nonnegative integer.');
	}
	if (!Array.isArray(raw.papers) || raw.papers.length > 10000)
		throw new Error('The library must contain at most 10,000 papers.');
	const concepts = version === 2 ? raw.concepts : [];
	if (!Array.isArray(concepts) || concepts.length > 10000)
		throw new Error('The library must contain at most 10,000 concepts.');
	const rawAttachments = legacy && !own(raw, 'attachments') ? {} : raw.attachments;
	if (!record(rawAttachments) || Object.keys(rawAttachments).length > 10000)
		throw new Error('The library must contain at most 10,000 attachments.');
	// fromEntries safely retains arbitrary valid IDs such as __proto__.
	const attachments = Object.fromEntries(
		Object.entries(rawAttachments).map(([id, value]) => [id, attachment(value, id, legacy)])
	);
	const seen = new Set<string>();
	const fallbackDate =
		typeof raw.exportedAt === 'string' && raw.exportedAt
			? raw.exportedAt
			: '1970-01-01T00:00:00.000Z';
	return {
		version: 2,
		revision,
		papers: raw.papers.map(
			(value) => entry(value, 'paper', attachments, seen, legacy, fallbackDate) as Paper
		),
		concepts: concepts.map(
			(value) => entry(value, 'concept', attachments, seen, false, fallbackDate) as Concept
		),
		attachments
	};
}

function hash(value: string): string {
	let result = 2166136261;
	for (let index = 0; index < value.length; index++)
		result = Math.imul(result ^ value.charCodeAt(index), 16777619);
	return (result >>> 0).toString(16).padStart(8, '0');
}

function scratchpadId(paper: Paper): string {
	const base = `ideas-${paper.id}`;
	return base.length <= 120 ? base : `${base.slice(0, 111)}-${hash(paper.id)}`;
}

export function sameRecord(left: unknown, right: unknown): boolean {
	if (left === right) return true;
	if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
		return false;
	if (Array.isArray(left) !== Array.isArray(right)) return false;
	const first = left as Record<string, unknown>;
	const second = right as Record<string, unknown>;
	const keys = Object.keys(first);
	return (
		keys.length === Object.keys(second).length &&
		keys.every((key) => own(second, key) && sameRecord(first[key], second[key]))
	);
}

function migrate(state: Library, migrateScratchpads: boolean): boolean {
	let changed = false;
	// Migration operates on a validated clone, so failures leave the source untouched.
	for (const concept of state.concepts) {
		if (!concept.notes['how-it-does'] && !concept.notes.results) continue;
		const combined = CONCEPT_NOTE_KEYS.map((key) => concept.notes[key])
			.filter((value) => value !== '')
			.join('\n\n');
		text(combined, 'Combined concept note', 2000000);
		concept.notes['what-it-does'] = combined;
		concept.notes['how-it-does'] = '';
		concept.notes.results = '';
		changed = true;
	}
	for (const paper of state.papers) {
		const source = paper.notes['input-output'];
		if (!source) continue;
		const destination = paper.notes['what-it-does'];
		const combined = destination ? `${destination}\n\n${source}` : source;
		text(combined, 'Combined What it does note', 2000000);
		paper.notes['what-it-does'] = combined;
		paper.notes['input-output'] = '';
		changed = true;
	}
	if (!migrateScratchpads) return changed;
	const used = new Map(allEntries(state).map((value) => [value.id, value]));
	const conceptIds = new Set(state.concepts.map((value) => value.id));
	for (const paper of state.papers) {
		if (!paper.scratchpad) continue;
		const concept: Concept = {
			id: scratchpadId(paper),
			title: Array.from(`Ideas — ${paper.title}`).slice(0, 1000).join(''),
			tags: [...paper.tags],
			url: paper.url,
			addedAt: paper.addedAt,
			updatedAt: paper.updatedAt,
			notes: { ...emptyNotes('concept'), 'what-it-does': paper.scratchpad }
		};
		const baseId = concept.id;
		let suffix = 0;
		while (used.has(concept.id)) {
			const existing = used.get(concept.id)!;
			if (
				conceptIds.has(concept.id) &&
				existing.title === concept.title &&
				sameRecord(existing.notes, concept.notes)
			)
				break;
			const ending = `-${++suffix}`;
			concept.id = `${baseId.slice(0, 120 - ending.length)}${ending}`;
		}
		if (!used.has(concept.id)) {
			if (state.concepts.length >= 10000)
				throw new Error(
					'Moving scratchpad notes would exceed the 10,000-concept limit. The original library has been preserved.'
				);
			state.concepts.push(concept);
			used.set(concept.id, concept);
			conceptIds.add(concept.id);
		}
		paper.scratchpad = '';
		changed = true;
	}
	return changed;
}

export function normalizeLibrary(
	raw: unknown,
	{ migrateScratchpads = true }: { migrateScratchpads?: boolean } = {}
): { state: Library; changed: boolean } {
	const state = readLibrary(raw, false);
	const changed = migrate(state, migrateScratchpads);
	return { state, changed: (raw as Record<string, unknown>).version !== 2 || changed };
}

export function parseBackup(raw: unknown): Library {
	const state = readLibrary(raw, true);
	migrate(state, true);
	return state;
}

export function attachmentIds(entries: readonly LibraryEntry[]): Set<string> {
	const ids = new Set<string>();
	for (const value of entries) {
		if (value.pdfId) ids.add(value.pdfId);
		for (const note of [
			...Object.values(value.notes),
			'scratchpad' in value ? value.scratchpad : ''
		]) {
			for (const match of note.matchAll(/\(attachment:([A-Za-z0-9_-]+)\)/g)) ids.add(match[1]);
		}
	}
	return ids;
}
