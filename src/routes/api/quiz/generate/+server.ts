import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getAiServices } from '$lib/server/services';
import { generateQuiz } from '$lib/server/ai/generate';
import { listCategoriesWithTopics, saveQuiz } from '$lib/server/supabase/repo';
import { DEFAULT_SAMPLE_COUNT, sampleTopics } from '$lib/server/ai/sample-topics';

const bodySchema = z.object({
	difficulty: z.enum(['advanced', 'expert', 'mixed']).optional(),
	count: z.number().int().min(1).max(20).optional()
});

export const POST: RequestHandler = async ({ request, platform }) => {
	const raw = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(raw ?? {});
	if (!parsed.success) error(400, 'Invalid request body.');

	const difficulty = parsed.data.difficulty ?? 'expert';

	try {
		const { db, client, model } = getAiServices(platform);

		// Topics are drawn from the weighted topic bank (managed on the /topics page).
		const bank = await listCategoriesWithTopics(db, { enabledOnly: true });
		const selected = sampleTopics(bank, parsed.data.count ?? DEFAULT_SAMPLE_COUNT);
		if (selected.length === 0) {
			return json(
				{
					message: 'Your topic bank is empty. Add categories and topics on the Topics page first.'
				},
				{ status: 400 }
			);
		}

		const { quiz, sourceContextSummary } = await generateQuiz(
			{ client, model, db },
			{ topics: selected.map((t) => t.name), difficulty, topicDetails: selected }
		);
		const saved = await saveQuiz(db, quiz, sourceContextSummary);
		return json({ id: saved.id });
	} catch (e) {
		console.error('[quiz/generate] failed:', e);
		error(500, e instanceof Error ? e.message : 'Quiz generation failed.');
	}
};
