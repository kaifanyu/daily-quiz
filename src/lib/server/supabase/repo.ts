import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	DashboardData,
	Difficulty,
	Evaluation,
	McqAnswers,
	PromptName,
	PromptSetting,
	Quiz,
	QuizHistoryItem,
	QuizSubmission,
	ShortAnswers,
	SourceMaterial,
	WeakTopic
} from '$lib/types/quiz';

const newId = () => crypto.randomUUID();

/* ----------------------------------------------------------------------------
 * Quizzes
 * ------------------------------------------------------------------------- */

interface QuizRow {
	id: string;
	created_at: string;
	title: string;
	topics: string[];
	difficulty: string;
	quiz_json: Quiz;
	source_context_summary: string | null;
}

export async function saveQuiz(
	db: SupabaseClient,
	quiz: Quiz,
	sourceContextSummary: string | null
): Promise<Quiz> {
	const id = quiz.id || newId();
	const stored: Quiz = { ...quiz, id };
	const { data, error } = await db
		.from('quizzes')
		.insert({
			id,
			title: quiz.title,
			topics: quiz.topics,
			difficulty: quiz.difficulty,
			quiz_json: stored,
			source_context_summary: sourceContextSummary
		})
		.select('id, created_at')
		.single();
	if (error) throw new Error(`saveQuiz failed: ${error.message}`);
	return { ...stored, id: data.id, created_at: data.created_at };
}

export async function getQuiz(db: SupabaseClient, id: string): Promise<Quiz | null> {
	const { data, error } = await db
		.from('quizzes')
		.select('id, created_at, quiz_json')
		.eq('id', id)
		.maybeSingle();
	if (error) throw new Error(`getQuiz failed: ${error.message}`);
	if (!data) return null;
	return { ...(data.quiz_json as Quiz), id: data.id, created_at: data.created_at };
}

/* ----------------------------------------------------------------------------
 * Submissions
 * ------------------------------------------------------------------------- */

export async function saveSubmission(
	db: SupabaseClient,
	quizId: string,
	mcqAnswers: McqAnswers,
	shortAnswers: ShortAnswers
): Promise<QuizSubmission> {
	const id = newId();
	const { data, error } = await db
		.from('quiz_submissions')
		.insert({ id, quiz_id: quizId, mcq_answers: mcqAnswers, short_answers: shortAnswers })
		.select('id, created_at')
		.single();
	if (error) throw new Error(`saveSubmission failed: ${error.message}`);
	return {
		id: data.id,
		created_at: data.created_at,
		quiz_id: quizId,
		mcq_answers: mcqAnswers,
		short_answers: shortAnswers
	};
}

export async function getLatestSubmissionForQuiz(
	db: SupabaseClient,
	quizId: string
): Promise<QuizSubmission | null> {
	const { data, error } = await db
		.from('quiz_submissions')
		.select('*')
		.eq('quiz_id', quizId)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw new Error(`getLatestSubmissionForQuiz failed: ${error.message}`);
	return (data as QuizSubmission) ?? null;
}

/* ----------------------------------------------------------------------------
 * Evaluations
 * ------------------------------------------------------------------------- */

export async function saveEvaluation(
	db: SupabaseClient,
	quizId: string,
	submissionId: string,
	evaluation: Evaluation
): Promise<string> {
	const id = newId();
	const { error } = await db.from('evaluations').insert({
		id,
		quiz_id: quizId,
		submission_id: submissionId,
		evaluation_json: evaluation,
		weak_topics: evaluation.weak_topics,
		overall_summary: evaluation.overall_summary,
		mcq_correct: evaluation.mcq_correct,
		mcq_total: evaluation.mcq_total
	});
	if (error) throw new Error(`saveEvaluation failed: ${error.message}`);
	return id;
}

