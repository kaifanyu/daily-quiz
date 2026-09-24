<script lang="ts">
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import NoteEditor from '$lib/components/notes/NoteEditor.svelte';
	import BlogReader from '$lib/components/notes/BlogReader.svelte';
	let { data }: { data: PageData } = $props();
	const editing = $derived(
		data.notebookAccess.canEdit && page.url.searchParams.get('edit') === '1'
	);
</script>

{#key `${data.note.id}:${editing}`}
	{#if editing}<NoteEditor note={data.note} />{:else}<BlogReader
			note={data.note}
			canEdit={data.notebookAccess.canEdit}
		/>{/if}
{/key}
