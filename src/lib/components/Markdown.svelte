<script lang="ts">
	import { marked } from 'marked';

	let { content, class: klass = '' }: { content: string; class?: string } = $props();

	// Content is produced by the user's own AI key in a single-user, no-auth app,
	// so we render it directly. (Add a sanitizer here if this ever becomes multi-user.)
	let html = $derived(marked.parse(content ?? '', { gfm: true, breaks: false }) as string);
</script>

<div class="prose-quiz {klass}">{@html html}</div>
