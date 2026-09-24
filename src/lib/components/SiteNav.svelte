<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	interface Access {
		canEdit: boolean;
		local: boolean;
	}
	let { access }: { access?: Access } = $props();
	let browserHash = $state<string | null>(null);
	const links = [
		{ href: '/', label: 'Papers', section: 'papers' },
		{ href: '/#/concepts', label: 'Concepts', section: 'concepts' },
		{ href: '/notes', label: 'Notes', section: 'notes' },
		{ href: '/daily-quiz', label: 'Daily Quiz', section: 'quiz' }
	] as const;
	let hash = $derived(browserHash ?? page.url.hash);
	let active = $derived(
		page.url.pathname === '/'
			? /^#\/(concepts|concept\/)/.test(hash)
				? 'concepts'
				: 'papers'
			: page.url.pathname === '/notes' || page.url.pathname.startsWith('/notes/')
				? 'notes'
				: ['/daily-quiz', '/quiz', '/history', '/sources', '/topics', '/prompts'].some(
							(path) => page.url.pathname === path || page.url.pathname.startsWith(`${path}/`)
					  )
					? 'quiz'
					: ''
	);
	function updateHash() {
		browserHash = window.location.hash;
	}
	afterNavigate(updateHash);
</script>

<svelte:window onhashchange={updateHash} />

<a
	class="skip-link"
	href="#site-content"
	onclick={(event) => {
		event.preventDefault();
		document.getElementById('site-content')?.focus();
	}}>Skip to content</a
>
<header class="site-header">
	<div class="header-inner">
		<a class="brand" href={resolve('/')} aria-label="Labbook home">
			<span class="brand-symbol" aria-hidden="true">
				<svg width="21" height="21" viewBox="0 0 18 18" fill="none">
					<path d="M4 3v12h10M8 3v8h6" stroke="currentColor" stroke-width="1.5" />
					<path d="M12 3v4h2" stroke="#88aaf8" stroke-width="1.5" />
				</svg>
			</span>
			<span class="brand-name">LABBOOK</span>
			<span class="brand-sub">A workspace for understanding.</span>
		</a>
		<nav class="site-links" aria-label="Main navigation">
			{#each links as link (link.section)}
				<a
					href={resolve(link.href)}
					class:active={active === link.section}
					aria-current={active === link.section ? 'page' : undefined}>{link.label}</a
				>
			{/each}
		</nav>
		<div class="owner-actions">
			{#if access?.canEdit && !access.local}
				<form method="POST" action={resolve('/logout')}>
					<button type="submit">Sign out</button>
				</form>
			{:else if access?.local}
				<span class="owner-label">Your notebook</span>
			{:else}
				<a href={resolve('/login')}>Owner sign in</a>
			{/if}
		</div>
	</div>
</header>

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: #fff;
		border-bottom: 1px solid #e2e7ee;
		color: #35465b;
	}
	.header-inner {
		max-width: 1480px;
		min-height: 72px;
		margin: 0 auto;
		padding: 0 32px;
		display: flex;
		align-items: center;
		gap: 28px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: #334b6a;
		text-decoration: none;
		white-space: nowrap;
	}
	.brand-symbol {
		display: inline-flex;
		color: #3267d4;
	}
	.brand-name {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 2px;
	}
	.brand-sub {
		margin-left: 9px;
		padding-left: 18px;
		border-left: 1px solid #dfe5ed;
		font-size: 11px;
		color: #8b96a5;
		font-weight: 400;
		letter-spacing: 0;
	}
	.site-links {
		display: flex;
		align-self: stretch;
		align-items: stretch;
		gap: 24px;
		margin-left: auto;
	}
	.site-links a {
		display: flex;
		align-items: center;
		padding: 2px 0 0;
		border-bottom: 2px solid transparent;
		font-size: 12px;
		color: #7d8999;
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}
	.site-links a:hover {
		color: #2862da;
	}
	.site-links a.active {
		color: #2862da;
		border-bottom-color: #2862da;
	}
	.owner-actions {
		margin-left: 5px;
		padding-left: 22px;
		border-left: 1px solid #e2e7ee;
		font-size: 11px;
		white-space: nowrap;
	}
	.owner-actions a,
	.owner-actions button {
		color: #6c7e93;
		text-decoration: none;
		background: transparent;
		border: 0;
		padding: 7px 0;
		cursor: pointer;
		font: inherit;
	}
	.owner-actions a:hover,
	.owner-actions button:hover {
		color: #2862da;
	}
	.owner-label {
		color: #94a0ae;
	}
	.skip-link {
		position: fixed;
		top: -60px;
		left: 16px;
		z-index: 100;
		padding: 10px 16px;
		border-radius: 4px;
		background: #2862da;
		color: white;
		font-size: 13px;
	}
	.skip-link:focus {
		top: 12px;
	}
	@media (max-width: 1120px) {
		.brand-sub {
			display: none;
		}
	}
	@media (max-width: 720px) {
		.header-inner {
			min-height: 0;
			padding: 0 20px;
			gap: 0;
			flex-wrap: wrap;
		}
		.brand {
			min-height: 58px;
		}
		.owner-actions {
			margin-left: auto;
			padding-left: 0;
			border-left: 0;
		}
		.site-links {
			order: 3;
			width: 100%;
			margin: 0;
			justify-content: space-between;
			gap: 16px;
		}
		.site-links a {
			justify-content: center;
			padding: 0 2px;
			min-height: 43px;
		}
	}
</style>
