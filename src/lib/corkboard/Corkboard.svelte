<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import Icon from './Icon.svelte';
	import {
		COLORS,
		MAX_CARDS,
		MAX_ZOOM,
		MIN_ZOOM,
		emptyBoard,
		fitCamera,
		loadBoard,
		makeCard,
		pinPoint,
		readBoardBackup,
		safeUrl,
		saveBoard,
		serializeBoardBackup,
		threadPath,
		zoomAt,
		type Board,
		type BoardCard,
		type CardKind,
		type Point
	} from './board';
	import './corkboard.css';

	type Tool = 'select' | 'hand' | 'note' | 'thread';
	type Gesture = {
		kind: 'pan' | 'move' | 'resize' | 'thread';
		pointer: number;
		start: Point;
		origin: Point;
		before: Board;
		cardId?: string;
		moved: boolean;
	};
	let board = $state<Board>(emptyBoard());
	let loaded = $state(false);
	let status = $state('Loading board…');
	let error = $state('');
	let tool = $state<Tool>('select');
	let selected = $state<string | null>(null);
	let selectedThread = $state<string | null>(null);
	let connectFrom = $state<string | null>(null);
	let pointer = $state<Point>({ x: 0, y: 0 });
	let gesture = $state<Gesture | null>(null);
	let spaceHeld = $state(false);
	let past = $state.raw<Board[]>([]);
	let future = $state.raw<Board[]>([]);
	let editorId = $state<string | null>(null);
	let draft = $state({ title: '', text: '', url: '', color: 'yellow' as BoardCard['color'] });
	let helpOpen = $state(false);
	let importing = $state(false);
	let viewport: HTMLDivElement;
	let imageInput: HTMLInputElement;
	let importInput: HTMLInputElement;
	let saveQueue = Promise.resolve();
	let saveVersion = 0;
	let wheelTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	const touches = new SvelteMap<number, Point>();
	let pinch: { distance: number; center: Point; camera: Board['camera'] } | null = null;
	let dragCompleted = false;

	const selectedCard = $derived(board.cards.find((card) => card.id === selected));
	const editingCard = $derived(board.cards.find((card) => card.id === editorId));
	const sourceCard = $derived(board.cards.find((card) => card.id === connectFrom));
	const cardMap = $derived(new Map(board.cards.map((card) => [card.id, card])));
	const hint = $derived(
		connectFrom
			? 'Choose another pin to connect. Esc to cancel.'
			: tool === 'thread'
				? 'Click two pins to connect them with red thread.'
				: tool === 'note'
					? 'Click the cork or press Enter to place a note.'
					: tool === 'hand'
						? 'Drag or use the arrow keys to move around the board.'
						: 'Drag to arrange · Double-click to edit · Scroll to zoom'
	);

	function snapshot(): Board {
		return $state.snapshot(board);
	}
	function persist() {
		if (!loaded) return;
		const value = snapshot();
		const version = ++saveVersion;
		status = 'Saving…';
		saveQueue = saveQueue
			.catch(() => {})
			.then(() => saveBoard(value))
			.then(() => {
				if (!disposed && version === saveVersion) status = 'Saved in this browser';
			})
			.catch(() => {
				if (!disposed) {
					status = 'Not saved';
					error = 'Your browser could not save this board. Export a backup to keep your changes.';
				}
			});
	}
	function remember(before: Board) {
		past = [...past.slice(-29), before];
		future = [];
		persist();
	}
	function commit(change: () => void) {
		if (!loaded) return;
		const before = snapshot();
		change();
		remember(before);
	}
	function undo() {
		if (!past.length || editorId) return;
		future = [...future, snapshot()];
		board = past[past.length - 1];
		past = past.slice(0, -1);
		clearSelection();
		persist();
	}
	function redo() {
		if (!future.length || editorId) return;
		past = [...past, snapshot()];
		board = future[future.length - 1];
		future = future.slice(0, -1);
		clearSelection();
		persist();
	}
	function clearSelection() {
		selected = null;
		selectedThread = null;
		connectFrom = null;
	}
	function chooseTool(value: Tool) {
		tool = value;
		connectFrom = null;
		editorId = null;
		helpOpen = false;
		viewport?.focus();
	}
	function localPoint(event: { clientX: number; clientY: number }): Point {
		const rect = viewport.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}
	function worldPoint(point: Point): Point {
		return {
			x: (point.x - board.camera.x) / board.camera.zoom,
			y: (point.y - board.camera.y) / board.camera.zoom
		};
	}
	function centerPoint(): Point {
		return worldPoint({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 - 24 });
	}
	function cardName(card: BoardCard): string {
		return (
			card.title ||
			(card.kind === 'paper' ? 'Untitled paper' : card.kind === 'image' ? 'Image' : 'Untitled note')
		);
	}

	function editCard(card: BoardCard) {
		selected = card.id;
		selectedThread = null;
		connectFrom = null;
		tool = 'select';
		helpOpen = false;
		draft = { title: card.title, text: card.text, url: card.url, color: card.color };
		editorId = card.id;
	}
	function closeEditor() {
		editorId = null;
		viewport?.focus();
	}
	function saveEdit(event: SubmitEvent) {
		event.preventDefault();
		const card = board.cards.find((item) => item.id === editorId);
		if (!card) return;
		if (draft.url.trim() && !safeUrl(draft.url.trim())) {
			error = 'Use a complete paper link beginning with https:// or http://.';
			return;
		}
		commit(() => Object.assign(card, draft, { url: draft.url.trim() }));
		closeEditor();
	}
	function addCard(kind: CardKind, point = centerPoint()) {
		if (!loaded) return;
		if (board.cards.length >= MAX_CARDS) {
			error =
				'This board is full (500 cards). Export a backup and remove a few cards to make room.';
			return;
		}
		const card = makeCard(kind, point);
		commit(() => {
			board.cards.push(card);
		});
		void editCard(card);
	}
	function connect(to: string) {
		if (!loaded) return;
		if (!connectFrom) {
			connectFrom = to;
			selected = null;
			selectedThread = null;
			return;
		}
		if (connectFrom === to) {
			connectFrom = null;
			return;
		}
		const from = connectFrom;
		if (
			!board.threads.some(
				(thread) =>
					(thread.from === from && thread.to === to) || (thread.from === to && thread.to === from)
			)
		) {
			if (board.threads.length >= 2000) {
				error = 'This board has reached its 2,000-thread limit.';
				connectFrom = null;
				return;
			}
			commit(() => {
				board.threads.push({ id: crypto.randomUUID(), from, to });
			});
		}
		connectFrom = null;
	}
	function removeSelected() {
		if (!selected && !selectedThread) return;
		commit(() => {
			if (selected) {
				board.cards = board.cards.filter((card) => card.id !== selected);
				board.threads = board.threads.filter(
					(thread) => thread.from !== selected && thread.to !== selected
				);
			} else board.threads = board.threads.filter((thread) => thread.id !== selectedThread);
		});
		clearSelection();
		editorId = null;
	}
	function duplicate() {
		if (!selectedCard || board.cards.length >= MAX_CARDS) return;
		const card = {
			...$state.snapshot(selectedCard),
			id: crypto.randomUUID(),
			x: selectedCard.x + 32,
			y: selectedCard.y + 32
		};
		commit(() => {
			board.cards.push(card);
		});
		selected = card.id;
	}
	function zoom(
		factor: number,
		point = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
	) {
		board.camera = zoomAt(board.camera, board.camera.zoom * factor, point);
	}
	function zoomButton(factor: number) {
		zoom(factor);
		persist();
	}
	function fit() {
		board.camera = fitCamera(board.cards, viewport.clientWidth, viewport.clientHeight);
		persist();
	}
	function onWheel(event: WheelEvent) {
		if (!loaded || (event.target as Element).closest('[data-chrome]')) return;
		event.preventDefault();
		if (event.shiftKey) {
			board.camera.x -= event.deltaX || event.deltaY;
			board.camera.y -= event.deltaX ? event.deltaY : 0;
		} else zoom(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002)), localPoint(event));
		clearTimeout(wheelTimer);
		wheelTimer = setTimeout(persist, 180);
	}
	function startGesture(event: PointerEvent, kind: Gesture['kind'], card?: BoardCard) {
		if (!loaded || (event.button !== 0 && event.button !== 1)) return;
		if (kind !== 'move') event.preventDefault();
		event.stopPropagation();
		dragCompleted = false;
		if (event.pointerType === 'touch') {
			touches.set(event.pointerId, localPoint(event));
			if (touches.size === 2) {
				startPinch(event);
				return;
			}
		}
		const before = snapshot();
		if (kind === 'move' && card) {
			selected = card.id;
			selectedThread = null;
			// Move the active card to the front without changing its coordinates.
			board.cards = [...board.cards.filter((item) => item.id !== card.id), card];
		}
		gesture = {
			kind,
			pointer: event.pointerId,
			start: localPoint(event),
			origin:
				kind === 'pan'
					? { x: board.camera.x, y: board.camera.y }
					: kind === 'resize' && card
						? { x: card.width, y: card.height }
						: card
							? { x: card.x, y: card.y }
							: { x: 0, y: 0 },
			before,
			cardId: card?.id,
			moved: false
		};
		// Preserve native clicks and double-clicks until the card actually moves.
		if (kind !== 'move') viewport.setPointerCapture(event.pointerId);
	}
	function startPinch(event: PointerEvent) {
		const [a, b] = [...touches.values()];
		pinch = {
			distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
			center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
			camera: { ...board.camera }
		};
		if (gesture?.moved && (gesture.kind === 'move' || gesture.kind === 'resize'))
			remember(gesture.before);
		gesture = null;
		connectFrom = null;
		viewport.setPointerCapture(event.pointerId);
	}
	function canvasDown(event: PointerEvent) {
		if (
			!loaded ||
			(event.target as Element).closest('[data-chrome], [data-card], [data-pin], [data-thread]')
		)
			return;
		if (event.pointerType === 'touch') {
			touches.set(event.pointerId, localPoint(event));
			if (touches.size === 2) {
				startPinch(event);
				return;
			}
		}
		if (tool === 'note' && !spaceHeld && event.button === 0) {
			addCard('note', worldPoint(localPoint(event)));
			return;
		}
		clearSelection();
		startGesture(event, 'pan');
	}
	function cardDown(event: PointerEvent, card: BoardCard) {
		if (tool === 'hand' || spaceHeld || event.button === 1) {
			startGesture(event, 'pan');
			return;
		}
		if (tool === 'thread') {
			event.stopPropagation();
			return;
		}
		startGesture(event, 'move', card);
	}
	function cardClick(card: BoardCard) {
		if (dragCompleted) {
			dragCompleted = false;
			return;
		}
		if (tool === 'thread') {
			connect(card.id);
			pointer = pinPoint(card);
			return;
		}
		selected = card.id;
		selectedThread = null;
	}
	function pinDown(event: PointerEvent, card: BoardCard) {
		if (spaceHeld || tool === 'hand') {
			startGesture(event, 'pan');
			return;
		}
		startGesture(event, 'thread', card);
		pointer = pinPoint(card);
	}
	function pointerMove(event: PointerEvent) {
		const point = localPoint(event);
		pointer = worldPoint(point);
		if (touches.has(event.pointerId)) touches.set(event.pointerId, point);
		if (pinch && touches.size === 2) {
			const [a, b] = [...touches.values()];
			const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const camera = zoomAt(
				pinch.camera,
				(pinch.camera.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance,
				pinch.center
			);
			board.camera = {
				...camera,
				x: camera.x + center.x - pinch.center.x,
				y: camera.y + center.y - pinch.center.y
			};
			return;
		}
		if (!gesture || gesture.pointer !== event.pointerId) return;
		const dx = point.x - gesture.start.x,
			dy = point.y - gesture.start.y;
		if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
		if (!gesture.moved && gesture.kind === 'move') viewport.setPointerCapture(event.pointerId);
		gesture.moved = true;
		if (gesture.kind === 'pan') {
			board.camera.x = gesture.origin.x + dx;
			board.camera.y = gesture.origin.y + dy;
		}
		if (gesture.kind === 'thread') connectFrom = gesture.cardId ?? null;
		const card = board.cards.find((item) => item.id === gesture?.cardId);
		if (card && gesture.kind === 'move') {
			card.x = Math.max(-1_000_000, Math.min(1_000_000, gesture.origin.x + dx / board.camera.zoom));
			card.y = Math.max(-1_000_000, Math.min(1_000_000, gesture.origin.y + dy / board.camera.zoom));
		}
		if (card && gesture.kind === 'resize') {
			card.width = Math.min(1000, Math.max(180, gesture.origin.x + dx / board.camera.zoom));
			card.height = Math.min(1200, Math.max(160, gesture.origin.y + dy / board.camera.zoom));
		}
	}
	function pointerUp(event: PointerEvent) {
		touches.delete(event.pointerId);
		if (viewport.hasPointerCapture(event.pointerId))
			viewport.releasePointerCapture(event.pointerId);
		if (pinch) {
			if (touches.size < 2) {
				pinch = null;
				persist();
			}
			return;
		}
		if (!gesture || gesture.pointer !== event.pointerId) return;
		const current = gesture;
		gesture = null;
		if (current.kind === 'thread') {
			if (current.moved) {
				const target = document
					.elementFromPoint(event.clientX, event.clientY)
					?.closest<HTMLElement>('[data-pin], [data-card]');
				const targetId = target?.dataset.pin || target?.dataset.card;
				if (targetId && targetId !== current.cardId) connect(targetId);
				else connectFrom = null;
			} else if (current.cardId) connect(current.cardId);
		} else if (current.moved) {
			dragCompleted = current.kind !== 'pan';
			if (current.kind === 'pan') persist();
			else remember(current.before);
		}
	}
	function cancelGesture(event?: PointerEvent) {
		if (gesture) {
			board = gesture.before;
			gesture = null;
		}
		connectFrom = null;
		pinch = null;
		touches.clear();
		if (event && viewport?.hasPointerCapture(event.pointerId))
			viewport.releasePointerCapture(event.pointerId);
	}
	function cardKey(event: KeyboardEvent, card: BoardCard) {
		if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
			event.preventDefault();
			event.stopPropagation();
			const amount = event.shiftKey ? 20 : 5;
			commit(() => {
				card.x = Math.max(
					-1_000_000,
					Math.min(
						1_000_000,
						card.x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0)
					)
				);
				card.y = Math.max(
					-1_000_000,
					Math.min(
						1_000_000,
						card.y + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0)
					)
				);
			});
		} else if (event.key === 'Enter' && tool !== 'thread') {
			event.preventDefault();
			void editCard(card);
		}
	}
	function keyDown(event: KeyboardEvent) {
		if (!loaded) return;
		const target = event.target as HTMLElement;
		if (event.key === 'Escape') {
			cancelGesture();
			closeEditor();
			helpOpen = false;
			tool = 'select';
			return;
		}
		if (target.closest('input, textarea, select, [contenteditable="true"]') || editorId) return;
		const modifier = event.ctrlKey || event.metaKey;
		if (modifier && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			event.shiftKey ? redo() : undo();
			return;
		}
		if (modifier && event.key.toLowerCase() === 'y') {
			event.preventDefault();
			redo();
			return;
		}
		if (modifier && event.key.toLowerCase() === 'd') {
			event.preventDefault();
			duplicate();
			return;
		}
		if (modifier) return;
		if (target === viewport && event.key === 'Enter' && tool === 'note') {
			event.preventDefault();
			addCard('note');
			return;
		}
		if (
			target === viewport &&
			['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
		) {
			event.preventDefault();
			const step = event.shiftKey ? 150 : 50;
			board.camera.x += event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
			board.camera.y += event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
			persist();
			return;
		}
		if (
			event.code === 'Space' &&
			(target === viewport || target.closest('[data-card], [data-pin]'))
		) {
			event.preventDefault();
			spaceHeld = true;
		} else if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			removeSelected();
		} else if (event.key.toLowerCase() === 'v') chooseTool('select');
		else if (event.key.toLowerCase() === 'h') chooseTool('hand');
		else if (event.key.toLowerCase() === 'n') chooseTool('note');
		else if (event.key.toLowerCase() === 'c') chooseTool('thread');
		else if (event.key === '+' || event.key === '=') zoomButton(1.2);
		else if (event.key === '-') zoomButton(1 / 1.2);
		else if (event.key === '1') fit();
		else if (event.key === '?') helpOpen = !helpOpen;
	}
	function pasteImage(event: ClipboardEvent) {
		if (!loaded || importing || editorId || event.defaultPrevented) return;
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || target.closest('input, textarea, select'))
		)
			return;
		const file =
			Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith('image/')) ??
			Array.from(event.clipboardData?.items ?? [])
				.find((item) => item.kind === 'file' && item.type.startsWith('image/'))
				?.getAsFile();
		if (!file) return;
		event.preventDefault();
		void addImage(file, centerPoint(), 'Pasted image');
	}
	async function addImage(file?: File, point?: Point, title?: string) {
		if (!file || !loaded) return;
		if (board.cards.length >= MAX_CARDS) {
			error = 'This board is full. Remove a card before adding another image.';
			return;
		}
		if (
			!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
			file.size > 15 * 1024 * 1024
		) {
			error = 'Choose a PNG, JPEG, or WebP image under 15 MB.';
			return;
		}
		try {
			const bitmap = await createImageBitmap(file);
			if (disposed || board.cards.length >= MAX_CARDS) {
				bitmap.close();
				if (!disposed) error = 'This board is full. Remove a card before adding another image.';
				return;
			}
			const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(bitmap.width * scale);
			canvas.height = Math.round(bitmap.height * scale);
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Image conversion unavailable');
			context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			bitmap.close();
			const card = makeCard('image', point ?? centerPoint());
			card.image = canvas.toDataURL('image/webp', 0.85);
			card.title = title ?? file.name.replace(/\.[^.]+$/, '').slice(0, 200);
			card.height = Math.min(520, Math.max(200, (216 * canvas.height) / canvas.width + 84));
			if (card.image.length > 6_000_000) throw new Error('Image too large');
			commit(() => {
				board.cards.push(card);
			});
			selected = card.id;
			selectedThread = null;
			connectFrom = null;
			tool = 'select';
			error = '';
			viewport.focus();
		} catch {
			error = 'That image could not be opened. Try a smaller PNG, JPEG, or WebP.';
		}
		imageInput.value = '';
	}
	function exportBoard() {
		const url = URL.createObjectURL(
			new Blob([serializeBoardBackup(snapshot())], { type: 'application/json' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${board.name.replace(/[^a-z0-9-]/gi, '-').slice(0, 80) || 'corkboard'}.json`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	async function importBoard(file?: File) {
		if (!file) return;
		importing = true;
		try {
			const imported = await readBoardBackup(file);
			commit(() => {
				board = imported;
			});
			clearSelection();
			editorId = null;
			error = '';
		} catch {
			error =
				'This file is not a valid corkboard backup. Choose a JSON file exported from this board.';
		} finally {
			importing = false;
			importInput.value = '';
		}
	}

	onMount(() => {
		void loadBoard()
			.then((saved) => {
				if (!disposed) {
					board = saved;
					loaded = true;
					status = 'Saved in this browser';
				}
			})
			.catch(() => {
				status = 'Board unavailable';
				error =
					'Your saved board could not be loaded. Enable browser storage, close other board tabs, then reload to retry.';
			});
		return () => {
			disposed = true;
			clearTimeout(wheelTimer);
			if (loaded) {
				if (gesture) board = gesture.before;
				persist();
			}
		};
	});
	function attachViewport(node: HTMLDivElement) {
		viewport = node;
		node.addEventListener('wheel', onWheel, { passive: false });
		return () => node.removeEventListener('wheel', onWheel);
	}
</script>

<svelte:window
	onkeydown={keyDown}
	onpaste={pasteImage}
	onkeyup={(event) => {
		if (event.code === 'Space') spaceHeld = false;
	}}
	onblur={() => {
		spaceHeld = false;
		cancelGesture();
	}}
/>

<section class="corkboard" aria-label="Reading corkboard">
	<header class="board-header">
		<div class="board-identity">
			<span class="board-mark"><Icon name="board" size={23} /></span>
			<div class="board-heading">
				<input
					class="board-name"
					aria-label="Board name"
					value={board.name}
					maxlength="100"
					disabled={!loaded}
					onchange={(event) =>
						commit(() => {
							board.name = event.currentTarget.value.trim() || 'Reading board';
						})}
				/>
				<p class="save-status" aria-live="polite">{status}</p>
			</div>
		</div>
		<div class="board-file-actions">
			<button
				class="board-button"
				aria-label="Import board"
				disabled={!loaded || importing}
				onclick={() => importInput.click()}
				title="Import a board backup. Your current board can be restored with Undo."
				><Icon name="upload" size={17} /><span>{importing ? 'Importing…' : 'Import'}</span></button
			>
			<button
				class="board-button"
				aria-label="Export board"
				disabled={!loaded}
				onclick={exportBoard}
				title="Export a portable JSON backup"
				><Icon name="download" size={17} /><span>Export</span></button
			>
			<button
				class={['board-icon-button', { active: helpOpen }]}
				aria-label="Board help and shortcuts"
				aria-expanded={helpOpen}
				onclick={() => {
					helpOpen = !helpOpen;
					editorId = null;
				}}><Icon name="help" /></button
			>
		</div>
	</header>
	<input
		class="hidden-input"
		{@attach (node) => {
			imageInput = node;
		}}
		type="file"
		accept="image/png,image/jpeg,image/webp"
		aria-label="Upload board image"
		onchange={(event) => void addImage(event.currentTarget.files?.[0])}
	/>
	<input
		class="hidden-input"
		{@attach (node) => {
			importInput = node;
		}}
		type="file"
		accept="application/json,.json"
		aria-label="Import board backup"
		onchange={(event) => void importBoard(event.currentTarget.files?.[0])}
	/>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex (This canvas implements application keyboard controls; its cards and tools are individually accessible.) -->
	<div
		{@attach attachViewport}
		class={[
			'board-viewport',
			{
				panning: tool === 'hand' || spaceHeld || gesture?.kind === 'pan',
				connecting: tool === 'thread' || !!connectFrom,
				placing: tool === 'note'
			}
		]}
		tabindex="0"
		role="application"
		aria-label="Corkboard canvas"
		aria-describedby="board-instructions"
		onpointerdown={canvasDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={cancelGesture}
		style:background-position={`${board.camera.x}px ${board.camera.y}px`}
		style:background-size={`${768 * board.camera.zoom}px`}
	>
		<div
			class="board-stage"
			style:transform={`translate(${board.camera.x}px, ${board.camera.y}px) scale(${board.camera.zoom})`}
		>
			{#each board.cards as card (card.id)}
				<div
					class={[
						'board-card',
						{ chosen: selected === card.id, 'thread-source': connectFrom === card.id }
					]}
					data-color={card.color}
					data-kind={card.kind}
					style:left={`${card.x}px`}
					style:top={`${card.y}px`}
					style:width={`${card.width}px`}
					style:height={`${card.height}px`}
				>
					<button
						class="card-face"
						data-card={card.id}
						aria-label={`${cardName(card)}. ${card.kind}. Enter to edit, arrow keys to move.`}
						aria-pressed={selected === card.id}
						onpointerdown={(event) => cardDown(event, card)}
						onclick={() => cardClick(card)}
						ondblclick={() => {
							if (tool !== 'thread' && tool !== 'hand') void editCard(card);
						}}
						onkeydown={(event) => cardKey(event, card)}
					>
						{#if card.kind === 'image'}
							<img
								class="pinned-image"
								src={card.image}
								alt={card.text || card.title || 'Pinned image'}
								draggable="false"
							/>
						{:else if card.kind === 'paper'}
							<span class="paper-type"><Icon name="paper" size={16} /> Paper / link</span>
						{/if}
						<strong class="card-title"
							>{card.title ||
								(card.kind === 'paper'
									? 'Untitled paper'
									: card.kind === 'image'
										? 'Image'
										: 'A new thought')}</strong
						>
						{#if card.kind !== 'image'}<span
								class="card-text"
								style={`-webkit-line-clamp: ${Math.max(1, Math.floor((card.height - (card.kind === 'paper' ? 200 : 134)) / 25))}`}
								>{card.text ||
									(card.kind === 'note'
										? 'Double-click to write a note.'
										: 'Add a paper link and what stood out.')}</span
							>{/if}
						{#if card.kind === 'paper' && card.url}<span class="paper-domain"
								><Icon name="link" size={14} />{new URL(card.url).hostname}</span
							>{/if}
					</button>
					{#if selected === card.id && tool !== 'thread'}
						<button
							class="resize-handle"
							aria-label={`Resize ${cardName(card)}`}
							data-chrome
							onpointerdown={(event) => startGesture(event, 'resize', card)}
							onkeydown={(event) => {
								if (event.key.startsWith('Arrow')) {
									event.preventDefault();
									event.stopPropagation();
									commit(() => {
										card.width = Math.max(
											180,
											Math.min(
												1000,
												card.width +
													(event.key === 'ArrowRight' ? 10 : event.key === 'ArrowLeft' ? -10 : 0)
											)
										);
										card.height = Math.max(
											160,
											Math.min(
												1200,
												card.height +
													(event.key === 'ArrowDown' ? 10 : event.key === 'ArrowUp' ? -10 : 0)
											)
										);
									});
								}
							}}><Icon name="resize" size={15} /></button
						>
					{/if}
				</div>
			{/each}
			<svg class="thread-layer" aria-label="Red thread connections">
				{#each board.threads as thread (thread.id)}
					{@const from = cardMap.get(thread.from)}
					{@const to = cardMap.get(thread.to)}
					{#if from && to}
						{@const path = threadPath(pinPoint(from), pinPoint(to))}
						<path class="thread-shadow" d={path} />
						<path
							class={['red-thread', { 'selected-thread': selectedThread === thread.id }]}
							d={path}
						/>
						<path
							class="thread-hit"
							data-thread={thread.id}
							d={path}
							role="button"
							tabindex="0"
							aria-label={`Thread: ${cardName(from)} to ${cardName(to)}`}
							onclick={(event) => {
								event.stopPropagation();
								selectedThread = thread.id;
								selected = null;
							}}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									selectedThread = thread.id;
									selected = null;
								}
							}}
						/>
					{/if}
				{/each}
				{#if sourceCard}<path
						class="red-thread preview-thread"
						d={threadPath(pinPoint(sourceCard), pointer)}
					/>{/if}
			</svg>
			{#each board.cards as card (card.id)}
				<button
					class={['card-pin', { 'pin-active': connectFrom === card.id }]}
					data-pin={card.id}
					style:left={`${pinPoint(card).x - 22}px`}
					style:top={`${pinPoint(card).y - 29}px`}
					aria-label={`Connect pin: ${cardName(card)}`}
					title="Click two pins or drag between them to connect"
					onpointerdown={(event) => pinDown(event, card)}
					onclick={(event) => {
						if (event.detail === 0) {
							pointer = pinPoint(card);
							connect(card.id);
						}
					}}><img src="/corkboard/pin.png" alt="" draggable="false" /></button
				>
			{/each}
		</div>

		<div
			class="selection-toolbar board-panel"
			data-chrome
			role="toolbar"
			aria-label="Board actions"
		>
			<button
				class="board-icon-button"
				aria-label="Undo"
				title="Undo (Ctrl+Z)"
				disabled={!past.length || !!editorId}
				onclick={undo}><Icon name="undo" size={18} /></button
			>
			<button
				class="board-icon-button"
				aria-label="Redo"
				title="Redo (Ctrl+Shift+Z)"
				disabled={!future.length || !!editorId}
				onclick={redo}><Icon name="redo" size={18} /></button
			>
			<span class="toolbar-divider"></span>
			<button
				class="board-icon-button"
				aria-label="Edit selected card"
				title="Edit selected card"
				disabled={!selectedCard}
				onclick={() => {
					if (selectedCard) void editCard(selectedCard);
				}}><Icon name="edit" size={18} /></button
			>
			<button
				class="board-icon-button"
				aria-label="Duplicate selected card"
				title="Duplicate (Ctrl+D)"
				disabled={!selectedCard}
				onclick={duplicate}><Icon name="copy" size={18} /></button
			>
			<button
				class="board-icon-button delete-button"
				aria-label="Delete selection"
				title="Delete selection (Delete)"
				disabled={!selected && !selectedThread}
				onclick={removeSelected}><Icon name="trash" size={18} /></button
			>
			{#if selectedCard?.url}<a
					class="board-icon-button"
					href={selectedCard.url}
					target="_blank"
					rel="external noopener noreferrer"
					aria-label="Open paper link"
					title="Open paper link"><Icon name="external" size={18} /></a
				>{/if}
		</div>

		{#if loaded && board.cards.length === 0 && !editorId}
			<div class="board-empty" data-chrome>
				<Icon name="pin" size={30} />
				<h1>A place to connect ideas.</h1>
				<p>Pin a paper, catch a thought,<br />and follow the red thread.</p>
				<div class="empty-actions">
					<button class="board-button primary-button" onclick={() => addCard('note')}
						><Icon name="plus" size={18} />Add a note</button
					><button class="board-button" onclick={() => addCard('paper')}
						><Icon name="paper" size={18} />Pin a paper</button
					>
				</div>
			</div>
		{/if}

		{#if error}
			<div class="board-error board-panel" data-chrome role="alert">
				<p>{error}</p>
				<button class="board-icon-button" aria-label="Dismiss error" onclick={() => (error = '')}
					><Icon name="close" size={18} /></button
				>
			</div>
		{/if}

		{#if editingCard}
			<aside class="board-inspector board-panel" data-chrome aria-label="Card editor">
				<form onsubmit={saveEdit}>
					<div class="inspector-heading">
						<h2>
							{editingCard.kind === 'paper'
								? 'Paper / link'
								: editingCard.kind === 'image'
									? 'Image details'
									: 'Edit note'}
						</h2>
						<button
							type="button"
							class="board-icon-button"
							aria-label="Close editor"
							onclick={closeEditor}><Icon name="close" size={18} /></button
						>
					</div>
					<label for="card-title">Title</label><input
						{@attach (node) => {
							node.focus();
						}}
						id="card-title"
						bind:value={draft.title}
						maxlength="200"
						placeholder={editingCard.kind === 'paper' ? 'Paper title' : 'Give this thought a title'}
					/>
					{#if editingCard.kind === 'paper'}<label for="card-url">Paper link</label><input
							id="card-url"
							type="url"
							bind:value={draft.url}
							maxlength="4000"
							placeholder="https://arxiv.org/abs/…"
						/>{/if}
					<label for="card-text">{editingCard.kind === 'image' ? 'Description' : 'Notes'}</label
					><textarea
						id="card-text"
						bind:value={draft.text}
						rows="6"
						maxlength="20000"
						placeholder="What stands out? What does it connect to?"></textarea>
					<fieldset class="note-colors">
						<legend>Paper color</legend>{#each COLORS as color (color)}<label
								class="color-option"
								data-color={color}
								><input
									type="radio"
									name="paper-color"
									value={color}
									bind:group={draft.color}
									aria-label={`${color} paper`}
								/><span
									>{#if draft.color === color}<Icon name="check" size={17} />{/if}</span
								></label
							>{/each}
					</fieldset>
					<div class="editor-actions">
						<button type="button" class="board-button" onclick={closeEditor}>Cancel</button><button
							class="board-button primary-button"
							type="submit"
							>Save {editingCard.kind === 'paper'
								? 'paper'
								: editingCard.kind === 'image'
									? 'details'
									: 'note'}</button
						>
					</div>
				</form>
			</aside>
		{:else if helpOpen}
			<aside class="board-inspector help-panel board-panel" data-chrome aria-label="Board help">
				<div class="inspector-heading">
					<h2>Make yourself at home.</h2>
					<button
						class="board-icon-button"
						aria-label="Close help"
						onclick={() => (helpOpen = false)}><Icon name="close" size={18} /></button
					>
				</div>
				<p>
					Add notes, paper links, or images. Drag cards to arrange them. Double-click a card to edit
					it.
				</p>
				<p>
					<strong>Follow the thread.</strong> Click two red pins, or drag from one pin to another. Connections
					follow your cards.
				</p>
				<dl>
					<div>
						<dt>Select / move</dt>
						<dd><kbd>V</kbd></dd>
					</div>
					<div>
						<dt>Pan the board</dt>
						<dd><kbd>H</kbd>, then arrow keys</dd>
					</div>
					<div>
						<dt>Place a note</dt>
						<dd><kbd>N</kbd>, then <kbd>Enter</kbd></dd>
					</div>
					<div>
						<dt>Connect pins</dt>
						<dd><kbd>C</kbd></dd>
					</div>
					<div>
						<dt>Paste an image</dt>
						<dd><kbd>Ctrl V</kbd> / <kbd>⌘ V</kbd></dd>
					</div>
					<div>
						<dt>Fit everything</dt>
						<dd><kbd>1</kbd></dd>
					</div>
					<div>
						<dt>Zoom</dt>
						<dd>Scroll / <kbd>+</kbd> <kbd>−</kbd></dd>
					</div>
					<div>
						<dt>Move focused card</dt>
						<dd>Arrow keys</dd>
					</div>
					<div>
						<dt>Undo / redo</dt>
						<dd><kbd>Ctrl Z</kbd> / <kbd>Ctrl Shift Z</kbd></dd>
					</div>
				</dl>
				<p class="local-note">
					Saved automatically in this browser on this device. Export a backup to move your board
					elsewhere. Import replaces this board; Undo brings it back.
				</p>
			</aside>
		{/if}

		<div class="board-bottom" data-chrome>
			<div class="zoom-toolbar board-panel" role="toolbar" aria-label="Canvas zoom">
				<button
					class="board-icon-button"
					aria-label="Zoom out"
					disabled={!loaded || board.camera.zoom <= MIN_ZOOM}
					onclick={() => zoomButton(1 / 1.2)}><Icon name="minus" size={18} /></button
				>
				<button
					class="zoom-value"
					title="Reset zoom to 100%"
					disabled={!loaded}
					onclick={() => {
						zoom(1 / board.camera.zoom);
						persist();
					}}>{Math.round(board.camera.zoom * 100)}%</button
				>
				<button
					class="board-icon-button"
					aria-label="Zoom in"
					disabled={!loaded || board.camera.zoom >= MAX_ZOOM}
					onclick={() => zoomButton(1.2)}><Icon name="plus" size={18} /></button
				>
				<span class="toolbar-divider"></span><button
					class="board-icon-button"
					aria-label="Fit board to screen"
					title="Fit board (1)"
					disabled={!loaded}
					onclick={fit}><Icon name="fit" size={18} /></button
				>
			</div>
			<div class="creation-toolbar board-panel" role="toolbar" aria-label="Canvas tools">
				<button
					class={['tool-button', { active: tool === 'select' }]}
					aria-label="Select tool"
					aria-pressed={tool === 'select'}
					title="Select (V)"
					disabled={!loaded}
					onclick={() => chooseTool('select')}><Icon name="select" /><span>Select</span></button
				>
				<button
					class={['tool-button', { active: tool === 'hand' }]}
					aria-label="Hand tool"
					aria-pressed={tool === 'hand'}
					title="Pan (H or hold Space)"
					disabled={!loaded}
					onclick={() => chooseTool('hand')}><Icon name="hand" /><span>Hand</span></button
				>
				<span class="toolbar-divider"></span>
				<button
					class={['tool-button', { active: tool === 'note' }]}
					aria-label="Note tool"
					aria-pressed={tool === 'note'}
					title="Place a note (N)"
					disabled={!loaded}
					onclick={() => chooseTool('note')}><Icon name="note" /><span>Note</span></button
				>
				<button
					class="tool-button"
					aria-label="Pin a paper"
					title="Pin a paper link"
					disabled={!loaded}
					onclick={() => addCard('paper')}><Icon name="paper" /><span>Paper</span></button
				>
				<button
					class={['tool-button thread-tool', { active: tool === 'thread' }]}
					aria-label="Red thread tool"
					aria-pressed={tool === 'thread'}
					title="Connect with red thread (C)"
					disabled={!loaded}
					onclick={() => chooseTool('thread')}><Icon name="thread" /><span>Thread</span></button
				>
				<button
					class="tool-button"
					aria-label="Add image"
					title="Pin an image or paste with Ctrl+V / ⌘V"
					disabled={!loaded}
					onclick={() => imageInput.click()}><Icon name="image" /><span>Image</span></button
				>
			</div>
			<p class="board-count">
				{board.cards.length}
				{board.cards.length === 1 ? 'card' : 'cards'}<span>
					· {board.threads.length} {board.threads.length === 1 ? 'thread' : 'threads'}</span
				>
			</p>
		</div>
		<p
			id="board-instructions"
			class={['board-hint', { 'hint-active': tool !== 'select' || !!connectFrom }]}
			data-chrome
		>
			{hint}
		</p>
	</div>
</section>
