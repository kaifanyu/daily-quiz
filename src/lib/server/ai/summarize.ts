import type OpenAI from 'openai';
import { chatJSON } from './openai';
import { aiSourceSummarySchema } from './schemas';

const SYSTEM = `You condense study/source material into a concise, faithful summary that can later be used as grounding context for generating quiz questions. Capture the key facts, definitions, arguments, names, dates, and conclusions. Do not invent content. Also propose a few short topic tags.`;

const MAX_INPUT_CHARS = 16000;

/** Summarizes uploaded/pasted source text and proposes topic tags. */
export async function summarizeSource(
	client: OpenAI,
	model: string,
	title: string,
	text: string
): Promise<{ summary: string; topic_tags: string[] }> {
	const clipped = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) + '… [truncated]' : text;
	const result = await chatJSON(client, {
		model,
		schema: aiSourceSummarySchema,
		system: SYSTEM,
		temperature: 0.3,
		maxTokens: 1200,
		label: 'source summarization',
		user: `Title: ${title}

Material:
"""
${clipped}
"""

Return a single JSON object of exactly this shape:
{ "summary": "string (5-12 sentences capturing the essentials)", "topic_tags": ["string"] }`
	});
	return result;
}
