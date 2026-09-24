<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ThemeToggle from './ThemeToggle.svelte';

	const links = [
		{ href: '/daily-quiz', label: 'Dashboard' },
		{ href: '/history', label: 'History' },
		{ href: '/sources', label: 'Sources' },
		{ href: '/topics', label: 'Topics' },
		{ href: '/prompts', label: 'Prompts' }
	] as const;
	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<div class="quiz-toolbar">
	<div class="toolbar-inner">
		<span class="toolbar-label">QUIZ TOOLS</span>
		<nav class="quiz-links" aria-label="Daily Quiz navigation">
			{#each links as link (link.href)}
				<a
					href={resolve(link.href)}
					class:active={isActive(link.href)}
					aria-current={isActive(link.href) ? 'page' : undefined}>{link.label}</a
				>
			{/each}
		</nav>
		<div class="quiz-actions">
			<a class="new-quiz" href={resolve('/quiz/new')}>New quiz <span aria-hidden="true">+</span></a>
			<ThemeToggle />
		</div>
	</div>
</div>

<style>
	.quiz-toolbar {
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}
	.toolbar-inner {
		display: flex;
		align-items: center;
		gap: 22px;
		max-width: 1152px;
		min-height: 62px;
		padding: 10px 24px;
		margin: 0 auto;
	}
	.toolbar-label {
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 1.5px;
		white-space: nowrap;
		color: var(--muted);
	}
	.quiz-links {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	.quiz-links a {
		padding: 7px 10px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 500;
		color: var(--muted);
		text-decoration: none;
		white-space: nowrap;
	}
	.quiz-links a:hover {
		color: var(--primary);
		background: var(--surface-2);
	}
	.quiz-links a.active {
		color: var(--primary);
		background: var(--surface-2);
	}
	.quiz-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-left: auto;
	}
	.new-quiz {
		display: flex;
		gap: 14px;
		align-items: center;
		white-space: nowrap;
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--primary);
		text-decoration: none;
		font-size: 11px;
		font-weight: 600;
	}
	.new-quiz:hover {
		border-color: var(--primary);
	}
	.new-quiz span {
		font-size: 16px;
		line-height: 1;
		font-weight: 400;
	}
	@media (max-width: 720px) {
		.toolbar-inner {
			flex-wrap: wrap;
			padding: 12px 16px 8px;
			gap: 10px;
		}
		.quiz-links {
			order: 3;
			width: 100%;
			overflow-x: auto;
			padding-bottom: 2px;
		}
		.quiz-links a {
			padding: 8px 10px;
		}
	}
</style>
