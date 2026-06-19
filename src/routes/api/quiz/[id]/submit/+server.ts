import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getAiServices } from '$lib/server/services';
import { evaluateSubmission } from '$lib/server/ai/evaluate';
import {
	getQuiz,
	saveEvaluation,
	saveSubmission,
	saveWeakTopics
} from '$lib/server/supabase/repo';

const bodySchema = z.object({
	mcq_answers: z.record(z.string(), z.union([z.enum(['A', 'B', 'C', 'D']), z.null()])).default({}),
	short_answers: z.record(z.string(), z.string()).default({})
});

export const POST: RequestHandler = async ({ request, params, platform }) => {
	const raw = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(raw ?? {});
	if (!parsed.success) error(400, 'Invalid submission body.');

	const quizId = params.id;

	try {
		const services = getAiServices(platform);
		const { db, client, model } = services;

		const quiz = await getQuiz(db, quizId);
		if (!quiz) error(404, 'Quiz not found.');

		const { mcq_answers, short_answers } = parsed.data;
		const submission = await saveSubmission(db, quizId, mcq_answers, short_answers);
		const evaluation = await evaluateSubmission(
			{ client, model, db },
			quiz,
			mcq_answers,
			short_answers
		);
		await saveEvaluation(db, quizId, submission.id, evaluation);
		await saveWeakTopics(db, evaluation.weak_topics, quizId, submission.id);

		return json({ submission_id: submission.id });
	} catch (e) {
		// Re-throw SvelteKit HttpErrors (e.g. the 404 above) untouched.
		if (e && typeof e === 'object' && 'status' in e && 'body' in e) throw e;
		console.error('[quiz/submit] failed:', e);
		error(500, e instanceof Error ? e.message : 'Evaluation failed.');
	}
};
