<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Editor } from '@tiptap/core';
	import type { ImageAlign } from '$lib/components/notes/resizable-image';
	import type { Note } from '$lib/types/quiz';
	import { getNotesStore } from '$lib/notesStore.svelte';

	let { note }: { note: Note } = $props();

	const store = getNotesStore();

	let element = $state<HTMLDivElement | null>(null);
	let imgInput = $state<HTMLInputElement | null>(null);
	let editor: Editor | null = null; // intentionally non-reactive (ProseMirror owns it)

	// Editable copies seeded once from the prop (the page re-keys this component
	// per note id, so it remounts on navigation — no need to track `note`).
	let editorReady = $state(false);
	let title = $state(untrack(() => note.title));
	let category = $state(untrack(() => note.category));
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let pinned = $state(untrack(() => note.pinned));
	let uploading = $state(false);
	let active = $state<Record<string, boolean>>({});

	// --- Autosave (debounced) ---------------------------------------------------
	type Patch = Partial<Pick<Note, 'title' | 'category' | 'content' | 'pinned'>>;
	let pending: Patch = {};
	let timer: ReturnType<typeof setTimeout> | null = null;

	function scheduleSave(patch: Patch) {
		pending = { ...pending, ...patch };
		saveState = 'saving';
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => flush(), 700);
	}

	async function flush(keepalive = false) {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		const body = pending;
		if (Object.keys(body).length === 0) return;
		pending = {};
		try {
			const res = await fetch(`/api/notes/${note.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
				keepalive
			});
			if (!res.ok) throw new Error(String(res.status));
			saveState = 'saved';
			store.patch(note.id, {
				...('title' in body ? { title: body.title } : {}),
				...('category' in body ? { category: body.category } : {}),
				...('pinned' in body ? { pinned: body.pinned } : {}),
				updated_at: new Date().toISOString()
			});
		} catch {
			saveState = 'error';
			pending = { ...body, ...pending }; // re-queue so edits aren't lost
		}
	}

	// --- Images -----------------------------------------------------------------
	async function uploadAndInsert(file: File) {
		if (!file.type.startsWith('image/')) return;
		uploading = true;
		try {
			const fd = new FormData();
			fd.append('image', file);
			const res = await fetch(`/api/notes/${note.id}/images`, { method: 'POST', body: fd });
			if (!res.ok) throw new Error();
			const img = (await res.json()) as { url: string; name: string };
			editor?.chain().focus().setImage({ src: img.url, alt: img.name }).run();
		} catch {
			saveState = 'error';
		} finally {
			uploading = false;
		}
	}

	async function onPickImage() {
		const file = imgInput?.files?.[0];
		if (file) await uploadAndInsert(file);
		if (imgInput) imgInput.value = '';
	}

	// --- Toolbar ----------------------------------------------------------------
	/** Current alignment of the selection — image `align` attr or text-align. */
	function currentAlign(): 'left' | 'center' | 'right' {
		if (!editor) return 'left';
		if (editor.isActive('image')) return (editor.getAttributes('image').align as ImageAlign) ?? 'center';
		if (editor.isActive({ textAlign: 'center' })) return 'center';
		if (editor.isActive({ textAlign: 'right' })) return 'right';
		return 'left';
	}

	function updateToolbar() {
		if (!editor) return;
		const align = currentAlign();
		active = {
			bold: editor.isActive('bold'),
			italic: editor.isActive('italic'),
			underline: editor.isActive('underline'),
			strike: editor.isActive('strike'),
			h1: editor.isActive('heading', { level: 1 }),
			h2: editor.isActive('heading', { level: 2 }),
			h3: editor.isActive('heading', { level: 3 }),
			bullet: editor.isActive('bulletList'),
			ordered: editor.isActive('orderedList'),
			task: editor.isActive('taskList'),
			quote: editor.isActive('blockquote'),
			code: editor.isActive('codeBlock'),
			link: editor.isActive('link'),
			alignLeft: align === 'left',
			alignCenter: align === 'center',
			alignRight: align === 'right'
		};
	}

	/** Align text (paragraphs/headings) or, when an image is selected, the image. */
	function setAlign(a: ImageAlign) {
		if (!editor) return;
		if (editor.isActive('image')) editor.chain().focus().updateAttributes('image', { align: a }).run();
		else editor.chain().focus().setTextAlign(a).run();
		updateToolbar();
	}

	const btnCls = (a: boolean) =>
		`flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm font-medium transition hover:bg-surface-2 ${a ? 'bg-surface-2 text-foreground' : 'text-muted'}`;

	function setLink() {
		if (!editor) return;
		const prev = editor.getAttributes('link').href as string | undefined;
		const url = window.prompt('Link URL', prev ?? 'https://');
		if (url === null) return;
		if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
		else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
		updateToolbar();
	}

	// --- Header actions ---------------------------------------------------------
	function togglePin() {
		pinned = !pinned;
		scheduleSave({ pinned });
	}

	async function deleteNote() {
		if (!window.confirm('Delete this note? This also removes its images.')) return;
		if (timer) clearTimeout(timer);
		pending = {};
		await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
		store.remove(note.id);
		await goto('/notes');
	}

	// --- Lifecycle --------------------------------------------------------------
	onMount(() => {
		let destroyed = false;
		(async () => {
			const [
				{ Editor: EditorClass },
				StarterKit,
				{ ResizableImage },
				Placeholder,
				TaskList,
				TaskItem,
				TextAlign
			] = await Promise.all([
				import('@tiptap/core'),
				import('@tiptap/starter-kit').then((m) => m.default),
				import('$lib/components/notes/resizable-image'),
				import('@tiptap/extension-placeholder').then((m) => m.default),
				import('@tiptap/extension-task-list').then((m) => m.default),
				import('@tiptap/extension-task-item').then((m) => m.default),
				import('@tiptap/extension-text-align').then((m) => m.default)
			]);
			await tick();
			if (destroyed || !element) return;

			editor = new EditorClass({
				element,
				content: note.content || '',
				extensions: [
					StarterKit.configure({ link: { openOnClick: false } }),
					ResizableImage.configure({ inline: false }),
					Placeholder.configure({ placeholder: 'Start writing…' }),
					TaskList,
					TaskItem.configure({ nested: true }),
					TextAlign.configure({ types: ['heading', 'paragraph'] })
				],
				editorProps: {
					attributes: { class: 'prose-quiz focus:outline-none', spellcheck: 'true' },
					handlePaste: (_view, event) => {
						const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
							f.type.startsWith('image/')
						);
						if (files.length === 0) return false;
						event.preventDefault();
						files.forEach((f) => uploadAndInsert(f));
						return true;
					},
					handleDrop: (_view, event) => {
						const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((f) =>
							f.type.startsWith('image/')
						);
						if (files.length === 0) return false;
						event.preventDefault();
						files.forEach((f) => uploadAndInsert(f));
						return true;
					}
				},
				onUpdate: ({ editor }) => {
					scheduleSave({ content: editor.getHTML() });
					updateToolbar();
				},
				onSelectionUpdate: updateToolbar
			});
			editorReady = true;
			updateToolbar();
		})();

		return () => {
			destroyed = true;
			flush(true);
			if (timer) clearTimeout(timer);
			editor?.destroy();
			editor = null;
		};
	});
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
		<div class="flex min-w-0 items-center gap-2">
			<a
				href="/notes"
				class="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground lg:hidden"
				aria-label="Back to notes"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="m15 18-6-6 6-6" />
				</svg>
			</a>
			<span class="flex items-center gap-1.5 text-xs text-muted">
				{#if saveState === 'saving' || uploading}
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-warning"></span>
					{uploading ? 'Uploading…' : 'Saving…'}
				{:else if saveState === 'saved'}
					<span class="h-1.5 w-1.5 rounded-full bg-success"></span> Saved
				{:else if saveState === 'error'}
					<span class="h-1.5 w-1.5 rounded-full bg-danger"></span> Save failed
				{/if}
			</span>
		</div>
		<div class="flex items-center gap-0.5">
			<button
				type="button"
				onclick={togglePin}
				class="rounded-lg p-2 transition hover:bg-surface-2 {pinned
					? 'text-primary'
					: 'text-muted hover:text-foreground'}"
				aria-label={pinned ? 'Unpin note' : 'Pin note'}
				title={pinned ? 'Unpin' : 'Pin'}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M16 3v2l-1 1v5l3 3v2h-5v5l-1 1-1-1v-5H5v-2l3-3V6L7 5V3z" />
				</svg>
			</button>
			<button
				type="button"
				onclick={deleteNote}
				class="rounded-lg p-2 text-muted transition hover:bg-danger-soft hover:text-danger"
				aria-label="Delete note"
				title="Delete"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Document -->
	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-3xl px-5 py-6 sm:px-8">
			<input
				type="text"
				bind:value={title}
				oninput={() => scheduleSave({ title })}
				placeholder="Untitled"
				class="w-full bg-transparent text-3xl font-bold tracking-tight text-foreground placeholder:text-muted/50 focus-visible:outline-none"
			/>
			<div class="mt-2 flex items-center gap-2 text-sm">
				<span class="text-muted">Category</span>
				<input
					type="text"
					bind:value={category}
					oninput={() => scheduleSave({ category })}
					placeholder="General"
					class="rounded-md border border-transparent bg-surface-2 px-2 py-0.5 text-sm font-medium text-foreground transition hover:border-border focus-visible:border-primary focus-visible:outline-none"
				/>
			</div>

			<!-- Toolbar -->
			<div class="sticky top-0 z-10 -mx-1 mt-5 mb-3 flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface/95 p-1 backdrop-blur">
				<button type="button" class={btnCls(active.bold)} title="Bold" aria-label="Bold" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleBold().run()}><span class="font-bold">B</span></button>
				<button type="button" class={btnCls(active.italic)} title="Italic" aria-label="Italic" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleItalic().run()}><span class="italic">I</span></button>
				<button type="button" class={btnCls(active.underline)} title="Underline" aria-label="Underline" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleUnderline().run()}><span class="underline">U</span></button>
				<button type="button" class={btnCls(active.strike)} title="Strikethrough" aria-label="Strikethrough" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleStrike().run()}><span class="line-through">S</span></button>
				<span class="mx-1 h-5 w-px bg-border"></span>
				<button type="button" class={btnCls(active.h1)} title="Heading 1" aria-label="Heading 1" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
				<button type="button" class={btnCls(active.h2)} title="Heading 2" aria-label="Heading 2" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
				<button type="button" class={btnCls(active.h3)} title="Heading 3" aria-label="Heading 3" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
				<span class="mx-1 h-5 w-px bg-border"></span>
				<button type="button" class={btnCls(active.bullet)} title="Bullet list" aria-label="Bullet list" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleBulletList().run()}>•</button>
				<button type="button" class={btnCls(active.ordered)} title="Numbered list" aria-label="Numbered list" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</button>
				<button type="button" class={btnCls(active.task)} title="Checklist" aria-label="Checklist" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleTaskList().run()}>☑</button>
				<button type="button" class={btnCls(active.quote)} title="Quote" aria-label="Quote" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleBlockquote().run()}>❝</button>
				<button type="button" class={btnCls(active.code)} title="Code block" aria-label="Code block" disabled={!editorReady} onclick={() => editor?.chain().focus().toggleCodeBlock().run()}>&lt;/&gt;</button>
				<span class="mx-1 h-5 w-px bg-border"></span>
				<button type="button" class={btnCls(active.link)} title="Link" aria-label="Link" disabled={!editorReady} onclick={setLink}>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
				</button>
				<button type="button" class={btnCls(false)} title="Insert image" aria-label="Insert image" disabled={!editorReady} onclick={() => imgInput?.click()}>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
				</button>
				<span class="mx-1 h-5 w-px bg-border"></span>
				<button type="button" class={btnCls(active.alignLeft)} title="Align left" aria-label="Align left" disabled={!editorReady} onclick={() => setAlign('left')}>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h12M3 18h15" /></svg>
				</button>
				<button type="button" class={btnCls(active.alignCenter)} title="Align center" aria-label="Align center" disabled={!editorReady} onclick={() => setAlign('center')}>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M6 12h12M5 18h14" /></svg>
				</button>
				<button type="button" class={btnCls(active.alignRight)} title="Align right" aria-label="Align right" disabled={!editorReady} onclick={() => setAlign('right')}>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 12h12M6 18h15" /></svg>
				</button>
			</div>

			<!-- ProseMirror mounts here -->
			<div class="editor min-h-[50vh]" bind:this={element}></div>
			<input type="file" accept="image/*" class="hidden" bind:this={imgInput} onchange={onPickImage} />
		</div>
	</div>
</div>

<style>
	.editor :global(.ProseMirror) {
		min-height: 50vh;
		outline: none;
	}
	.editor :global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		color: var(--muted);
		float: left;
		height: 0;
		pointer-events: none;
	}
	.editor :global(.ProseMirror img) {
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
	}
	/* Resizable image node view */
	.editor :global(.ri-wrap) {
		margin: 0.75rem 0;
	}
	.editor :global(.ri-container) {
		position: relative;
		display: inline-block;
		max-width: 100%;
		line-height: 0;
	}
	.editor :global(.ri-container img) {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 0.5rem;
	}
	.editor :global(.ri-container:hover),
	.editor :global(.ri-wrap.ProseMirror-selectednode .ri-container) {
		outline: 2px solid color-mix(in srgb, var(--primary) 55%, transparent);
		outline-offset: 2px;
	}
	.editor :global(.ri-handle) {
		position: absolute;
		right: -6px;
		bottom: -6px;
		height: 14px;
		width: 14px;
		border-radius: 9999px;
		border: 2px solid var(--surface);
		background: var(--primary);
		cursor: nwse-resize;
		opacity: 0;
		transition: opacity 120ms;
	}
	.editor :global(.ri-container:hover .ri-handle),
	.editor :global(.ri-wrap.ProseMirror-selectednode .ri-handle) {
		opacity: 1;
	}
	.editor :global(ul[data-type='taskList']) {
		list-style: none;
		padding-left: 0.25rem;
	}
	.editor :global(ul[data-type='taskList'] li) {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}
	.editor :global(ul[data-type='taskList'] li > label) {
		margin-top: 0.3rem;
	}
	.editor :global(ul[data-type='taskList'] li > div) {
		flex: 1 1 auto;
	}
</style>
