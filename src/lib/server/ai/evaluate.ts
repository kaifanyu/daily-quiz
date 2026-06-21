import type {
	Evaluation,
	McqAnswers,
	McqResult,
	Quiz,
	ShortAnswerResult,
	ShortAnswers
} from '$lib/types/quiz';

/** Deterministically grade MCQs from the stored answer key — no AI needed. */
function gradeMcqs(quiz: Quiz, answers: McqAnswers): McqResult[] {
	return quiz.mcq_questions.map((q) => {
		const selected = answers[q.id] ?? null;
		return {
			question_id: q.id,
			selected_choice_id: selected,
			correct_choice_id: q.correct_choice_id,
			is_correct: selected === q.correct_choice_id,
			explanation: q.explanation,
			topic_tags: q.topic_tags
		};
	});
}

/**
 * Builds a submission's evaluation. Grading is fully deterministic: MCQs are
 * checked against the stored answer key, and short answers are echoed back so the
 * learner can compare them against each question's stored ideal answer in the UI.
 * No AI call is made.
 */
export function evaluateSubmission(
	quiz: Quiz,
	mcqAnswers: McqAnswers,
	shortAnswers: ShortAnswers
): Evaluation {
	const mcqResults = gradeMcqs(quiz, mcqAnswers);

	const short_answer_results: ShortAnswerResult[] = quiz.short_answer_questions.map((q) => ({
		question_id: q.id,
		user_answer: shortAnswers[q.id] ?? '',
		topic_tags: q.topic_tags
	}));

	return {
		quiz_id: quiz.id,
		mcq_results: mcqResults,
		short_answer_results,
		mcq_correct: mcqResults.filter((r) => r.is_correct).length,
		mcq_total: mcqResults.length
	};
}
