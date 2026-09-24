<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Editor } from '@tiptap/core';
	import type { Note } from '$lib/types/quiz';
	import { formatDateTime } from '$lib/format';
	let { note, canEdit = false }: { note: Note; canEdit?: boolean } = $props();
	let ready = $state(false),
		failed = $state(false);
	function mountReader(element: HTMLDivElement) {
		const content = note.content;
		let editor: Editor | undefined,
			destroyed = false;
		ready = false;
		failed = false;
		void Promise.all([
			import('@tiptap/core'),
			import('@tiptap/starter-kit'),
			import('@tiptap/extension-task-list'),
			import('@tiptap/extension-task-item'),
			import('@tiptap/extension-text-align'),
			import('./reading-extensions')
		])
			.then(([core, starter, tasks, task, align, safe]) => {
				if (destroyed) return;
				editor = new core.Editor({
					element,
					content: content || '',
					editable: false,
					extensions: [
						starter.default.configure({ link: false }),
						safe.ReadingLink,
						safe.ReadingImage,
						tasks.default,
						task.default.configure({ nested: true }),
						align.default.configure({ types: ['heading', 'paragraph'] })
					],
					editorProps: {
						attributes: { class: 'prose-quiz blog-prose', 'aria-label': 'Blog post content' }
					}
				});
				ready = true;
			})
			.catch(() => {
				if (!destroyed) failed = true;
			});
		return () => {
			destroyed = true;
			editor?.destroy();
		};
	}
</script>

<svelte:head><title>{note.title || 'Untitled post'} — Blogs</title></svelte:head>
<div class="flex h-full flex-col">
	<div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
		<a href={resolve('/blogs')} class="text-sm text-muted transition hover:text-foreground"
			>← All posts</a
		>
		{#if canEdit}<form method="GET" action={resolve('/blogs/[id]', { id: note.id })}>
				<button
					type="submit"
					name="edit"
					value="1"
					class="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-2"
					>Edit post</button
				>
			</form>{/if}
	</div>
	<article class="min-h-0 flex-1 overflow-y-auto">
		<div class="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
			<div class="text-xs font-medium tracking-wider text-primary uppercase">
				{note.category || 'General'}
			</div>
			<h1 class="mt-3 text-3xl leading-tight font-bold tracking-tight text-foreground">
				{note.title || 'Untitled post'}
			</h1>
			<p class="mt-3 text-xs text-muted">Updated {formatDateTime(note.updated_at)}</p>
			<div class="my-7 border-t border-border"></div>
			{#if failed}<p class="text-sm text-muted" role="status">
					This post could not be displayed. Please reload and try again.
				</p>
			{:else if !ready}<p class="text-sm text-muted" role="status">Opening post…</p>{/if}
			<div class="reader" {@attach mountReader}></div>
			{#if ready && !note.content}<p class="text-sm text-muted">
					This post is still taking shape.
				</p>{/if}
		</div>
	</article>
</div>

<style>
	.reader :global(.ProseMirror) {
		outline: none;
	}
	.reader :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
		display: block;
	}
	.reader :global(img[data-align='center']) {
		margin-inline: auto;
	}
	.reader :global(img[data-align='left']) {
		margin-right: auto;
	}
	.reader :global(img[data-align='right']) {
		margin-left: auto;
	}
	.reader :global(ul[data-type='taskList']) {
		list-style: none;
		padding-left: 0.25rem;
	}
	.reader :global(ul[data-type='taskList'] li) {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}
	.reader :global(ul[data-type='taskList'] li > label) {
		margin-top: 0.3rem;
		pointer-events: none;
	}
	.reader :global(ul[data-type='taskList'] li > div) {
		flex: 1 1 auto;
	}
	.reader :global(pre) {
		overflow-x: auto;
	}
</style>
