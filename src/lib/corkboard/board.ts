import { z } from 'zod';

export const COLORS = ['yellow', 'cream', 'pink', 'blue', 'green'] as const;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2;
export const MAX_CARDS = 500;
export type Point = { x: number; y: number };
export type CardKind = 'note' | 'paper' | 'image';

export function safeUrl(value: string): string | null {
	try {
		const url = new URL(value);
		return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const cardSchema = z.object({
	id: z.string().min(1).max(100),
	kind: z.enum(['note', 'paper', 'image']),
	x: coordinate,
	y: coordinate,
	width: z.number().min(180).max(1000),
	height: z.number().min(160).max(1200),
	color: z.enum(COLORS),
	showPin: z.boolean().optional(),
	showFrame: z.boolean().optional(),
	pin: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
	title: z.string().max(200),
	text: z.string().max(20_000),
	url: z
		.string()
		.max(4000)
		.refine((value) => !value || safeUrl(value) !== null),
	image: z
		.string()
		.max(6_000_000)
		.refine((value) => !value || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value))
});
const boardSchema = z
	.object({
		version: z.literal(1),
		name: z.string().max(100),
		cards: z.array(cardSchema).max(MAX_CARDS),
		threads: z
			.array(z.object({ id: z.string().min(1).max(100), from: z.string(), to: z.string() }))
			.max(2000),
		camera: z.object({ x: coordinate, y: coordinate, zoom: z.number().min(MIN_ZOOM).max(MAX_ZOOM) })
	})
	.superRefine((board, ctx) => {
		const ids = new Set(board.cards.map((card) => card.id));
		const threadIds = new Set<string>();
		const pairs = new Set<string>();
		if (ids.size !== board.cards.length)
			ctx.addIssue({ code: 'custom', message: 'Duplicate card IDs' });
		for (const thread of board.threads) {
			const pair = [thread.from, thread.to].sort().join('\0');
			if (
				!ids.has(thread.from) ||
				!ids.has(thread.to) ||
				thread.from === thread.to ||
				threadIds.has(thread.id) ||
				pairs.has(pair)
			) {
				ctx.addIssue({ code: 'custom', message: 'Invalid thread' });
			}
			threadIds.add(thread.id);
			pairs.add(pair);
		}
	});

export type BoardCard = z.infer<typeof cardSchema>;
export type Board = z.infer<typeof boardSchema>;
export type Camera = Board['camera'];

export function emptyBoard(): Board {
	return {
		version: 1,
		name: 'Reading board',
		cards: [],
		threads: [],
		camera: { x: 0, y: 0, zoom: 1 }
	};
}

export function parseBoard(value: unknown): Board {
	return boardSchema.parse(value);
}

export function serializeBoardBackup(board: Board): string {
	return JSON.stringify(board, null, 2);
}

export async function readBoardBackup(file: Pick<File, 'text'>): Promise<Board> {
	const text = await file.text();
	return parseBoard(JSON.parse(text.replace(/^\uFEFF/, '')));
}

export function makeCard(kind: CardKind, point: Point): BoardCard {
	return {
		id: crypto.randomUUID(),
		kind,
		x: point.x - 120,
		y: point.y - 110,
		width: 240,
		height: 220,
		color: kind === 'note' ? 'yellow' : 'cream',
		title: '',
		text: '',
		url: '',
		image: '',
		...(kind === 'paper' ? { height: 280 } : {})
	};
}

export function pinPoint(card: BoardCard): Point {
	return {
		x: card.x + card.width * (card.pin?.x ?? 0.5),
		y: card.y + (card.pin ? card.height * card.pin.y : 18)
	};
}

export function pinAtPoint(card: BoardCard, point: Point): Point {
	return {
		x: Math.max(0, Math.min(1, (point.x - card.x) / card.width)),
		y: Math.max(0, Math.min(1, (point.y - card.y) / card.height))
	};
}

export function cardBounds(cards: BoardCard[]) {
	if (!cards.length) return null;
	const x = Math.min(...cards.map((card) => card.x));
	const y = Math.min(...cards.map((card) => card.y));
	return {
		x,
		y,
		width: Math.max(...cards.map((card) => card.x + card.width)) - x,
		height: Math.max(...cards.map((card) => card.y + card.height)) - y
	};
}

export function moveCards(cards: BoardCard[], delta: Point): BoardCard[] {
	if (!cards.length) return [];
	const x = Math.max(
		...cards.map((card) => -1_000_000 - card.x),
		Math.min(delta.x, ...cards.map((card) => 1_000_000 - card.x))
	);
	const y = Math.max(
		...cards.map((card) => -1_000_000 - card.y),
		Math.min(delta.y, ...cards.map((card) => 1_000_000 - card.y))
	);
	return cards.map((card) => ({ ...card, x: card.x + x, y: card.y + y }));
}

/** Scale a selection around its top-left corner, keeping every card within the backup limits. */
export function resizeCards(cards: BoardCard[], scale: number): BoardCard[] {
	const bounds = cardBounds(cards);
	if (!bounds) return [];
	const minimum = Math.max(...cards.flatMap((card) => [180 / card.width, 160 / card.height]));
	const maximum = Math.min(
		...cards.flatMap((card) => [
			1000 / card.width,
			1200 / card.height,
			card.x > bounds.x ? (1_000_000 - bounds.x) / (card.x - bounds.x) : Infinity,
			card.y > bounds.y ? (1_000_000 - bounds.y) / (card.y - bounds.y) : Infinity
		])
	);
	scale = Math.max(minimum, Math.min(maximum, scale));
	return cards.map((card) => ({
		...card,
		x: bounds.x + (card.x - bounds.x) * scale,
		y: bounds.y + (card.y - bounds.y) * scale,
		width: Math.max(180, Math.min(1000, card.width * scale)),
		height: Math.max(160, Math.min(1200, card.height * scale)),
		pin: card.pin ?? { x: 0.5, y: 18 / card.height }
	}));
}

export function threadPath(from: Point, to: Point): string {
	const sag = Math.min(110, Math.hypot(to.x - from.x, to.y - from.y) * 0.16);
	return `M ${from.x} ${from.y} C ${from.x + (to.x - from.x) * 0.25} ${from.y + (to.y - from.y) * 0.4 + sag}, ${from.x + (to.x - from.x) * 0.75} ${from.y + (to.y - from.y) * 0.6 + sag}, ${to.x} ${to.y}`;
}

export function zoomAt(camera: Camera, zoom: number, point: Point): Camera {
	zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
	return {
		zoom,
		x: point.x - ((point.x - camera.x) / camera.zoom) * zoom,
		y: point.y - ((point.y - camera.y) / camera.zoom) * zoom
	};
}

export function fitCamera(cards: BoardCard[], width: number, height: number): Camera {
	if (!cards.length) return { x: 0, y: 0, zoom: 1 };
	const left = Math.min(...cards.map((card) => card.x));
	const top = Math.min(...cards.map((card) => card.y)) - 24;
	const right = Math.max(...cards.map((card) => card.x + card.width));
	const bottom = Math.max(...cards.map((card) => card.y + card.height));
	const zoom = Math.max(
		MIN_ZOOM,
		Math.min(1, (width - 96) / (right - left), (height - 170) / (bottom - top))
	);
	return {
		zoom,
		x: (width - (right - left) * zoom) / 2 - left * zoom,
		y: (height - 50 - (bottom - top) * zoom) / 2 - top * zoom
	};
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('daily-quiz-corkboard', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('boards');
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('Close other board tabs and reload.'));
	});
}

export async function loadBoard(): Promise<Board> {
	const db = await openDatabase();
	try {
		const value = await new Promise<unknown>((resolve, reject) => {
			const request = db.transaction('boards', 'readonly').objectStore('boards').get('reading');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return value === undefined ? emptyBoard() : parseBoard(value);
	} finally {
		db.close();
	}
}

export async function saveBoard(board: Board): Promise<void> {
	const db = await openDatabase();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction('boards', 'readwrite');
			transaction.objectStore('boards').put(board, 'reading');
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
	} finally {
		db.close();
	}
}
