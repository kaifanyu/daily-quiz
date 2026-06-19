<script lang="ts">
	import type { PageData } from './$types';
	import NoteEditor from '$lib/components/notes/NoteEditor.svelte';

	let { data }: { data: PageData } = $props();
</script>

<!-- Remount the editor per note so TipTap initializes cleanly on navigation. -->
{#key data.note.id}
	<NoteEditor note={data.note} />
{/key}
