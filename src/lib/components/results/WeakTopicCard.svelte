<script lang="ts">
	import type { WeakTopic } from '$lib/types/quiz';

	let { topic }: { topic: WeakTopic } = $props();
</script>

<div class="rounded-xl border border-border bg-surface p-5 shadow-sm">
	<div class="flex items-center gap-2">
		<span class="flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-warning"></span>
		<h3 class="font-semibold text-foreground">{topic.topic}</h3>
	</div>
	<p class="mt-2 text-sm leading-relaxed text-muted">{topic.reason}</p>
	<div class="mt-3 rounded-lg bg-surface-2 p-3">
		<p class="text-xs font-semibold uppercase tracking-wide text-muted">Suggested review</p>
		<p class="mt-1 text-sm leading-relaxed text-foreground">{topic.suggested_review}</p>
	</div>
</div>
