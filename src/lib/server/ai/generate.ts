import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Difficulty, MCQQuestion, Quiz, ShortAnswerQuestion } from '$lib/types/quiz';
import { chatJSON } from './openai';
import {
	aiMcqBatchSchema,
	aiReadingSchema,
	aiShortAnswerBatchSchema,
	type AiMcq,
	type AiShortAnswer
} from './schemas';
import { loadPrompt } from './prompts';
import { buildSourceContext } from './context';
import { getContextSources } from '$lib/server/supabase/repo';

const MCQ_TARGET = 30;
const MCQ_BATCH = 15;
const MCQ_MAX_BATCHES = 4;
const SHORT_ANSWER_TARGET = 10;
const MIN_CODING_QUESTIONS = 2;

export interface GenerateDeps {
	client: OpenAI;
	model: string;
	db: SupabaseClient;
}

export interface GenerateOptions {
	topics: string[];
	difficulty: Difficulty;
}

type GenOptionsWithContext = GenerateOptions & { contextText: string };

export interface GenerateResult {
	quiz: Quiz;
	sourceContextSummary: string | null;
}

const contextBlock = (text: string) =>
	text ? `\nSource material to ground relevant questions (use where appropriate):\n${text}\n` : '';

const MCQ_SHAPE = `Return a single JSON object of exactly this shape:
{
  "questions": [
    {
      "question": "string",
      "choices": [
        { "id": "A", "text": "string" },
        { "id": "B", "text": "string" },
        { "id": "C", "text": "string" },
        { "id": "D", "text": "string" }
      ],
      "correct_choice_id": "A" | "B" | "C" | "D",
      "explanation": "string",
      "topic_tags": ["string"]
    }
  ]
}
Every question MUST have exactly 4 choices with ids A, B, C, D.`;

function mcqUserPrompt(opts: {
	count: number;
	topics: string[];
	difficulty: Difficulty;
	contextText: string;
	usedStems: string[];
}): string {
	const used =
		opts.usedStems.length > 0
			? `\nDo NOT duplicate or trivially rephrase these already-used questions:\n- ${opts.usedStems.join('\n- ')}\n`
			: '';
	return `Generate exactly ${opts.count} hard, interview-level multiple-choice questions.
Topics to draw from (distribute roughly evenly, do not cluster): ${opts.topics.join(', ')}.
Difficulty: ${opts.difficulty}.
${contextBlock(opts.contextText)}${used}
${MCQ_SHAPE}`;
}

function shortAnswerUserPrompt(opts: {
	count: number;
	codingCount: number;
	topics: string[];
	difficulty: Difficulty;
	contextText: string;
}): string {
	return `Generate exactly ${opts.count} hard, interview-level short-answer questions, each answerable in roughly one paragraph.
Topics to draw from: ${opts.topics.join(', ')}.
Difficulty: ${opts.difficulty}.
At least ${opts.codingCount} of these MUST be coding-related (writing code, debugging, reasoning about code, C++ behavior, concurrency, mutexes, deadlocks, or memory management) and have "is_coding_question": true.
${contextBlock(opts.contextText)}
Return a single JSON object of exactly this shape:
{
  "questions": [
    {
      "question": "string",
      "ideal_answer": "string (a thorough model answer)",
      "rubric_notes": ["string (specific points a strong answer must hit)"],
      "topic_tags": ["string"],
      "is_coding_question": true
    }
  ]
}`;
}

function readingUserPrompt(opts: {
	topics: string[];
	difficulty: Difficulty;
	contextText: string;
}): string {
	return `Write an advanced reading passage of approximately 1000 words (Markdown) that weaves together several of these topics into one cohesive piece: ${opts.topics.join(', ')}.
Difficulty: ${opts.difficulty}.
${contextBlock(opts.contextText)}
Then write 3 to 5 comprehension questions that require synthesis and reasoning about the passage (not surface recall).
Return a single JSON object of exactly this shape:
{
  "title": "string",
  "body_markdown": "string (~1000 words, Markdown)",
  "topic_tags": ["string"],
  "comprehension_questions": [
    { "question": "string", "expected_answer": "string" }
  ]
}`;
}

