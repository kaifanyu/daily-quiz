import OpenAI from 'openai';
import type { ZodType } from 'zod';
import type { AppEnv } from '$lib/server/env';

export function createOpenAIClient(env: AppEnv): OpenAI {
	return new OpenAI({
		apiKey: env.OPENAI_API_KEY,
		baseURL: env.OPENAI_BASE_URL || undefined
	});
}

export interface ChatJSONOptions<T> {
	model: string;
	system: string;
	user: string;
	schema: ZodType<T>;
	temperature?: number;
	maxTokens?: number;
	/** Label used in error messages for easier debugging. */
	label?: string;
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** Strip accidental markdown code fences before JSON.parse. */
function stripFences(raw: string): string {
	const trimmed = raw.trim();
	const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
	return fence ? fence[1] : trimmed;
}

function tryParse(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
	try {
		return { ok: true, value: JSON.parse(stripFences(raw)) };
	} catch (e) {
		return { ok: false, error: `not valid JSON (${(e as Error).message})` };
	}
}

function formatZodError(err: {
	issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>;
}): string {
	return err.issues
		.slice(0, 8)
		.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
		.join('; ');
}

/**
 * Calls the model expecting a JSON object, parses + validates it against a zod
 * schema, and retries ONCE with a repair prompt if the output is malformed.
 * Throws a descriptive error if it still fails — callers surface this to the UI.
 */
export async function chatJSON<T>(client: OpenAI, opts: ChatJSONOptions<T>): Promise<T> {
	const messages: ChatMessage[] = [
		{ role: 'system', content: opts.system },
		{ role: 'user', content: opts.user }
	];
	let lastError = 'unknown error';

	for (let attempt = 0; attempt < 2; attempt++) {
		const completion = await client.chat.completions.create({
			model: opts.model,
			messages,
			response_format: { type: 'json_object' },
			temperature: opts.temperature ?? 0.7,
			max_tokens: opts.maxTokens ?? 8000
		});

		const content = completion.choices[0]?.message?.content ?? '';
		const parsed = tryParse(content);
		if (parsed.ok) {
			const validated = opts.schema.safeParse(parsed.value);
			if (validated.success) return validated.data;
			lastError = formatZodError(validated.error);
		} else {
			lastError = parsed.error;
		}

		// Append a repair turn and try once more.
		messages.push({ role: 'assistant', content });
		messages.push({
			role: 'user',
			content:
				`Your previous response was invalid: ${lastError}. ` +
				`Respond again with ONLY a corrected JSON object that exactly matches the required schema. ` +
				`Do not include any prose, explanations, or markdown code fences.`
		});
	}

	throw new Error(
		`${opts.label ?? 'AI request'} returned invalid JSON after one repair attempt. Last error: ${lastError}`
	);
}
