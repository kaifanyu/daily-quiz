<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { beforeNavigate, goto } from '$app/navigation';
	import type {
		Concept,
		Library,
		LibraryEntry,
		ConceptNoteKey as NoteKey,
		Paper
	} from '$lib/labbook/types';
	import {
		normalizeLibrary,
		MAX_LIBRARY_BYTES,
		parseBackup,
		emptyNotes,
		allEntries,
		attachmentIds,
		sameRecord
	} from '$lib/labbook/model';
	import {
		renderMarkdown,
		renderMath,
		loadKatex,
		readAttachment,
		insertText,
		continueList,
		templates
	} from '$lib/labbook/editor';
	import { NotebookClient, type BrowserDraft, type SaveStatus } from '$lib/labbook/client';
	import './labbook.css';
	let {
		library,
		canEdit,
		storageMode
	}: { library: Library; canEdit: boolean; storageMode: 'local' | 'cloud' } = $props();
	let notebook = $state<Library>(untrack(() => normalizeLibrary(library).state));
	let collection = $state<'papers' | 'concepts'>('papers');
	let activeId = $state<string | null>(null);
	let view = $state<'write' | 'split' | 'read'>('split');
	let query = $state(''),
		sidebarQuery = $state(''),
		tagFilter = $state(''),
		sort = $state('updated');
	let mathReady = $state(false),
		narrow = $state(false),
		sidebarPreference = $state<boolean | null>(null);
	let status = $state<SaveStatus>('saved'),
		statusText = $state(''),
		notice = $state('');
	let drafts = $state<BrowserDraft[]>([]),
		toast = $state('');
	let undo = $state<(() => void) | null>(null);
	let client: NotebookClient | undefined;
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	let lastEditor: HTMLTextAreaElement | null = null;
	const editors = new SvelteMap<string, HTMLTextAreaElement>();
	let sidebarToggle = $state<HTMLButtonElement>(),
		sidebarElement = $state<HTMLElement>(),
		sidebarSearch = $state<HTMLInputElement>();
	let metadataDialog = $state<HTMLDialogElement>(),
		equationDialog = $state<HTMLDialogElement>(),
		deleteDialog = $state<HTMLDialogElement>(),
		importDialog = $state<HTMLDialogElement>();
	let imageInput = $state<HTMLInputElement>(),
		pdfInput = $state<HTMLInputElement>(),
		backupInput = $state<HTMLInputElement>();
	let editId: string | null = null,
		editCollection: 'papers' | 'concepts' = 'papers';
	let formTitle = $state(''),
		formAuthors = $state(''),
		formYear = $state(''),
		formTags = $state(''),
		formUrl = $state(''),
		formError = $state('');
	let editingConcept = $state(false),
		editingExisting = $state(false);
	let equation = $state(
		String.raw`\mathcal{L}(\theta) = \frac{1}{N} \sum_{i=1}^{N} \|\hat{y}_i-y_i\|^2`
	);
	type Target = { id: string; key: NoteKey; start: number; end: number; source: string };
	let insertTarget: Target | null = null,
		pdfTarget: string | null = null,
		deleteTarget: string | null = null;
	let importError = $state('');
	let pendingImport = $state<Library | null>(null),
		recoveryId: string | null = null;
	let pdfUrl = $state<string | null>(null);
	let revokePdf: (() => void) | undefined;
	const sections: { key: NoteKey; title: string; prompt: string }[] = [
		{
			key: 'what-it-does',
			title: 'What it does',
			prompt:
				'What problem does the paper solve? Explain the main idea, including what goes in and what comes out.'
		},
		{
			key: 'how-it-does',
			title: 'How it does it',
			prompt: 'Break down the method. Record the assumptions, equations, and key steps.'
		},
		{
			key: 'results',
			title: 'Results',
			prompt: 'What worked? Compare the evidence, limitations, and questions to revisit.'
		}
	];
	const concepts = $derived(collection === 'concepts');
	const entries = $derived(collection === 'concepts' ? notebook.concepts : notebook.papers);
	const current = $derived(entries.find((item) => item.id === activeId));
	const effectiveView = $derived(canEdit ? view : 'read');
	const collapsed = $derived(sidebarPreference ?? narrow);
	const itemName = $derived(concepts ? 'topic' : 'paper');
	const tags = $derived(
		[...new Set(entries.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b))
	);
	const filtered = $derived(
		entries
			.filter(
				(item) =>
					(!tagFilter || item.tags.includes(tagFilter)) &&
					[
						item.title,
						'authors' in item ? item.authors : '',
						'year' in item ? item.year : '',
						...item.tags,
						...Object.values(item.notes)
					]
						.join(' ')
						.toLowerCase()
						.includes(query.trim().toLowerCase())
			)
			.toSorted((a, b) =>
				sort === 'title'
					? a.title.localeCompare(b.title)
					: sort === 'year'
						? (Number('year' in b ? b.year : 0) || 0) - (Number('year' in a ? a.year : 0) || 0)
						: b.updatedAt.localeCompare(a.updatedAt)
			)
	);
	const sidebarItems = $derived(
		entries
			.filter((item) =>
				[item.title, 'authors' in item ? item.authors : '', ...item.tags]
					.join(' ')
					.toLowerCase()
					.includes(sidebarQuery.trim().toLowerCase())
			)
			.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
	);
	const layout = $derived(
		concepts ? [{ key: 'what-it-does' as NoteKey, title: 'Notes', prompt: '' }] : sections
	);
	const stamp = () => new Date().toISOString();
	const entryHash = (id: string) => `#/${concepts ? 'concept' : 'paper'}/${id}`;
	const homeHash = () => (concepts ? '#/concepts' : '#/');
	const findEntry = (id: string) => allEntries(notebook).find((item) => item.id === id);
	const dateLabel = (value: string) => {
		const date = new Date(value);
		return Number.isNaN(+date)
			? 'Recently added'
			: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	};
	const excerpt = (item: LibraryEntry) =>
		item.notes['what-it-does']
			.replace(/```[\s\S]*?```/g, '')
			.replace(/\$\$[\s\S]*?\$\$/g, '')
			.replace(/!\[[^\]]*\]\([^)]+\)/g, '')
			.replace(/[*#`]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 150);
	const countNotes = (item: LibraryEntry) =>
		sections.filter((section) => item.notes[section.key]?.trim()).length;
	function preview(source: string) {
		if (!mathReady) return renderMarkdown(source, notebook.attachments);
		return renderMarkdown(source, notebook.attachments);
	}
	function announce(message: string, action: (() => void) | null = null) {
		toast = message;
		undo = action;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(
			() => {
				toast = '';
				undo = null;
			},
			action ? 12000 : 5000
		);
	}
	function changed(item?: LibraryEntry) {
		if (!canEdit) return;
		if (item) item.updatedAt = stamp();
		client?.changed();
	}
	function resize(editor: HTMLTextAreaElement) {
		if (!editor.offsetParent) return;
		editor.style.height = 'auto';
		editor.style.height = `${Math.max(concepts ? 360 : 150, editor.scrollHeight + 3)}px`;
	}
	function attachEditor(node: HTMLTextAreaElement) {
		editors.set(node.dataset.slug!, node);
		resize(node);
		return () => {
			if (lastEditor === node) lastEditor = null;
			editors.delete(node.dataset.slug!);
		};
	}
	async function changeView(mode: 'write' | 'split' | 'read') {
		view = mode;
		await tick();
		for (const editor of editors.values()) resize(editor);
	}
	async function toggleSidebar() {
		sidebarPreference = !collapsed;
		try {
			localStorage.setItem('labbook-sidebar-collapsed', String(sidebarPreference));
		} catch {
			/* Preference is optional. */
		}
		await tick();
		if (!collapsed && window.matchMedia('(max-width:580px)').matches) sidebarSearch?.focus();
		for (const editor of editors.values()) resize(editor);
	}
	function route() {
		const match = location.hash.match(/^#\/(paper|concept)\/([a-zA-Z0-9_-]+)$/);
		const next = location.hash === '#/concepts' || match?.[1] === 'concept' ? 'concepts' : 'papers';
		if (next !== collection) {
			query = '';
			sidebarQuery = '';
			tagFilter = '';
			if (next === 'concepts') {
				view = 'write';
				if (sort === 'year') sort = 'updated';
			}
		}
		collection = next;
		activeId = match && notebook[next].some((item) => item.id === match[2]) ? match[2] : null;
		lastEditor = null;
		updatePdf();
		window.scrollTo(0, 0);
	}
	function updatePdf() {
		revokePdf?.();
		revokePdf = undefined;
		pdfUrl = null;
		const item = activeId ? findEntry(activeId) : undefined;
		const attachment = item?.pdfId ? notebook.attachments[item.pdfId] : undefined;
		if (attachment?.mime === 'application/pdf') {
			try {
				const bytes = Uint8Array.from(atob(attachment.data.split(',')[1]), (character) =>
					character.charCodeAt(0)
				);
				pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
				const url = pdfUrl;
				revokePdf = () => URL.revokeObjectURL(url);
			} catch {
				announce('The attached PDF could not be opened.');
			}
		}
	}
	function openMetadata(item?: LibraryEntry) {
		if (!canEdit) return;
		editId = item?.id ?? null;
		editCollection = collection;
		editingConcept = concepts;
		editingExisting = !!item;
		formTitle = item?.title ?? '';
		formAuthors = item && 'authors' in item ? item.authors : '';
		formYear = item && 'year' in item ? String(item.year) : '';
		formTags = item?.tags.join(', ') ?? '';
		formUrl = item?.url ?? '';
		formError = '';
		metadataDialog?.showModal();
	}
	function normalizeUrl(value: string) {
		let source = value.trim();
		if (!source) return '';
		if (/^10\.\d{4,9}\//.test(source)) source = `https://doi.org/${source}`;
		let parsed: URL;
		try {
			parsed = new URL(source);
		} catch {
			throw new Error('Enter a full https:// link or a DOI beginning with 10.');
		}
		if (!['https:', 'http:'].includes(parsed.protocol))
			throw new Error('Reference links must begin with https:// or http://.');
		return parsed.href;
	}
	function saveMetadata(event: SubmitEvent) {
		event.preventDefault();
		if (!canEdit || !formTitle.trim()) return;
		try {
			const url = normalizeUrl(formUrl),
				itemTags = [
					...new Set(
						formTags
							.split(',')
							.map((value) => value.trim())
							.filter(Boolean)
					)
				];
			if (itemTags.length > 20 || itemTags.some((value) => value.length > 100))
				throw new Error('Use up to 20 tags, each no longer than 100 characters.');
			const fields = { title: formTitle.trim(), tags: itemTags, url };
			let item = editId ? findEntry(editId) : undefined;
			if (item)
				Object.assign(
					item,
					fields,
					editCollection === 'papers' ? { authors: formAuthors.trim(), year: formYear.trim() } : {}
				);
			else if (editCollection === 'papers') {
				const paper: Paper = {
					id: crypto.randomUUID(),
					...fields,
					authors: formAuthors.trim(),
					year: formYear.trim(),
					addedAt: stamp(),
					updatedAt: stamp(),
					notes: emptyNotes(),
					scratchpad: ''
				};
				notebook.papers.unshift(paper);
				item = notebook.papers[0];
			} else {
				const concept: Concept = {
					id: crypto.randomUUID(),
					...fields,
					addedAt: stamp(),
					updatedAt: stamp(),
					notes: emptyNotes('concept')
				};
				notebook.concepts.unshift(concept);
				item = notebook.concepts[0];
			}
			changed(item);
			metadataDialog?.close();
			collection = editCollection;
			if (!editId && item) {
				view = 'write';
				location.hash = entryHash(item.id);
			}
		} catch (error) {
			formError = error instanceof Error ? error.message : 'These details could not be saved.';
		}
	}
	function target(): Target | null {
		const editor = lastEditor?.isConnected ? lastEditor : editors.values().next().value;
		if (!editor || !current) return null;
		return {
			id: current.id,
			key: editor.dataset.slug as NoteKey,
			start: editor.selectionStart,
			end: editor.selectionEnd,
			source: editor.value
		};
	}
	async function insertAt(destination: Target | null, text: string) {
		if (!canEdit || !destination) return;
		const item = findEntry(destination.id);
		if (!item) {
			announce('This note is no longer in your library.');
			return;
		}
		const before = item.notes[destination.key] ?? '',
			start = before === destination.source ? destination.start : before.length,
			end = before === destination.source ? destination.end : before.length;
		item.notes[destination.key] = before.slice(0, start) + text + before.slice(end);
		changed(item);
		if (activeId === item.id) {
			if (view === 'read') view = 'write';
			await tick();
			const editor = editors.get(destination.key);
			editor?.focus();
			editor?.setSelectionRange(start + text.length, start + text.length);
			if (editor) {
				resize(editor);
				lastEditor = editor;
			}
		}
	}
	async function bold() {
		const destination = target();
		if (destination)
			await insertAt(
				destination,
				`**${destination.source.slice(destination.start, destination.end) || 'bold text'}**`
			);
	}
	function noteInput(event: Event, key: NoteKey) {
		if (!current || !canEdit) return;
		const editor = event.currentTarget as HTMLTextAreaElement;
		current.notes[key] = editor.value;
		resize(editor);
		changed(current);
	}
	function noteKey(event: KeyboardEvent) {
		continueList(event);
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
			event.preventDefault();
			const editor = event.currentTarget as HTMLTextAreaElement;
			insertText(
				editor,
				`**${editor.value.slice(editor.selectionStart, editor.selectionEnd) || 'bold text'}**`
			);
		}
	}
	function showEquation() {
		insertTarget = target();
		if (insertTarget) equationDialog?.showModal();
	}
	async function addImage(file: File | undefined, destination: Target | null) {
		if (!canEdit || !file || !destination) return;
		try {
			const attachment = await readAttachment(file);
			if (!attachment.mime.startsWith('image/'))
				throw new Error('Choose a PNG, JPEG, WebP, or GIF image.');
			if (!findEntry(destination.id)) return;
			const id = crypto.randomUUID();
			notebook.attachments[id] = attachment;
			await insertAt(
				destination,
				`\n\n![${attachment.name.replace(/[\[\]\r\n]/g, ' ')}](attachment:${id})\n\n`
			);
			await changeView('split');
			announce('Image inserted.');
		} catch (error) {
			announce(error instanceof Error ? error.message : 'The image could not be inserted.');
		}
	}
	function pasteImage(event: ClipboardEvent) {
		if (!canEdit) return;
		const item = [...(event.clipboardData?.items ?? [])].find((item) =>
			item.type.startsWith('image/')
		);
		if (item) {
			event.preventDefault();
			lastEditor = event.currentTarget as HTMLTextAreaElement;
			void addImage(item.getAsFile() ?? undefined, target());
		}
	}
	function prune(candidates: Iterable<string>) {
		const used = attachmentIds(allEntries(notebook));
		for (const id of candidates) if (!used.has(id)) delete notebook.attachments[id];
	}
	async function attachPdf(file: File | undefined) {
		if (!canEdit || !file || !pdfTarget) return;
		const id = pdfTarget;
		try {
			const attachment = await readAttachment(file);
			if (attachment.mime !== 'application/pdf') throw new Error('Choose a PDF file.');
			const item = findEntry(id);
			if (!item) return;
			const old = item.pdfId,
				attachmentId = crypto.randomUUID();
			notebook.attachments[attachmentId] = attachment;
			item.pdfId = attachmentId;
			if (old) prune([old]);
			changed(item);
			updatePdf();
			announce('PDF attached and included in backups.');
		} catch (error) {
			announce(error instanceof Error ? error.message : 'The PDF could not be attached.');
		}
	}
	function removeEntry() {
		if (!canEdit || !deleteTarget) return;
		const group = collection,
			index = notebook[group].findIndex((item) => item.id === deleteTarget);
		if (index < 0) return;
		const removed = notebook[group].splice(index, 1)[0],
			attachments = Object.fromEntries(
				[...attachmentIds([removed])]
					.filter((id) => notebook.attachments[id])
					.map((id) => [id, $state.snapshot(notebook.attachments[id])])
			);
		prune(Object.keys(attachments));
		deleteDialog?.close();
		changed();
		location.hash = homeHash();
		announce(`${concepts ? 'Topic' : 'Paper'} removed.`, () => {
			if (!findEntry(removed.id)) {
				notebook.attachments = { ...notebook.attachments, ...attachments };
				if (group === 'papers') notebook.papers.splice(index, 0, removed as Paper);
				else notebook.concepts.splice(index, 0, removed as Concept);
				changed();
			}
		});
	}
	function exportLibrary(value: Library = $state.snapshot(notebook), name = 'labbook') {
		const blob = new Blob(
				[JSON.stringify({ ...value, format: 'labbook-library', exportedAt: stamp() }, null, 2)],
				{ type: 'application/json' }
			),
			url = URL.createObjectURL(blob),
			link = document.createElement('a');
		link.href = url;
		link.download = `${name}-${stamp().slice(0, 10)}.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 2000);
	}
	async function prepareImport(file?: File, draft?: BrowserDraft) {
		if (!canEdit) return;
		try {
			if (file && file.size > 50 * 1024 * 1024)
				throw new Error('Choose a backup smaller than 50 MB.');
			const value = draft?.state ?? JSON.parse(await file!.text());
			pendingImport = parseBackup(value);
			importError = '';
			recoveryId = draft?.id ?? null;
			importDialog?.showModal();
		} catch (error) {
			announce(error instanceof Error ? error.message : 'This backup could not be read.');
		}
	}
	async function confirmImport() {
		if (!canEdit || !pendingImport) return;
		const incoming = $state.snapshot(pendingImport),
			recoveredId = recoveryId;
		try {
			const candidate = $state.snapshot(notebook);
			const mapping: Record<string, string> = Object.create(null);
			let added = 0,
				skipped = 0;
			for (const [id, attachment] of Object.entries(incoming.attachments)) {
				const existing = Object.hasOwn(candidate.attachments, id)
					? candidate.attachments[id]
					: undefined;
				const newId = existing && existing.data !== attachment.data ? crypto.randomUUID() : id;
				mapping[id] = newId;
				// Retain every imported attachment, including images temporarily absent from note text.
				Object.defineProperty(candidate.attachments, newId, {
					value: attachment,
					writable: true,
					enumerable: true,
					configurable: true
				});
			}
			for (const group of ['papers', 'concepts'] as const)
				for (const source of incoming[group]) {
					const item = structuredClone(source);
					const notes: Record<string, string> = item.notes;
					for (const key of Object.keys(notes))
						notes[key] = notes[key].replace(
							/\(attachment:([a-zA-Z0-9_-]+)\)/g,
							(_, id: string) => `(attachment:${mapping[id] ?? id})`
						);
					if (item.pdfId) item.pdfId = mapping[item.pdfId] ?? item.pdfId;
					const existing = allEntries(candidate).find((record) => record.id === item.id);
					if (
						existing &&
						candidate[group].some((record) => record.id === item.id) &&
						sameRecord(existing, item)
					) {
						skipped++;
						continue;
					}
					if (existing) {
						item.id = crypto.randomUUID();
						item.title = `${item.title.slice(0, 984)} (imported copy)`;
					}
					if (group === 'papers') candidate.papers.push(item as Paper);
					else candidate.concepts.push(item as Concept);
					added++;
				}
			const normalized = normalizeLibrary(candidate).state;
			if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > MAX_LIBRARY_BYTES)
				throw new Error(
					'The combined library would exceed 50 MB. Import a smaller backup; your current notes have not changed.'
				);
			if (!sameRecord(notebook, normalized)) {
				notebook = normalized;
				changed();
				updatePdf();
			}
			importDialog?.close();
			pendingImport = null;
			if (recoveredId && (await client?.settle())) {
				await client?.clearDraft(recoveredId);
				drafts = drafts.filter((draft) => draft.id !== recoveredId);
			}
			announce(
				`${added} ${added === 1 ? 'item' : 'items'} imported${skipped ? `; ${skipped} unchanged skipped` : ''}.`
			);
		} catch (error) {
			importError =
				error instanceof Error
					? error.message
					: 'The import could not be completed. Your backup is unchanged.';
		}
	}

	function keyboard(event: KeyboardEvent) {
		if (canEdit && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			void client?.flush();
		}
	}
	function beforeUnload(event: BeforeUnloadEvent) {
		if (client?.dirty) {
			void client.flush();
			event.preventDefault();
		}
	}
	beforeNavigate((navigation) => {
		if (!canEdit || !client?.dirty || navigation.to?.url.pathname === location.pathname) return;
		if (navigation.willUnload) {
			void client.flush();
			navigation.cancel();
			return;
		}
		const destination = navigation.to?.url;
		if (!destination) return;
		navigation.cancel();
		void client.settle().then((saved) => {
			if (saved)
				void goto(
					resolve(`${destination.pathname}${destination.search}${destination.hash}` as '/')
				);
			else
				notice =
					'Your latest changes are still in this notebook. Retry saving or export a backup before leaving.';
		});
	});
	onMount(() => {
		const media = window.matchMedia('(max-width:900px)');
		narrow = media.matches;
		try {
			const saved = localStorage.getItem('labbook-sidebar-collapsed');
			if (saved === 'true' || saved === 'false') sidebarPreference = saved === 'true';
		} catch {
			/* Optional preference. */
		}
		const resizeWorkspace = () => {
			narrow = media.matches;
			if (collapsed && sidebarElement?.contains(document.activeElement))
				sidebarToggle?.focus({ preventScroll: true });
		};
		media.addEventListener('change', resizeWorkspace);
		route();
		void loadKatex()
			.then(() => (mathReady = true))
			.catch(() => {
				/* Formulas remain visible as source if the renderer is unavailable. */
			});
		if (canEdit) {
			statusText = storageMode === 'local' ? 'Saved on this device' : 'Saved to your library';
			client = new NotebookClient({
				getState: () => $state.snapshot(notebook),
				onRevision: (revision) => (notebook.revision = revision),
				onStatus: (value, message) => {
					status = value;
					statusText = message;
				},
				onNotice: (message) => (notice = message),
				storageMode
			});
			void client.open().then((values) => (drafts = values));
		} else statusText = 'Reading view';
		return () => {
			media.removeEventListener('change', resizeWorkspace);
			clearTimeout(toastTimer);
			revokePdf?.();
			void client?.flush();
		};
	});
</script>

<!-- eslint-disable svelte/no-at-html-tags -- Only the HTML-escaping Markdown renderer and KaTeX with trust:false generate this HTML; raw note HTML is never passed through. -->
<svelte:head>
	<title
		>{current
			? `${current.title} — Labbook`
			: `Labbook — ${concepts ? 'Concepts' : 'Papers'}`}</title
	>
	<link rel="stylesheet" href="/labbook/vendor/katex/katex.min.css" />
</svelte:head>
<svelte:window
	onhashchange={route}
	onkeydown={keyboard}
	onbeforeunload={beforeUnload}
	onresize={() => {
		for (const editor of editors.values()) resize(editor);
	}}
/>
<svelte:document
	onvisibilitychange={() => {
		if (document.visibilityState === 'hidden') void client?.flush();
	}}
/>
<div class="labbook" data-view={effectiveView} data-collection={collection}>
	{#if notice}<div class="app-notice" role="status">
			{notice}<span class="notice-actions"
				><button onclick={() => exportLibrary()}>Export current notes</button
				>{#if status !== 'conflict'}<button onclick={() => client?.flush()}>Retry save</button
					>{/if}</span
			>
		</div>{/if}
	{#if canEdit && drafts.length}<div class="recovery-banner">
			<span>Notes from an earlier browser session are available.</span><button
				onclick={() => prepareImport(undefined, drafts[0])}>Recover browser notes</button
			><button onclick={() => exportLibrary(drafts[0].state, 'labbook-recovery')}
				>Export recovery copy</button
			>
		</div>{/if}
	{#if !current}
		<main class="dashboard">
			<section class="dashboard-heading" aria-labelledby="dashboard-title">
				<div>
					<div class="eyebrow">
						{concepts ? 'Your ideas, made clearer' : 'Your personal research notebook'}
					</div>
					<h1 id="dashboard-title">
						{concepts ? 'Your concepts, connected.' : 'Your reading, connected.'}
					</h1>
					<p>
						{concepts
							? 'Explore a topic. Follow an idea. Build your understanding.'
							: 'Keep the papers. Capture the ideas. Make them your own.'}
					</p>
				</div>
				{#if canEdit}<button class="primary-button" onclick={() => openMetadata()}
						><span class="plus" aria-hidden="true">+</span> Add a {itemName}</button
					>{/if}
			</section>
			<nav class="collection-tabs" aria-label="Notebook collections">
				<a
					class="collection-tab"
					class:active={!concepts}
					href="#/"
					aria-current={!concepts ? 'page' : undefined}
					>Papers <span class="paper-count">{notebook.papers.length}</span></a
				><a
					class="collection-tab"
					class:active={concepts}
					href="#/concepts"
					aria-current={concepts ? 'page' : undefined}
					>Concepts <span class="paper-count">{notebook.concepts.length}</span></a
				>
			</nav>
			<section class="collection" aria-labelledby="collection-title">
				<div class="collection-heading">
					<div class="collection-title">
						<h2 id="collection-title">{concepts ? 'All topics' : 'All papers'}</h2>
						<span class="paper-count">{entries.length}</span>
					</div>
					<span class="collection-note"
						>{concepts
							? 'A place for the ideas you want to understand.'
							: 'A home for the papers you read and the ideas they spark.'}</span
					>
				</div>
				<div class="dashboard-filters">
					<div class="search-wrap dashboard-search">
						<span class="search-icon" aria-hidden="true">⌕</span><label
							class="visually-hidden"
							for="dashboard-search">Search {concepts ? 'topics' : 'papers'} and notes</label
						><input
							id="dashboard-search"
							type="search"
							bind:value={query}
							placeholder={concepts ? 'Find a topic, tag, or idea…' : 'Find a paper, tag, or idea…'}
						/>
					</div>
					<div class="filter-select">
						<label for="tag-filter">Category</label><select id="tag-filter" bind:value={tagFilter}
							><option value="">All tags</option>{#each tags as tag (tag)}<option value={tag}
									>{tag}</option
								>{/each}</select
						>
					</div>
					<div class="filter-select sort-select">
						<label for="sort-order">Sort by</label><select id="sort-order" bind:value={sort}
							><option value="updated">Recently updated</option><option value="title"
								>Title A–Z</option
							>{#if !concepts}<option value="year">Publication year</option>{/if}</select
						>
					</div>
				</div>
				<div class="paper-grid">
					{#each filtered as item (item.id)}<a
							class="paper-card"
							href={resolve(`/${entryHash(item.id)}` as '/')}
							><div class="card-tagline">
								{item.tags.slice(0, 2).join(' / ') ||
									(concepts ? 'Concept notes' : 'Reading notes')}<span
									>{'year' in item ? item.year : ''}</span
								>
							</div>
							<h3 class="card-title">{item.title}</h3>
							<p class="card-authors">
								{concepts
									? 'Ideas, in your own words'
									: ('authors' in item && item.authors) || 'Personal reading notes'}
							</p>
							<p class="card-excerpt" class:muted={!excerpt(item)}>
								{excerpt(item) ||
									(canEdit
										? concepts
											? 'Start with the idea. Add a definition, a question, or an example.'
											: 'Start with the main idea in your own words.'
										: 'Notes coming soon.')}
							</p>
							<div class="card-footer">
								<span
									>{concepts
										? item.notes['what-it-does'].trim()
											? 'Notes'
											: 'New topic'
										: `${countNotes(item)} / ${sections.length} sections`}</span
								><span aria-hidden="true">↗</span>
							</div>
							<div class="card-date">Updated {dateLabel(item.updatedAt)}</div></a
						>{/each}
				</div>
				{#if !entries.length}<div class="empty-library">
						<div class="empty-mark" aria-hidden="true">▤</div>
						<div class="eyebrow">The beginning of a good collection</div>
						<h3>{concepts ? 'Every idea deserves a page.' : 'Every paper starts a new page.'}</h3>
						<p>
							{canEdit
								? concepts
									? 'Create a topic and make it your own with freeform notes, equations, and images.'
									: 'Add your first paper and give your reading a home. Three guided sections, equations, and images.'
								: 'This collection is waiting for its first notes.'}
						</p>
						{#if canEdit}<button class="primary-button" onclick={() => openMetadata()}
								>+ Add a {itemName}</button
							>
							<div class="empty-import">
								Already have a Labbook backup? <button
									class="text-button"
									onclick={() => backupInput?.click()}>Import it here</button
								>
							</div>{/if}
					</div>{:else if !filtered.length}<div class="no-results">
						<span class="eyebrow">Nothing here just yet</span>
						<h3>No {concepts ? 'topics' : 'papers'} match your search.</h3>
						<p>Try another word or choose a different category.</p>
					</div>{/if}
			</section>
			<footer class="dashboard-footer">
				<div class="storage-caption">
					<span class="storage-dot" aria-hidden="true"></span><span
						role="status"
						data-status={status}
						>{statusText || (canEdit ? 'Your research, saved locally.' : 'Reading view')}</span
					>
				</div>
				<div class="footer-actions">
					{#if canEdit}<button class="quiet-button" onclick={() => backupInput?.click()}
							>Import backup</button
						><span aria-hidden="true">·</span>{/if}<button
						class="quiet-button"
						onclick={() => exportLibrary()}>Export library</button
					>
				</div>
			</footer>
		</main>
	{:else}
		<div class="workspace" class:sidebar-collapsed={collapsed}>
			<aside
				id="notebook-sidebar"
				class="library"
				aria-label="Notebook collection"
				hidden={collapsed}
				{@attach (node) => {
					sidebarElement = node;
					return () => {
						sidebarElement = undefined;
					};
				}}
			>
				<div class="library-top">
					<a class="back-library" href={resolve(`/${homeHash()}` as '/')}
						><span aria-hidden="true">←</span> Back to dashboard</a
					>
					<nav class="sidebar-collection-tabs" aria-label="Notebook collections">
						<a class:active={!concepts} href="#/">Papers</a><a
							class:active={concepts}
							href="#/concepts">Concepts</a
						>
					</nav>
					<div class="library-title">
						<h2>{concepts ? 'Your concepts' : 'Your papers'}</h2>
						<span class="paper-count">{entries.length}</span>
					</div>
					<div class="search-wrap">
						<span class="search-icon" aria-hidden="true">⌕</span><label
							class="visually-hidden"
							for="sidebar-search">Search {concepts ? 'topics' : 'papers'}</label
						><input
							id="sidebar-search"
							{@attach (node) => {
								sidebarSearch = node;
								return () => {
									sidebarSearch = undefined;
								};
							}}
							type="search"
							bind:value={sidebarQuery}
							placeholder={`Find a ${itemName}…`}
						/>
					</div>
				</div>
				<div class="collection-label"><span class="eyebrow">In your collection</span></div>
				<nav class="paper-list" aria-label={concepts ? 'Concepts' : 'Papers'}>
					{#each sidebarItems as item (item.id)}<a
							class="paper-item"
							class:active={item.id === current.id}
							href={resolve(`/${entryHash(item.id)}` as '/')}
							aria-current={item.id === current.id ? 'page' : undefined}
							><span class="paper-item-title">{item.title}</span><span class="paper-item-meta"
								>{['year' in item ? item.year : '', item.tags[0]].filter(Boolean).join(' · ') ||
									('authors' in item ? item.authors : '') ||
									(concepts ? 'Concept notes' : 'Reading notes')}</span
							></a
						>{:else}<p class="paper-empty">No matching {concepts ? 'topics' : 'papers'}.</p>{/each}
				</nav>
				{#if canEdit}<button class="add-paper" onclick={() => openMetadata()}
						><span aria-hidden="true">+</span> Add a {itemName}</button
					>{/if}
				<div class="library-bottom">
					<div class="eyebrow">A little every day.</div>
					<p class="local-note">
						Keep the ideas. Make the connections. Build your own body of knowledge.
					</p>
					<div class="edition">Personal research notebook</div>
				</div>
			</aside>
			<main class="editor">
				<div class="editor-topline">
					<div class="editor-navigation">
						<button
							class="sidebar-toggle"
							{@attach (node) => {
								sidebarToggle = node;
								return () => {
									sidebarToggle = undefined;
								};
							}}
							onclick={toggleSidebar}
							aria-controls="notebook-sidebar"
							aria-expanded={!collapsed}
							aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
							title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
							><svg viewBox="0 0 20 20" aria-hidden="true" fill="none"
								><rect
									x="2.5"
									y="3.5"
									width="15"
									height="13"
									rx="2"
									stroke="currentColor"
									stroke-width="1.2"
								/><path d="M7.5 4v12" stroke="currentColor" stroke-width="1.2" /></svg
							><span>Sidebar</span></button
						>
						<div class="document-type">{concepts ? 'Concept note' : 'Research note'}</div>
					</div>
					<div class="editor-status">
						<span class="save-status" role="status" data-status={status}>{statusText}</span><button
							class="quiet-button"
							onclick={() => exportLibrary()}>Export</button
						>
					</div>
				</div>
				<h1 class="paper-title">{current.title}</h1>
				<p class="paper-meta">
					{concepts
						? `Concept notes · Updated ${dateLabel(current.updatedAt)}`
						: ['authors' in current ? current.authors : '', 'year' in current ? current.year : '']
								.filter(Boolean)
								.join(' · ') || 'Reading notes'}
				</p>
				<div class="paper-details-row">
					<div class="paper-tags">
						{#each current.tags as tag (tag)}<span>{tag}</span>{/each}
					</div>
					<div class="paper-actions">
						<!-- eslint-disable svelte/no-navigation-without-resolve -- References are validated HTTP(S) URLs; PDF URLs are locally created blob URLs. -->
						{#if current.url}<a
								class="quiet-button source-link"
								href={current.url}
								target="_blank"
								rel="noopener noreferrer">{concepts ? 'Reference' : 'Original paper'} ↗</a
							>{/if}{#if pdfUrl}<a
								class="quiet-button source-link"
								href={pdfUrl}
								target="_blank"
								rel="noopener noreferrer">Open PDF ↗</a
							>{/if}<!-- eslint-enable svelte/no-navigation-without-resolve -->{#if canEdit}<button
								class="quiet-button"
								onclick={() => {
									pdfTarget = current?.id ?? null;
									pdfInput?.click();
								}}>{current.pdfId ? 'Replace PDF' : 'Attach PDF'}</button
							><button class="quiet-button" onclick={() => openMetadata(current)}
								>Edit details</button
							><button
								class="quiet-button delete-paper"
								onclick={() => {
									deleteTarget = current?.id ?? null;
									deleteDialog?.showModal();
								}}
								aria-label={`Remove this ${itemName}`}>Remove</button
							>{/if}
					</div>
				</div>
				<p class="document-intro">
					<strong
						>{concepts ? 'Explore. Connect. Understand.' : 'Read closely. Think clearly.'}</strong
					>
					{concepts ? 'Develop the idea in your own words.' : 'Put the paper into your own words.'}
				</p>
				{#if canEdit}<div class="toolbar" aria-label="Note editing tools">
						<div class="tools">
							<button
								class="symbol-tool"
								onclick={bold}
								aria-label="Insert bold text"
								title="Bold text (Ctrl+B)"><strong>B</strong></button
							><button
								class="code-tool"
								onclick={() => insertAt(target(), '\n\n```python\n# Your code here\n```\n\n')}
								aria-label="Insert a code block">&lt;/&gt;</button
							><span class="tool-divider" aria-hidden="true"></span><button onclick={showEquation}
								><span class="equation-symbol" aria-hidden="true">Σ</span> Equation</button
							><button
								onclick={() => {
									insertTarget = target();
									imageInput?.click();
								}}>▧ Image</button
							>
						</div>
						<div class="view-switch" role="group" aria-label="Editor view">
							{#each ['write', 'split', 'read'] as mode (mode)}<button
									class:active={view === mode}
									aria-pressed={view === mode}
									onclick={() => changeView(mode as 'write' | 'split' | 'read')}
									>{mode[0].toUpperCase() + mode.slice(1)}</button
								>{/each}
						</div>
					</div>{/if}
				{#key current.id}<div class="note-sections">
						{#each layout as section, index (section.key)}<section
								class="note-section"
								class:concept-note={concepts}
								aria-label={section.title}
							>
								{#if !concepts}<div class="section-heading">
										<span class="section-number">0{index + 1}</span>
										<h2>
											{#if canEdit}<label for={`note-${section.key}`}>{section.title}</label
												>{:else}{section.title}{/if}
										</h2>
									</div>
									<p class="section-prompt">{section.prompt}</p>{/if}{#if canEdit}<textarea
										id={`note-${section.key}`}
										class="note-input"
										data-slug={section.key}
										aria-label={section.title}
										value={current.notes[section.key] ?? ''}
										placeholder="Write your notes here…"
										spellcheck="false"
										onfocus={(event) => (lastEditor = event.currentTarget)}
										oninput={(event) => noteInput(event, section.key)}
										onkeydown={noteKey}
										onpaste={pasteImage}
										{@attach attachEditor}></textarea>{/if}
								<div class="note-render">
									{#if current.notes[section.key]}{@html preview(
											current.notes[section.key] ?? ''
										)}{:else}<p class="empty-note">
											{canEdit ? 'Your thinking goes here.' : 'No notes yet.'}
										</p>{/if}
								</div>
							</section>{/each}
					</div>{/key}
				{#if canEdit}<details class="writing-help">
						<summary>The writing desk <span aria-hidden="true">+</span></summary>
						<div class="writing-help-body">
							<p class="writing-hint">
								Write in Markdown. Add equations in LaTeX. See it take shape in Split view.
							</p>
							<div class="syntax-row"><span>Inline equation</span><code>$x_t = f(x_t)$</code></div>
							<div class="syntax-row">
								<span>Display equation</span><code>$$\mathcal&#123;L&#125; = …$$</code>
							</div>
							<div class="syntax-row"><span>Code block</span><code>```python … ```</code></div>
							<p class="writing-hint">
								Paste an image into a note, or use the Image button. Enter continues a list; Enter
								again leaves it.
							</p>
						</div>
					</details>{/if}
				<div class="page-end">
					<span>A little clearer than before.</span><span aria-hidden="true">⌑</span>
				</div>
			</main>
		</div>
	{/if}
	{#if canEdit}
		<input
			class="visually-hidden"
			tabindex="-1"
			aria-label="Choose an image"
			{@attach (node) => {
				imageInput = node;
				return () => {
					imageInput = undefined;
				};
			}}
			type="file"
			accept="image/png,image/jpeg,image/webp,image/gif"
			onchange={(event) => {
				void addImage(event.currentTarget.files?.[0], insertTarget);
				event.currentTarget.value = '';
			}}
		/>
		<input
			class="visually-hidden"
			tabindex="-1"
			aria-label="Choose a PDF"
			{@attach (node) => {
				pdfInput = node;
				return () => {
					pdfInput = undefined;
				};
			}}
			type="file"
			accept="application/pdf"
			onchange={(event) => {
				void attachPdf(event.currentTarget.files?.[0]);
				event.currentTarget.value = '';
			}}
		/>
		<input
			class="visually-hidden"
			tabindex="-1"
			aria-label="Choose a backup"
			{@attach (node) => {
				backupInput = node;
				return () => {
					backupInput = undefined;
				};
			}}
			type="file"
			accept="application/json,.json"
			onchange={(event) => {
				const file = event.currentTarget.files?.[0];
				if (file) void prepareImport(file);
				event.currentTarget.value = '';
			}}
		/>
		<dialog
			class="app-dialog"
			{@attach (node) => {
				metadataDialog = node;
				return () => {
					metadataDialog = undefined;
				};
			}}
			aria-labelledby="metadata-title"
		>
			<form onsubmit={saveMetadata}>
				<div class="dialog-kicker">YOUR NOTEBOOK</div>
				<h2 id="metadata-title">
					{editingExisting
						? editingConcept
							? 'Topic details'
							: 'Paper details'
						: editingConcept
							? 'Create a topic'
							: 'Add a paper'}
				</h2>
				<p>Make the ideas your own.</p>
				<label for="edit-title">{editingConcept ? 'Topic name' : 'Paper title'}</label><input
					id="edit-title"
					bind:value={formTitle}
					required
					maxlength="1000"
					placeholder={editingConcept ? 'e.g. Model predictive control' : 'Title of the paper'}
				/>{#if !editingConcept}<label for="edit-authors">Authors</label><input
						id="edit-authors"
						bind:value={formAuthors}
						maxlength="4000"
						placeholder="e.g. Author et al."
					/><label for="edit-year">Year</label><input
						id="edit-year"
						bind:value={formYear}
						inputmode="numeric"
						maxlength="4"
						pattern="[0-9]{4}"
						placeholder="2026"
					/>{/if}<label for="edit-tags">Tags</label><input
					id="edit-tags"
					bind:value={formTags}
					maxlength="2000"
					placeholder="Robotics, control"
				/><label for="edit-url">Reference link or DOI</label><input
					id="edit-url"
					bind:value={formUrl}
					maxlength="8192"
					placeholder="https://… or 10.…"
				/>
				<p class="field-hint">Separate tags with commas. You can attach a PDF from the editor.</p>
				{#if formError}<p class="form-error" role="alert">{formError}</p>{/if}
				<div class="dialog-actions">
					<button type="button" onclick={() => metadataDialog?.close()}>Cancel</button><button
						type="submit"
						class="primary"
						>{editingExisting
							? 'Save details'
							: editingConcept
								? 'Create topic'
								: 'Add paper'}</button
					>
				</div>
			</form>
		</dialog>
		<dialog
			class="app-dialog"
			{@attach (node) => {
				equationDialog = node;
				return () => {
					equationDialog = undefined;
				};
			}}
			aria-labelledby="equation-title"
		>
			<h2 id="equation-title">Write an equation</h2>
			<p>Use LaTeX here, or type $…$ inline and $$…$$ for display math directly in your notes.</p>
			<label for="equation-source">LaTeX</label><textarea
				id="equation-source"
				bind:value={equation}
				spellcheck="false"></textarea>
			<div class="equation-presets">
				{#each ['fraction', 'sum', 'matrix'] as preset (preset)}<button
						onclick={() =>
							(equation = templates[preset as 'fraction' | 'sum' | 'matrix'].replace(
								/^\s*\$\$\s*|\s*\$\$\s*$/g,
								''
							))}>{preset[0].toUpperCase() + preset.slice(1)}</button
					>{/each}
			</div>
			<div class="equation-preview" aria-live="polite">
				{@html mathReady ? renderMath(equation, true) : renderMarkdown(`$$${equation}$$`)}
			</div>
			<div class="dialog-actions">
				<button onclick={() => equationDialog?.close()}>Cancel</button><button
					class="primary"
					disabled={!equation.trim()}
					onclick={() => {
						void insertAt(insertTarget, `\n\n$$${equation.trim()}$$\n\n`);
						equationDialog?.close();
					}}>Insert equation</button
				>
			</div>
		</dialog>
		<dialog
			class="app-dialog"
			{@attach (node) => {
				deleteDialog = node;
				return () => {
					deleteDialog = undefined;
				};
			}}
			aria-labelledby="delete-title"
		>
			<h2 id="delete-title">Remove this {itemName}?</h2>
			<p>
				Its notes and attachments will be removed from this collection. You can undo this
				immediately after removing it.
			</p>
			<div class="dialog-actions">
				<button onclick={() => deleteDialog?.close()}>Keep it</button><button
					class="danger"
					onclick={removeEntry}>Remove</button
				>
			</div>
		</dialog>
		<dialog
			class="app-dialog"
			{@attach (node) => {
				importDialog = node;
				return () => {
					importDialog = undefined;
				};
			}}
			aria-labelledby="import-title"
		>
			<h2 id="import-title">Import your notes</h2>
			{#if importError}<p class="form-error" role="alert">{importError}</p>{/if}
			<p>
				Import {pendingImport?.papers.length ?? 0} papers and {pendingImport?.concepts.length ?? 0} topics,
				including notes and attachments.
			</p>
			<p class="field-hint">
				Your existing collection is kept. Changed versions are added as separate copies; exact
				duplicates are skipped.
			</p>
			<div class="dialog-actions">
				<button onclick={() => importDialog?.close()}>Cancel</button><button
					class="primary"
					onclick={confirmImport}>Import notes</button
				>
			</div>
		</dialog>
	{/if}
	{#if toast}<div class="toast" role="status">
			{toast}{#if undo}<button
					onclick={() => {
						undo?.();
						undo = null;
						toast = '';
					}}>Undo</button
				>{/if}
		</div>{/if}
</div>
