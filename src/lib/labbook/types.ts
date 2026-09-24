export type PaperNoteKey =
	| 'input-output'
	| 'what-it-does'
	| 'how-it-does'
	| 'pseudocode'
	| 'results';
export type ConceptNoteKey = 'what-it-does' | 'how-it-does' | 'results';
export type NoteKey = PaperNoteKey;
export type PaperNotes = Record<PaperNoteKey, string>;
export type ConceptNotes = Record<ConceptNoteKey, string>;
export type EntryKind = 'paper' | 'concept';
export type Collection = 'papers' | 'concepts';

export interface Attachment {
	name: string;
	mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf';
	data: string;
}

interface EntryBase {
	id: string;
	title: string;
	tags: string[];
	url: string;
	addedAt: string;
	updatedAt: string;
	pdfId?: string | null;
}

export interface Paper extends EntryBase {
	authors: string;
	year: string | number;
	notes: PaperNotes;
	/** Retained for compatibility; existing text migrates into a concept topic. */
	scratchpad: string;
}

export interface Concept extends EntryBase {
	/** The freeform editor uses what-it-does; migration preserves the other sections there. */
	notes: ConceptNotes;
}

export type LibraryEntry = Paper | Concept;

export interface Library {
	version: 2;
	revision: number;
	papers: Paper[];
	concepts: Concept[];
	attachments: Record<string, Attachment>;
}

export interface LibraryBackup extends Library {
	format: 'labbook-library';
	exportedAt: string;
}
