import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEnv, isSupabaseConfigured } from '$lib/server/env';
import { getDb } from '$lib/server/services';
import {
	getEvaluationForSubmission,
	getLatestSubmissionForQuiz,
	getQuiz
} from '$lib/server/supabase/repo';

export const load: PageServerLoad = async ({ params, platform }) => {
	if (!isSupabaseConfigured(getEnv(platform))) error(503, 'Supabase is not configured.');

	const db = getDb(platform);
	const quiz = await getQuiz(db, params.id);
	if (!quiz) error(404, 'Quiz not found.');

	const submission = await getLatestSubmissionForQuiz(db, params.id);
	if (!submission) redirect(303, `/quiz/${params.id}`);

	const evaluation = await getEvaluationForSubmission(db, submission.id);
	if (!evaluation) error(404, 'No evaluation found for this submission.');

	return { quiz, submission, evaluation };
};
