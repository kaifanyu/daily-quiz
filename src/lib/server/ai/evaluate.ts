import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Evaluation,
	McqAnswers,
	McqResult,
	Quiz,
	ShortAnswerResult,
	ShortAnswers
} from '$lib/types/quiz';
import { chatJSON } from './openai';
import { aiEvaluationSchema } from './schemas';
import { loadPrompt } from './prompts';

export interface EvaluateDeps {
	client: OpenAI;
	model: string;
	db: SupabaseClient;
}

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

function missedTopicSummary(mcqResults: McqResult[]): string {
	const counts = new Map<string, number>();
	for (const r of mcqResults) {
		if (r.is_correct) continue;
		for (const tag of r.topic_tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
	return ranked.length > 0
		? ranked.map(([t, n]) => `${t} (${n})`).join(', ')
		: '(none — MCQ performance was strong)';
}

function buildEvalUserPrompt(quiz: Quiz, answers: ShortAnswers, mcqResults: McqResult[]): string {
	const correct = mcqResults.filter((r) => r.is_correct).length;
	const total = mcqResults.length;

	const blocks = quiz.short_answer_questions.map((q, i) => {
		const ua = (answers[q.id] ?? '').trim();
		return `[${i + 1}] question_id: ${q.id}${q.is_coding_question ? ' (coding)' : ''}
Topic tags: ${q.topic_tags.join(', ')}
Question: ${q.question}
Ideal answer: ${q.ideal_answer}
Rubric points:\n${q.rubric_notes.map((r) => `- ${r}`).join('\n')}
Learner's answer: ${ua ? JSON.stringify(ua) : '(left blank)'}`;
	});

	return `The learner completed a quiz. Evaluate their SHORT ANSWERS and then identify weak topics across the whole quiz.

Multiple-choice performance (context for weak-topic analysis only — do NOT re-explain individual MCQs):
- Correct: ${correct} / ${total}
- Topics most frequently missed: ${missedTopicSummary(mcqResults)}

Short answers to evaluate:

${blocks.join('\n\n')}

Return a single JSON object of exactly this shape:
{
  "short_answer_results": [
    { "question_id": "string", "feedback": "string", "corrected_explanation": "string", "missing_concepts": ["string"] }
  ],
  "weak_topics": [ { "topic": "string", "reason": "string", "suggested_review": "string" } ],
  "overall_summary": "string"
}
Include exactly one short_answer_results entry for each question_id provided above. No prose outside the JSON.`;
}

export async function evaluateSubmission(
	deps: EvaluateDeps,
	quiz: Quiz,
	mcqAnswers: McqAnswers,
	shortAnswers: ShortAnswers
): Promise<Evaluation> {
	const mcqResults = gradeMcqs(quiz, mcqAnswers);

	const [evalPrompt, weakPrompt] = await Promise.all([
		loadPrompt(deps.db, 'short_answer_evaluation'),
		loadPrompt(deps.db, 'weak_topic_extraction')
	]);
	const system = `${evalPrompt}\n\n---\nWEAK TOPIC & SUMMARY GUIDANCE:\n${weakPrompt}`;

	const ai = await chatJSON(deps.client, {
		model: deps.model,
		schema: aiEvaluationSchema,
		system,
		temperature: 0.3,
		maxTokens: 6000,
		label: 'short-answer evaluation',
		user: buildEvalUserPrompt(quiz, shortAnswers, mcqResults)
	});

	// Map AI results back onto questions by id (fall back gracefully if missing).
	const byId = new Map(ai.short_answer_results.map((r) => [r.question_id, r]));
	const short_answer_results: ShortAnswerResult[] = quiz.short_answer_questions.map((q) => {
		const r = byId.get(q.id);
		return {
			question_id: q.id,
			user_answer: shortAnswers[q.id] ?? '',
			feedback: r?.feedback ?? 'No feedback was generated for this answer.',
			corrected_explanation: r?.corrected_explanation ?? q.ideal_answer,
			missing_concepts: r?.missing_concepts ?? [],
			topic_tags: q.topic_tags
		};
	});

	return {
		quiz_id: quiz.id,
		mcq_results: mcqResults,
		short_answer_results,
		weak_topics: ai.weak_topics,
		overall_summary: ai.overall_summary,
		mcq_correct: mcqResults.filter((r) => r.is_correct).length,
		mcq_total: mcqResults.length
	};
}
