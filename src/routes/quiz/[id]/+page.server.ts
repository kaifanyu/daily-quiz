import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv, isSupabaseConfigured } from '$lib/server/env';
import { getDb } from '$lib/server/services';
import { getLatestSubmissionForQuiz, getQuiz } from '$lib/server/supabase/repo';
import { toPublicQuiz } from '$lib/quiz-public';

export const load: PageServerLoad = async ({ params, platform }) => {
	if (!isSupabaseConfigured(getEnv(platform))) error(503, 'Supabase is not configured.');

	const db = getDb(platform);
	const quiz = await getQuiz(db, params.id);
	if (!quiz) error(404, 'Quiz not found.');

	// One submission per quiz: if it's already done, send the learner to results.
	const submission = await getLatestSubmissionForQuiz(db, params.id);
	if (submission) redirect(303, `/quiz/${params.id}/results`);

	// Strip the answer key before it ever reaches the browser.
	return { quiz: toPublicQuiz(quiz) };
};
