<script lang="ts">
	let { name, size = 20 }: { name: string; size?: number } = $props();
	const paths: Record<string, string> = {
		select: 'm5 3 15 10-7 1-3 7-5-18Z',
		hand: 'M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 4-2 7-6 7h-1c-2 0-4-1-5-3l-5-6a2 2 0 0 1 3-3l2 2Z',
		note: 'M14 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9l-7 7Z M14 21v-7h7',
		pin: 'M9 3h6l-1 7 4 4v2H6v-2l4-4-1-7Z M12 16v6',
		thread: 'M5 6C5 20 19 4 19 18 M5 3v5 M2.5 5.5h5 M19 15v6 M16.5 17.5h5',
		paper:
			'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z M14 2v6h6 M8 12h8 M8 16h8',
		image:
			'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M3 17l6-6 4 4 3-3 5 5 M8 7h.01',
		undo: 'M3 8h11a6 6 0 0 1 0 12 M3 8l5-5 M3 8l5 5',
		redo: 'M21 8H10a6 6 0 0 0 0 12 M21 8l-5-5 M21 8l-5 5',
		trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
		copy: 'M9 8h11v13H9V8Z M15 8V3H4v13h5',
		close: 'm6 6 12 12 M6 18 18 6',
		plus: 'M12 5v14 M5 12h14',
		minus: 'M5 12h14',
		fit: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M8 8h8v8H8Z',
		download: 'M12 3v12 m-4-4 4 4 4-4 M4 16v5h16v-5',
		upload: 'M12 16V4 m-4 4 4-4 4 4 M4 16v5h16v-5',
		link: 'm10 13 4-2 M9 16H7a4 4 0 0 1 0-8h3 M14 8h3a4 4 0 0 1 0 8h-3',
		external: 'M14 3h7v7 M21 3l-9 9 M10 3H4v17h17v-6',
		check: 'm5 12 4 4 10-10',
		help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4 M12 17h.01',
		edit: 'm15 4 5 5 M4 20l5-1L21 7l-5-5L4 14v6Z',
		resize: 'M8 20 20 8 M14 20l6-6',
		board: 'M3 4h18v15H3V4Z M8 19v3 M16 19v3 M7 8h5v5H7Z M16 8h1 M16 12h1'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={paths[name] ?? paths.note} /></svg
>
