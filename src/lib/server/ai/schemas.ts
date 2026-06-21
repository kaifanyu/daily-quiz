import { z } from 'zod';

const choiceIdEnum = z.enum(['A', 'B', 'C', 'D']);

/** A single MCQ as produced by the model (id assigned by us afterwards). */
export const aiMcqSchema = z
	.object({
		question: z.string().min(8),
		choices: z
			.array(z.object({ id: choiceIdEnum, text: z.string().min(1) }))
			.length(4),
		correct_choice_id: choiceIdEnum,
		explanation: z.string().min(1),
		topic_tags: z.array(z.string().min(1)).min(1)
	})
	.refine(
		(q) => {
			const ids = q.choices.map((c) => c.id).sort().join('');
			return ids === 'ABCD';
		},
		{ message: 'choices must have exactly the ids A, B, C, and D' }
	)
	.refine((q) => q.choices.some((c) => c.id === q.correct_choice_id), {
		message: 'correct_choice_id must reference one of the choices'
	});

export const aiMcqBatchSchema = z.object({
	questions: z.array(aiMcqSchema).min(1)
});

/** A single short-answer question as produced by the model. */
export const aiShortAnswerSchema = z.object({
	question: z.string().min(8),
	ideal_answer: z.string().min(1),
	rubric_notes: z.array(z.string().min(1)).min(1),
	topic_tags: z.array(z.string().min(1)).min(1),
	is_coding_question: z.boolean().optional()
});

export const aiShortAnswerBatchSchema = z.object({
	questions: z.array(aiShortAnswerSchema).min(1)
});

/** Source-material summarization output. */
export const aiSourceSummarySchema = z.object({
	summary: z.string().min(1),
	topic_tags: z.array(z.string())
});

export type AiMcq = z.infer<typeof aiMcqSchema>;
export type AiShortAnswer = z.infer<typeof aiShortAnswerSchema>;
export type AiSourceSummary = z.infer<typeof aiSourceSummarySchema>;
