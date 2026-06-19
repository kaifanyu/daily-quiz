/**
 * Shared domain types for the daily quiz app.
 * These mirror the JSON shapes the AI produces (validated with zod in
 * `$lib/server/ai/schemas`) and the rows stored in Supabase.
 */

export type ChoiceId = 'A' | 'B' | 'C' | 'D';
export type Difficulty = 'advanced' | 'expert' | 'mixed';

export interface MCQChoice {
	id: ChoiceId;
	text: string;
}

export interface MCQQuestion {
	id: string;
	question: string;
	choices: MCQChoice[];
	correct_choice_id: ChoiceId;
	explanation: string;
	topic_tags: string[];
}

export interface ShortAnswerQuestion {
	id: string;
	question: string;
	ideal_answer: string;
	rubric_notes: string[];
	topic_tags: string[];
	is_coding_question?: boolean;
}

export interface ComprehensionQuestion {
	id: string;
	question: string;
	expected_answer: string;
}

export interface ReadingSection {
	title: string;
	body_markdown: string;
	topic_tags: string[];
	comprehension_questions: ComprehensionQuestion[];
}

export interface Quiz {
	id: string;
	created_at: string;
	title: string;
	topics: string[];
	difficulty: Difficulty;
	mcq_questions: MCQQuestion[];
	short_answer_questions: ShortAnswerQuestion[];
	reading?: ReadingSection;
}

/* ---------- Submission ---------- */

/** Map of MCQ question id -> selected choice (or null if skipped). */
export type McqAnswers = Record<string, ChoiceId | null>;
/** Map of short-answer question id -> user's free text. */
export type ShortAnswers = Record<string, string>;

export interface QuizSubmission {
	id: string;
	created_at: string;
	quiz_id: string;
	mcq_answers: McqAnswers;
	short_answers: ShortAnswers;
}

/* ---------- Evaluation ---------- */

export interface McqResult {
	question_id: string;
	selected_choice_id: ChoiceId | null;
	correct_choice_id: ChoiceId;
	is_correct: boolean;
	explanation: string;
	topic_tags: string[];
}

export interface ShortAnswerResult {
	question_id: string;
	user_answer: string;
	feedback: string;
	corrected_explanation: string;
	missing_concepts: string[];
	topic_tags: string[];
}

export interface WeakTopic {
	topic: string;
	reason: string;
	suggested_review: string;
}

export interface Evaluation {
	quiz_id: string;
	mcq_results: McqResult[];
	short_answer_results: ShortAnswerResult[];
	weak_topics: WeakTopic[];
	overall_summary: string;
	/** Secondary, simple stats for the dashboard. Not the focus of the app. */
	mcq_correct: number;
	mcq_total: number;
}

/* ---------- Persistence rows ---------- */

export interface SourceMaterial {
	id: string;
	created_at: string;
	title: string;
	file_name: string | null;
	file_type: string | null;
	storage_path: string | null;
	extracted_text: string | null;
	summary: string | null;
	topic_tags: string[];
	include_in_context?: boolean;
}

export interface PromptSetting {
	id: string;
	created_at: string;
	updated_at: string;
	name: PromptName;
	content: string;
}

/* The editable prompt slots surfaced in the prompt editor. */
export type PromptName =
	| 'quiz_generation'
	| 'short_answer_evaluation'
	| 'reading_generation'
	| 'weak_topic_extraction';

/* ---------- Dashboard view models ---------- */

export interface QuizHistoryItem {
	quiz_id: string;
	title: string;
	created_at: string;
	topics: string[];
	difficulty: Difficulty;
	submitted: boolean;
	submission_id: string | null;
	mcq_correct: number | null;
	mcq_total: number | null;
}

export interface DashboardData {
	history: QuizHistoryItem[];
	weak_topics: Array<WeakTopic & { id: string; created_at: string; source_quiz_id: string | null }>;
	stats: {
		total_quizzes: number;
		completed_quizzes: number;
		avg_mcq_accuracy: number | null;
		recent_summary: string | null;
	};
	latest_quiz_id: string | null;
}
