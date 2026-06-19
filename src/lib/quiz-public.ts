import type { ChoiceId, Difficulty, MCQChoice, Quiz } from '$lib/types/quiz';

/**
 * Answer-free view of a quiz that is safe to send to the browser BEFORE
 * submission. The correct choice, explanations, ideal answers, rubric, and the
 * reading section are all withheld until the learner submits.
 */
export interface PublicMCQQuestion {
	id: string;
	question: string;
	choices: MCQChoice[];
	topic_tags: string[];
}

export interface PublicShortAnswerQuestion {
	id: string;
	question: string;
	topic_tags: string[];
	is_coding_question: boolean;
}

export interface PublicQuiz {
	id: string;
	created_at: string;
	title: string;
	topics: string[];
	difficulty: Difficulty;
	mcq_questions: PublicMCQQuestion[];
	short_answer_questions: PublicShortAnswerQuestion[];
}

export function toPublicQuiz(quiz: Quiz): PublicQuiz {
	return {
		id: quiz.id,
		created_at: quiz.created_at,
		title: quiz.title,
		topics: quiz.topics,
		difficulty: quiz.difficulty,
		mcq_questions: quiz.mcq_questions.map((q) => ({
			id: q.id,
			question: q.question,
			choices: q.choices,
			topic_tags: q.topic_tags
		})),
		short_answer_questions: quiz.short_answer_questions.map((q) => ({
			id: q.id,
			question: q.question,
			topic_tags: q.topic_tags,
			is_coding_question: q.is_coding_question ?? false
		}))
	};
}

export type { ChoiceId };