export async function getEvaluationForSubmission(
	db: SupabaseClient,
	submissionId: string
): Promise<Evaluation | null> {
	const { data, error } = await db
		.from('evaluations')
		.select('evaluation_json')
		.eq('submission_id', submissionId)
		.maybeSingle();
	if (error) throw new Error(`getEvaluationForSubmission failed: ${error.message}`);
	return data ? (data.evaluation_json as Evaluation) : null;
}

/* ----------------------------------------------------------------------------
 * Weak topics (denormalized for the dashboard)
 * ------------------------------------------------------------------------- */

export async function saveWeakTopics(
	db: SupabaseClient,
	topics: WeakTopic[],
	sourceQuizId: string,
	sourceSubmissionId: string
): Promise<void> {
	if (topics.length === 0) return;
	const rows = topics.map((t) => ({
		id: newId(),
		topic: t.topic,
		reason: t.reason,
		suggested_review: t.suggested_review,
		source_quiz_id: sourceQuizId,
		source_submission_id: sourceSubmissionId
	}));
	const { error } = await db.from('weak_topics').insert(rows);
	if (error) throw new Error(`saveWeakTopics failed: ${error.message}`);
}

/* ----------------------------------------------------------------------------
 * Prompt settings
 * ------------------------------------------------------------------------- */

export async function getPromptContent(
	db: SupabaseClient,
	name: PromptName
): Promise<string | null> {
	const { data, error } = await db
		.from('prompt_settings')
		.select('content')
		.eq('name', name)
		.maybeSingle();
	if (error) throw new Error(`getPromptContent failed: ${error.message}`);
	return data ? data.content : null;
}

export async function getAllPrompts(db: SupabaseClient): Promise<PromptSetting[]> {
	const { data, error } = await db.from('prompt_settings').select('*');
	if (error) throw new Error(`getAllPrompts failed: ${error.message}`);
	return (data ?? []) as PromptSetting[];
}

export async function upsertPrompt(
	db: SupabaseClient,
	name: PromptName,
	content: string
): Promise<void> {
	const { error } = await db
		.from('prompt_settings')
		.upsert({ name, content, updated_at: new Date().toISOString() }, { onConflict: 'name' });
	if (error) throw new Error(`upsertPrompt failed: ${error.message}`);
}

/** Reset = remove the override so the app falls back to the built-in default. */
export async function deletePrompt(db: SupabaseClient, name: PromptName): Promise<void> {
	const { error } = await db.from('prompt_settings').delete().eq('name', name);
	if (error) throw new Error(`deletePrompt failed: ${error.message}`);
}

/* ----------------------------------------------------------------------------
 * Source materials
 * ------------------------------------------------------------------------- */

export async function listSources(db: SupabaseClient): Promise<SourceMaterial[]> {
	const { data, error } = await db
		.from('source_materials')
		.select('*')
		.order('created_at', { ascending: false });
	if (error) throw new Error(`listSources failed: ${error.message}`);
	return (data ?? []) as SourceMaterial[];
}

export async function createSource(
	db: SupabaseClient,
	input: Partial<SourceMaterial> & { title: string }
): Promise<SourceMaterial> {
	const id = newId();
	const { data, error } = await db
		.from('source_materials')
		.insert({
			id,
			title: input.title,
			file_name: input.file_name ?? null,
			file_type: input.file_type ?? null,
			storage_path: input.storage_path ?? null,
			extracted_text: input.extracted_text ?? null,
			summary: input.summary ?? null,
			topic_tags: input.topic_tags ?? [],
			include_in_context: input.include_in_context ?? true
		})
		.select('*')
		.single();
	if (error) throw new Error(`createSource failed: ${error.message}`);
	return data as SourceMaterial;
}

export async function updateSource(
	db: SupabaseClient,
	id: string,
	patch: Partial<SourceMaterial>
): Promise<void> {
	const { error } = await db.from('source_materials').update(patch).eq('id', id);
	if (error) throw new Error(`updateSource failed: ${error.message}`);
}

export async function deleteSource(db: SupabaseClient, id: string): Promise<void> {
	const { error } = await db.from('source_materials').delete().eq('id', id);
	if (error) throw new Error(`deleteSource failed: ${error.message}`);
}

