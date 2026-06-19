import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getAiServices } from '$lib/server/services';
import { generateQuiz } from '$lib/server/ai/generate';
import { saveQuiz } from '$lib/server/supabase/repo';
import { DEFAULT_TOPICS } from '$lib/topics';

const bodySchema = z.object({
	topics: z.array(z.string().min(1)).min(1).max(40).optional(),
	difficulty: z.enum(['advanced', 'expert', 'mixed']).optional()
});

export const POST: RequestHandler = async ({ request, platform }) => {
	const raw = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(raw ?? {});
	if (!parsed.success) error(400, 'Invalid request body.');

	const topics = parsed.data.topics?.length ? parsed.data.topics : [...DEFAULT_TOPICS];
	const difficulty = parsed.data.difficulty ?? 'expert';

	try {
		const { db, client, model } = getAiServices(platform);
		const { quiz, sourceContextSummary } = await generateQuiz(
			{ client, model, db },
			{ topics, difficulty }
		);
		const saved = await saveQuiz(db, quiz, sourceContextSummary);
		return json({ id: saved.id });
	} catch (e) {
		console.error('[quiz/generate] failed:', e);
		error(500, e instanceof Error ? e.message : 'Quiz generation failed.');
	}
};
