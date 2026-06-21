import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import type { SelectedTopic } from '$lib/types/quiz';
import { getAiServices } from '$lib/server/services';
import { generateQuiz } from '$lib/server/ai/generate';
import { listCategoriesWithTopics, saveQuiz } from '$lib/server/supabase/repo';
import { DEFAULT_SAMPLE_COUNT, sampleTopics } from '$lib/server/ai/sample-topics';
import { DEFAULT_TOPICS } from '$lib/topics';

const bodySchema = z.object({
	// Manual topic selection.
	topics: z.array(z.string().min(1)).min(1).max(40).optional(),
	difficulty: z.enum(['advanced', 'expert', 'mixed']).optional(),
	// Weighted draw from the topic bank.
	source: z.enum(['manual', 'bank']).optional(),
	count: z.number().int().min(1).max(20).optional()
});

export const POST: RequestHandler = async ({ request, platform }) => {
	const raw = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(raw ?? {});
	if (!parsed.success) error(400, 'Invalid request body.');

	const difficulty = parsed.data.difficulty ?? 'expert';
	// Bank mode is requested explicitly, or implied when no manual topics are given.
	const wantsBank =
		parsed.data.source === 'bank' ||
		(parsed.data.source !== 'manual' && !parsed.data.topics?.length);

	try {
		const { db, client, model } = getAiServices(platform);

		let topics: string[] | undefined;
		let topicDetails: SelectedTopic[] | undefined;

		if (wantsBank) {
			const bank = await listCategoriesWithTopics(db, { enabledOnly: true });
			const selected = sampleTopics(bank, parsed.data.count ?? DEFAULT_SAMPLE_COUNT);
			if (selected.length > 0) {
				topicDetails = selected;
				topics = selected.map((t) => t.name);
			}
		}

		// Fall back to manual topics (or the built-in defaults) if the bank is empty.
		if (!topics) {
			topics = parsed.data.topics?.length ? parsed.data.topics : [...DEFAULT_TOPICS];
		}

		const { quiz, sourceContextSummary } = await generateQuiz(
			{ client, model, db },
			{ topics, difficulty, topicDetails }
		);
		const saved = await saveQuiz(db, quiz, sourceContextSummary);
		return json({ id: saved.id });
	} catch (e) {
		console.error('[quiz/generate] failed:', e);
		error(500, e instanceof Error ? e.message : 'Quiz generation failed.');
	}
};
