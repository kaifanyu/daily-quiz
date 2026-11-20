import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
	emptyBoard,
	fitCamera,
	makeCard,
	parseBoard,
	pinPoint,
	readBoardBackup,
	safeUrl,
	serializeBoardBackup,
	threadPath,
	zoomAt
} from './board.ts';

function connectedBoard() {
	const board = emptyBoard();
	board.cards = [makeCard('note', { x: -200, y: 100 }), makeCard('paper', { x: 600, y: 400 })];
	board.cards[1].url = 'https://arxiv.org/abs/1706.03762';
	board.threads = [{ id: 'thread-1', from: board.cards[0].id, to: board.cards[1].id }];
	return board;
}

test('an exported board file round-trips with all content and its viewport intact', async () => {
	const board = connectedBoard();
	board.name = 'Reading: café / 研究';
	board.cards[0].title = 'A quoted "idea" — ✓';
	board.cards[0].text = 'First line\nSecond line: <paper> & connections';
	board.cards[0].color = 'blue';
	board.cards[0].width = 360;
	board.cards[0].height = 310;
	const image = makeCard('image', { x: 300, y: 300 });
	image.showPin = false;
	image.image = `data:image/png;base64,${readFileSync(new URL('../../../static/corkboard/pin.png', import.meta.url)).toString('base64')}`;
	board.cards.push(image);
	board.threads.push({ id: 'thread-2', from: image.id, to: board.cards[1].id });
	board.camera = { x: -500, y: 280, zoom: 0.4 };
	const file = new File([serializeBoardBackup(board)], 'board.json', { type: 'application/json' });
	assert.deepEqual(await readBoardBackup(file), board);
});

test('image-heavy exports above 30 MB can be imported without losing images', async () => {
	const board = connectedBoard();
	const image = `data:image/png;base64,${readFileSync(new URL('../../../static/corkboard/cork.png', import.meta.url)).toString('base64')}`;
	for (let i = 0; i < 11; i++) {
		board.cards.push({ ...makeCard('image', { x: i * 300, y: 700 }), image });
	}
	const file = new File([serializeBoardBackup(board)], 'large-board.json');
	assert.ok(file.size > 30 * 1024 * 1024);
	assert.deepEqual(await readBoardBackup(file), board);
});

test('backup files accept a UTF-8 BOM and reject malformed or incompatible data', async () => {
	const board = connectedBoard();
	assert.deepEqual(
		await readBoardBackup(new File(['\uFEFF', serializeBoardBackup(board)], 'board.json')),
		board
	);
	for (const text of ['{', 'null', '[]', JSON.stringify({ ...board, version: 99 })]) {
		await assert.rejects(readBoardBackup(new File([text], 'invalid.json')));
	}
});

test('imports reject script URLs, SVG payloads, unsupported versions and invalid geometry', () => {
	for (const corrupt of [
		(board) => {
			board.cards[0].url = 'javascript:alert(1)';
		},
		(board) => {
			board.cards[0].image = 'data:image/svg+xml;base64,PHN2Zz4=';
		},
		(board) => {
			board.cards[0].x = Infinity;
		},
		(board) => {
			board.cards[0].width = -1;
		},
		(board) => {
			board.camera.zoom = 0;
		},
		(board) => {
			board.version = 2;
		}
	]) {
		const board = connectedBoard();
		corrupt(board);
		assert.throws(() => parseBoard(board));
	}
});

test('imports reject orphan threads, self loops and duplicate IDs or connections', () => {
	for (const corrupt of [
		(board) => {
			board.threads[0].to = 'missing';
		},
		(board) => {
			board.threads[0].to = board.threads[0].from;
		},
		(board) => {
			board.cards[1].id = board.cards[0].id;
		},
		(board) => {
			const t = board.threads[0];
			board.threads.push({ id: 'thread-2', from: t.to, to: t.from });
		},
		(board) => {
			board.threads.push({ ...board.threads[0] });
		}
	]) {
		const board = connectedBoard();
		corrupt(board);
		assert.throws(() => parseBoard(board));
	}
});

test('zoom keeps the world point under the cursor stationary, including at zoom limits', () => {
	const camera = { x: -320, y: 95, zoom: 0.7 };
	const cursor = { x: 530, y: 310 };
	const world = { x: (cursor.x - camera.x) / camera.zoom, y: (cursor.y - camera.y) / camera.zoom };
	for (const target of [0.01, 0.4, 1, 100]) {
		const next = zoomAt(camera, target, cursor);
		assert.ok(next.zoom >= 0.2 && next.zoom <= 2);
		assert.ok(Math.abs(world.x * next.zoom + next.x - cursor.x) < 0.00001);
		assert.ok(Math.abs(world.y * next.zoom + next.y - cursor.y) < 0.00001);
	}
});

test('fit contains scattered cards at desktop and phone widths', () => {
	const cards = connectedBoard().cards;
	for (const width of [390, 1440]) {
		const camera = fitCamera(cards, width, 700);
		for (const card of cards) {
			assert.ok(card.x * camera.zoom + camera.x >= 0);
			assert.ok((card.x + card.width) * camera.zoom + camera.x <= width);
			assert.ok(card.y * camera.zoom + camera.y >= 0);
			assert.ok((card.y + card.height) * camera.zoom + camera.y <= 700);
		}
	}
});

test('thread endpoints stay on both pins when a card moves or resizes', () => {
	const [a, b] = connectedBoard().cards;
	const before = threadPath(pinPoint(a), pinPoint(b));
	a.x += 250;
	b.width += 100;
	const start = pinPoint(a),
		end = pinPoint(b);
	const after = threadPath(start, end);
	assert.notEqual(before, after);
	assert.ok(after.startsWith(`M ${start.x} ${start.y} C `));
	assert.ok(after.endsWith(`${end.x} ${end.y}`));
});

test('only complete HTTP(S) source links are accepted', () => {
	for (const value of [
		'javascript:alert(1)',
		'data:text/html,hello',
		'file:///secret',
		'/notes',
		'arxiv.org'
	])
		assert.equal(safeUrl(value), null);
	assert.equal(safeUrl('https://arxiv.org/abs/1706.03762'), 'https://arxiv.org/abs/1706.03762');
});
