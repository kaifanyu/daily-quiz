import type { SelectedTopic, TopicCategory, TopicEntry } from '$lib/types/quiz';

export type CategoryWithTopics = TopicCategory & { topics: TopicEntry[] };

/** Default number of topics to draw for one quiz. */
export const DEFAULT_SAMPLE_COUNT = 6;
/** How many of a topic's `subtopics` to surface per run (rotated for variety). */
const MAX_SUBTOPICS_SURFACED = 3;

/**
 * Largest-remainder apportionment: split `total` whole slots across `weights`
 * proportionally, so the integer counts sum exactly to `total`. Relative weights —
 * they need not be normalized.
 */
export function largestRemainder(total: number, weights: number[]): number[] {
	const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
	const sum = clean.reduce((a, b) => a + b, 0);
	if (total <= 0 || sum <= 0) return clean.map(() => 0);

	const ideal = clean.map((w) => (w / sum) * total);
	const out = ideal.map((x) => Math.floor(x));
	let remaining = total - out.reduce((a, b) => a + b, 0);

	const byFrac = ideal
		.map((x, i) => ({ i, frac: x - Math.floor(x) }))
		.sort((a, b) => b.frac - a.frac);
	for (let k = 0; k < byFrac.length && remaining > 0; k++, remaining--) {
		out[byFrac[k].i] += 1;
	}
	return out;
}

/**
 * Cap each allocation at its available item count and push any overflow onto
 * categories that still have room, so we never ask for more topics than exist.
 */
function redistribute(quota: number[], caps: number[], total: number): number[] {
	const out = quota.map((q, i) => Math.min(q, caps[i]));
	let overflow =
		Math.min(
			total,
			caps.reduce((a, b) => a + b, 0)
		) - out.reduce((a, b) => a + b, 0);
	while (overflow > 0) {
		let placed = false;
		for (let i = 0; i < out.length && overflow > 0; i++) {
			if (out[i] < caps[i]) {
				out[i] += 1;
				overflow -= 1;
				placed = true;
			}
		}
		if (!placed) break;
	}
	return out;
}

/** Draw `k` distinct items, each chosen with probability proportional to its weight. */
export function weightedSampleNoReplace<T>(
	items: T[],
	weightOf: (t: T) => number,
	k: number,
	rng: () => number = Math.random
): T[] {
	const pool = items.map((item) => ({ item, w: Math.max(0, Number(weightOf(item)) || 0) }));
	const take = Math.min(k, pool.length);
	const picked: T[] = [];

	for (let n = 0; n < take; n++) {
		const total = pool.reduce((a, p) => a + p.w, 0);
		let idx: number;
		if (total <= 0) {
			// All remaining weights are zero — fall back to uniform choice.
			idx = Math.floor(rng() * pool.length);
		} else {
			let r = rng() * total;
			idx = 0;
			while (idx < pool.length - 1 && (r -= pool[idx].w) > 0) idx++;
		}
		picked.push(pool.splice(idx, 1)[0].item);
	}
	return picked;
}

function surfaceSubtopics(subtopics: string[], rng: () => number): string[] {
	const list = subtopics ?? [];
	if (list.length <= MAX_SUBTOPICS_SURFACED) return list;
	return weightedSampleNoReplace(list, () => 1, MAX_SUBTOPICS_SURFACED, rng);
}

/**
 * Two-level weighted draw: allocate `count` slots across categories by their
 * weight (category mix), then pick that many distinct topics within each
 * category by topic weight. Returns the chosen topics with a rotated subset of
 * their facets surfaced. Pure — pass `rng` to make it deterministic in tests.
 */
export function sampleTopics(
	bank: CategoryWithTopics[],
	count = DEFAULT_SAMPLE_COUNT,
	rng: () => number = Math.random
): SelectedTopic[] {
	const usable = bank
		.filter((c) => c.enabled && Number(c.weight) > 0 && c.topics.some((t) => t.enabled))
		.map((c) => ({ ...c, topics: c.topics.filter((t) => t.enabled) }));
	if (usable.length === 0) return [];

	const quota = redistribute(
		largestRemainder(
			count,
			usable.map((c) => Number(c.weight))
		),
		usable.map((c) => c.topics.length),
		count
	);

	const selected: SelectedTopic[] = [];
	usable.forEach((c, i) => {
		const picks = weightedSampleNoReplace(c.topics, (t) => Number(t.weight), quota[i], rng);
		for (const t of picks) {
			selected.push({
				name: t.name,
				category: c.name,
				subtopics: surfaceSubtopics(t.subtopics, rng),
				angle: t.angle ?? null,
				personal_note: t.personal_note ?? null,
				keep_getting_wrong: t.keep_getting_wrong ?? []
			});
		}
	});
	return selected;
}