/** Sources flagged for inclusion, used to build quiz-generation context. */
export async function getContextSources(db: SupabaseClient): Promise<SourceMaterial[]> {
	const { data, error } = await db
		.from('source_materials')
		.select('*')
		.eq('include_in_context', true)
		.order('created_at', { ascending: false });
	if (error) throw new Error(`getContextSources failed: ${error.message}`);
	return (data ?? []) as SourceMaterial[];
}

/* ----------------------------------------------------------------------------
 * Dashboard / history
 * ------------------------------------------------------------------------- */

export async function getDashboardData(
	db: SupabaseClient,
	historyLimit = 20
): Promise<DashboardData> {
	const [quizzesRes, submissionsRes, evaluationsRes, weakTopicsRes] = await Promise.all([
		db
			.from('quizzes')
			.select('id, created_at, title, topics, difficulty')
			.order('created_at', { ascending: false })
			.limit(historyLimit),
		db.from('quiz_submissions').select('id, quiz_id, created_at'),
		db.from('evaluations').select('submission_id, quiz_id, mcq_correct, mcq_total, overall_summary, created_at'),
		db
			.from('weak_topics')
			.select('id, created_at, topic, reason, suggested_review, source_quiz_id')
			.order('created_at', { ascending: false })
			.limit(12)
	]);

	for (const res of [quizzesRes, submissionsRes, evaluationsRes, weakTopicsRes]) {
		if (res.error) throw new Error(`getDashboardData failed: ${res.error.message}`);
	}

	const quizRows = (quizzesRes.data ?? []) as Pick<
		QuizRow,
		'id' | 'created_at' | 'title' | 'topics' | 'difficulty'
	>[];
	const submissions = (submissionsRes.data ?? []) as {
		id: string;
		quiz_id: string;
		created_at: string;
	}[];
	const evaluations = (evaluationsRes.data ?? []) as {
		submission_id: string;
		quiz_id: string;
		mcq_correct: number | null;
		mcq_total: number | null;
		overall_summary: string | null;
		created_at: string;
	}[];

	// Index latest submission + evaluation per quiz.
	const submissionByQuiz = new Map<string, { id: string; created_at: string }>();
	for (const s of submissions) {
		const existing = submissionByQuiz.get(s.quiz_id);
		if (!existing || s.created_at > existing.created_at) {
			submissionByQuiz.set(s.quiz_id, { id: s.id, created_at: s.created_at });
		}
	}
	const evalBySubmission = new Map(evaluations.map((e) => [e.submission_id, e]));

	const history: QuizHistoryItem[] = quizRows.map((q) => {
		const sub = submissionByQuiz.get(q.id) ?? null;
		const ev = sub ? evalBySubmission.get(sub.id) : undefined;
		return {
			quiz_id: q.id,
			title: q.title,
			created_at: q.created_at,
			topics: q.topics ?? [],
			difficulty: q.difficulty as Difficulty,
			submitted: Boolean(sub),
			submission_id: sub?.id ?? null,
			mcq_correct: ev?.mcq_correct ?? null,
			mcq_total: ev?.mcq_total ?? null
		};
	});

	// Simple, secondary stats.
	const accuracies = evaluations
		.filter((e) => e.mcq_total && e.mcq_total > 0)
		.map((e) => (e.mcq_correct ?? 0) / (e.mcq_total as number));
	const avg =
		accuracies.length > 0 ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : null;
	const recentEval = [...evaluations].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

	return {
		history,
		weak_topics: (weakTopicsRes.data ?? []) as DashboardData['weak_topics'],
		stats: {
			total_quizzes: quizRows.length,
			completed_quizzes: history.filter((h) => h.submitted).length,
			avg_mcq_accuracy: avg,
			recent_summary: recentEval?.overall_summary ?? null
		},
		latest_quiz_id: quizRows[0]?.id ?? null
	};
}
