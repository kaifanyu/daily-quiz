export function formatDate(iso: string): string {
	try {
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	} catch {
		return iso;
	}
}

export function formatDateTime(iso: string): string {
	try {
		return new Date(iso).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	} catch {
		return iso;
	}
}

export function pct(n: number | null | undefined): string {
	if (n === null || n === undefined) return '—';
	return `${Math.round(n * 100)}%`;
}
