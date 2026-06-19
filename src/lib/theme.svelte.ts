export type Theme = 'light' | 'dark';

let current = $state<Theme>('light');

function apply(t: Theme) {
	current = t;
	if (typeof document !== 'undefined') {
		document.documentElement.classList.toggle('dark', t === 'dark');
		try {
			localStorage.setItem('theme', t);
		} catch {
			/* storage may be unavailable; ignore */
		}
	}
}

export const theme = {
	get value(): Theme {
		return current;
	},
	/** Sync runtime state with the class the no-FOUC head script already applied. */
	init() {
		if (typeof document === 'undefined') return;
		current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
	},
	set(t: Theme) {
		apply(t);
	},
	toggle() {
		apply(current === 'dark' ? 'light' : 'dark');
	}
};
