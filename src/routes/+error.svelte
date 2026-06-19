<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
	<p class="text-7xl font-bold text-muted/40">{page.status}</p>
	<h1 class="mt-4 text-xl font-semibold text-foreground">
		{page.error?.message ?? 'Something went wrong'}
	</h1>
	<p class="mt-2 max-w-md text-sm text-muted">
		{#if page.status === 404}
			The page you're looking for doesn't exist.
		{:else}
			An unexpected error occurred. Try again or head back to the dashboard.
		{/if}
	</p>
	<div class="mt-6 flex gap-3">
		<Button href="/">Back to dashboard</Button>
		<Button href="/quiz/new" variant="secondary">New quiz</Button>
	</div>
</div>