async function generateMcqs(deps: GenerateDeps, system: string, opts: GenOptionsWithContext) {
	const collected: AiMcq[] = [];
	const usedStems: string[] = [];

	for (let batch = 0; batch < MCQ_MAX_BATCHES && collected.length < MCQ_TARGET; batch++) {
		const need = Math.min(MCQ_BATCH, MCQ_TARGET - collected.length);
		const result = await chatJSON(deps.client, {
			model: deps.model,
			schema: aiMcqBatchSchema,
			system,
			temperature: 0.8,
			maxTokens: 12000,
			label: 'MCQ generation',
			user: mcqUserPrompt({ ...opts, count: need, contextText: opts.contextText, usedStems })
		});
		if (result.questions.length === 0) break;
		for (const q of result.questions) {
			if (collected.length >= MCQ_TARGET) break;
			collected.push(q);
			usedStems.push(q.question.slice(0, 90));
		}
	}

	if (collected.length === 0) {
		throw new Error('MCQ generation produced no questions.');
	}
	return collected;
}

async function generateShortAnswers(deps: GenerateDeps, system: string, opts: GenOptionsWithContext) {
	const result = await chatJSON(deps.client, {
		model: deps.model,
		schema: aiShortAnswerBatchSchema,
		system,
		temperature: 0.8,
		maxTokens: 6000,
		label: 'short-answer generation',
		user: shortAnswerUserPrompt({
			...opts,
			count: SHORT_ANSWER_TARGET,
			codingCount: MIN_CODING_QUESTIONS,
			contextText: opts.contextText
		})
	});

	let questions: AiShortAnswer[] = result.questions.slice(0, SHORT_ANSWER_TARGET);

	// Guarantee at least one coding question even if the model didn't flag any.
	if (!questions.some((q) => q.is_coding_question)) {
		const top = await chatJSON(deps.client, {
			model: deps.model,
			schema: aiShortAnswerBatchSchema,
			system,
			temperature: 0.8,
			maxTokens: 2000,
			label: 'coding short-answer top-up',
			user: shortAnswerUserPrompt({
				...opts,
				count: 1,
				codingCount: 1,
				contextText: opts.contextText
			})
		});
		const coding = top.questions.find((q) => q.is_coding_question) ?? top.questions[0];
		if (coding) {
			coding.is_coding_question = true;
			if (questions.length >= SHORT_ANSWER_TARGET) questions[questions.length - 1] = coding;
			else questions.push(coding);
		}
	}

	if (questions.length === 0) throw new Error('Short-answer generation produced no questions.');
	return questions;
}

/** Orchestrates the full split generation and assembles a Quiz with stable ids. */
export async function generateQuiz(
	deps: GenerateDeps,
	options: GenerateOptions
): Promise<GenerateResult> {
	const [quizSystem, readingSystem, sources] = await Promise.all([
		loadPrompt(deps.db, 'quiz_generation'),
		loadPrompt(deps.db, 'reading_generation'),
		getContextSources(deps.db)
	]);
	const { contextText, contextSummary } = buildSourceContext(sources);
	const withContext = { ...options, contextText } as GenerateOptions & { contextText: string };

	// Sequential to keep within Worker subrequest/concurrency comfort zones and to
	// feed MCQ stems forward for de-duplication.
	const mcqs = await generateMcqs(deps, quizSystem, withContext);
	const shorts = await generateShortAnswers(deps, quizSystem, withContext);
	const reading = await chatJSON(deps.client, {
		model: deps.model,
		schema: aiReadingSchema,
		system: readingSystem,
		temperature: 0.7,
		maxTokens: 4000,
		label: 'reading generation',
		user: readingUserPrompt({ ...options, contextText })
	});

	const mcq_questions: MCQQuestion[] = mcqs.map((q, i) => ({
		id: `m${i + 1}`,
		question: q.question,
		choices: q.choices,
		correct_choice_id: q.correct_choice_id,
		explanation: q.explanation,
		topic_tags: q.topic_tags
	}));

	const short_answer_questions: ShortAnswerQuestion[] = shorts.map((q, i) => ({
		id: `s${i + 1}`,
		question: q.question,
		ideal_answer: q.ideal_answer,
		rubric_notes: q.rubric_notes,
		topic_tags: q.topic_tags,
		is_coding_question: q.is_coding_question ?? false
	}));

	const now = new Date();
	const quiz: Quiz = {
		id: crypto.randomUUID(),
		created_at: now.toISOString(),
		title: `Daily Learning Quiz — ${now.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})}`,
		topics: options.topics,
		difficulty: options.difficulty,
		mcq_questions,
		short_answer_questions,
		reading: {
			title: reading.title,
			body_markdown: reading.body_markdown,
			topic_tags: reading.topic_tags,
			comprehension_questions: reading.comprehension_questions.map((c, i) => ({
				id: `c${i + 1}`,
				question: c.question,
				expected_answer: c.expected_answer
			}))
		}
	};

	return { quiz, sourceContextSummary: contextSummary };
}
