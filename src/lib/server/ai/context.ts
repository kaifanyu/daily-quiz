import type { SourceMaterial } from '$lib/types/quiz';

const PER_SOURCE_CHAR_BUDGET = 1500;
const TOTAL_CHAR_BUDGET = 9000;

/**
 * Builds a bounded text block from the user's source materials to inject into
 * generation prompts. Prefers stored summaries; falls back to truncated
 * extracted text. This is intentionally simple (no embeddings) — practical
 * usefulness over perfect retrieval, per the project goals.
 */
export function buildSourceContext(sources: SourceMaterial[]): {
	contextText: string;
	contextSummary: string | null;
} {
	if (sources.length === 0) return { contextText: '', contextSummary: null };

	const blocks: string[] = [];
	let used = 0;

	for (const s of sources) {
		if (used >= TOTAL_CHAR_BUDGET) break;
		const tags = s.topic_tags?.length ? ` [tags: ${s.topic_tags.join(', ')}]` : '';
		let body = (s.summary && s.summary.trim()) || (s.extracted_text && s.extracted_text.trim()) || '';
		if (!body) continue;
		if (body.length > PER_SOURCE_CHAR_BUDGET) {
			body = body.slice(0, PER_SOURCE_CHAR_BUDGET) + '… [truncated]';
		}
		const block = `### ${s.title}${tags}\n${body}`;
		if (used + block.length > TOTAL_CHAR_BUDGET) {
			blocks.push(block.slice(0, TOTAL_CHAR_BUDGET - used) + '… [truncated]');
			break;
		}
		blocks.push(block);
		used += block.length;
	}

	if (blocks.length === 0) return { contextText: '', contextSummary: null };

	const contextText = blocks.join('\n\n');
	const titles = sources
		.slice(0, 8)
		.map((s) => s.title)
		.join(', ');
	return {
		contextText,
		contextSummary: `Grounded in ${sources.length} source(s): ${titles}`
	};
}
