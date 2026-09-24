import type { Attachment } from './types';
type Attachments = Record<string, Attachment>;
type MathRenderer = { renderToString(source: string, options: Record<string, unknown>): string };
declare global {
	interface Window {
		katex?: MathRenderer;
	}
}

const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const escapeHtml = (value: unknown) =>
	String(value ?? '').replace(
		/[&<>"']/g,
		(character) =>
			(
				({
					'&': '&amp;',
					'<': '&lt;',
					'>': '&gt;',
					'"': '&quot;',
					"'": '&#39;'
				}) as Record<string, string>
			)[character]
	);

export function renderMath(source: string, displayMode: boolean): string {
	if (
		typeof window !== 'undefined' &&
		window.katex &&
		typeof window.katex.renderToString === 'function'
	) {
		try {
			return window.katex.renderToString(source, {
				displayMode,
				throwOnError: false,
				trust: false,
				strict: 'ignore',
				maxExpand: 1000,
				maxSize: 20,
				output: 'htmlAndMathml'
			});
		} catch {
			/* Keep an invalid expression visible and editable. */
		}
	}
	return `<code class="math-fallback">${escapeHtml(displayMode ? `$$${source}$$` : `$${source}$`)}</code>`;
}

function safeLink(value: string) {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
}

function attachmentImage(id: string, alt: string, attachments: Attachments) {
	const attachment = Object.prototype.hasOwnProperty.call(attachments, id) ? attachments[id] : null;
	const data = typeof attachment === 'string' ? attachment : attachment?.data;
	const match =
		typeof data === 'string' &&
		/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(data);
	if (!match || (attachment?.mime && attachment.mime !== match[1])) {
		return `<span class="missing-image">Image unavailable${alt ? `: ${escapeHtml(alt)}` : ''}</span>`;
	}
	return `<img class="note-image" src="${escapeHtml(data)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
}

// Inline markup is scanned from the original text. User text never becomes a
// replacement token, and generated HTML is never reparsed as Markdown.
function renderInline(source: string, attachments: Attachments, depth = 0): string {
	if (depth > 12) return escapeHtml(source);
	let html = '',
		plain = '',
		position = 0;
	const flush = () => {
		html += escapeHtml(plain);
		plain = '';
	};
	const emit = (result: string, length: number) => {
		flush();
		html += result;
		position += length;
	};
	const closingIndex = (delimiter: string, from: number) => {
		let at = source.indexOf(delimiter, from);
		while (at !== -1) {
			let escapes = 0;
			for (let before = at - 1; before >= 0 && source[before] === '\\'; before--) escapes++;
			if (escapes % 2 === 0) return at;
			at = source.indexOf(delimiter, at + delimiter.length);
		}
		return -1;
	};
	while (position < source.length) {
		const rest = source.slice(position);
		if (rest.startsWith('\\(') || rest.startsWith('\\[')) {
			const displayMode = rest[1] === '[';
			const close = source.indexOf(displayMode ? '\\]' : '\\)', position + 2);
			if (close !== -1) {
				emit(renderMath(source.slice(position + 2, close), displayMode), close + 2 - position);
				continue;
			}
		}
		if (source[position] === '\\' && /[\\`*_{}\[\]()#+.!$>~-]/.test(source[position + 1] || '')) {
			plain += source[position + 1];
			position += 2;
			continue;
		}
		if (source[position] === '`') {
			const ticks = /^`+/.exec(rest)![0];
			const close = source.indexOf(ticks, position + ticks.length);
			if (close !== -1) {
				let code = source.slice(position + ticks.length, close).replace(/\n/g, ' ');
				if (/^ .+ $/.test(code) && code.trim()) code = code.slice(1, -1);
				emit(`<code>${escapeHtml(code)}</code>`, close + ticks.length - position);
				continue;
			}
		}
		if (rest.startsWith('![')) {
			const match = /^!\[([^\]\n]*)\]\(attachment:([A-Za-z0-9_-]+)\)/.exec(rest);
			if (match) {
				emit(attachmentImage(match[2], match[1], attachments), match[0].length);
				continue;
			}
		}
		if (source[position] === '[') {
			const match = /^\[([^\]\n]+)\]\(([^\s)]+)\)/.exec(rest);
			if (match) {
				const url = safeLink(match[2]);
				if (url) {
					emit(
						`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[1])}</a>`,
						match[0].length
					);
					continue;
				}
			}
		}
		if (source[position] === '$') {
			const delimiter = rest.startsWith('$$') ? '$$' : '$';
			const close = closingIndex(delimiter, position + delimiter.length);
			const expression = close === -1 ? '' : source.slice(position + delimiter.length, close);
			if (
				expression &&
				(delimiter === '$$' || (!/\n/.test(expression) && !/^\s|\s$/.test(expression)))
			) {
				emit(renderMath(expression, delimiter === '$$'), close + delimiter.length - position);
				continue;
			}
		}
		if (rest.startsWith('**') || rest.startsWith('__')) {
			const delimiter = rest.slice(0, 2);
			const close = closingIndex(delimiter, position + 2);
			if (close > position + 2) {
				emit(
					`<strong>${renderInline(source.slice(position + 2, close), attachments, depth + 1)}</strong>`,
					close + 2 - position
				);
				continue;
			}
		}
		if (source[position] === '*' || source[position] === '_') {
			const delimiter = source[position];
			const intraword = delimiter === '_' && /[\p{L}\p{N}]/u.test(source[position - 1] || '');
			const close = closingIndex(delimiter, position + 1);
			if (
				!intraword &&
				close > position + 1 &&
				!/^\s|\s$/.test(source.slice(position + 1, close))
			) {
				emit(
					`<em>${renderInline(source.slice(position + 1, close), attachments, depth + 1)}</em>`,
					close + 1 - position
				);
				continue;
			}
		}
		if (source[position] === '\n') {
			emit('<br>\n', 1);
			continue;
		}
		plain += source[position++];
	}
	flush();
	return html;
}

const indentation = (line: string) => /^[ \t]*/.exec(line)![0].replace(/\t/g, '    ').length;
const stripIndent = (line: string, amount: number) => {
	let at = 0,
		width = 0;
	while (at < line.length && width < amount && /[ \t]/.test(line[at]))
		width += line[at++] === '\t' ? 4 : 1;
	return line.slice(at);
};
function listMarker(line: string) {
	const match = /^([ \t]*)([-+*]|\d+[.)])[ \t]+(.*)$/.exec(line);
	if (!match) return null;
	return {
		indent: indentation(match[1]),
		ordered: /^\d/.test(match[2]),
		number: parseInt(match[2], 10),
		text: match[3]
	};
}
const isFence = (line: string) => /^\s{0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line);
const startsBlock = (line: string) =>
	Boolean(
		isFence(line) ||
		/^\s{0,3}(#{1,6})\s+/.test(line) ||
		/^\s*\$\$/.test(line) ||
		/^\s{0,3}>/.test(line) ||
		listMarker(line)
	);

function renderBlocks(lines: string[], attachments: Attachments, depth = 0): string {
	if (depth > 16) return `<p>${escapeHtml(lines.join('\n')).replace(/\n/g, '<br>')}</p>`;
	let html = '',
		index = 0;
	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) {
			index++;
			continue;
		}
		const fence = isFence(line);
		if (fence) {
			const code = [];
			index++;
			const closing = new RegExp(`^\\s{0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
			while (index < lines.length && !closing.test(lines[index])) code.push(lines[index++]);
			if (index < lines.length) index++;
			const language = fence[2].trim().split(/\s+/)[0];
			html += `<pre><code${/^[a-zA-Z0-9_+-]+$/.test(language) ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`;
			continue;
		}
		if (/^\s*\$\$/.test(line)) {
			const remaining = lines
				.slice(index)
				.join('\n')
				.replace(/^\s*\$\$/, '');
			const close = remaining.indexOf('$$');
			if (close !== -1) {
				const expression = remaining.slice(0, close);
				const suffix = remaining.slice(close + 2).split('\n')[0];
				if (!suffix.trim()) {
					html += renderMath(expression.trim(), true);
					index += expression.split('\n').length;
					continue;
				}
			}
		}
		const heading = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/.exec(line);
		if (heading) {
			const level = heading[1].length;
			html += `<h${level}>${renderInline(heading[2], attachments)}</h${level}>`;
			index++;
			continue;
		}
		if (/^\s{0,3}>/.test(line)) {
			const quoted = [];
			while (index < lines.length && /^\s{0,3}>/.test(lines[index]))
				quoted.push(lines[index++].replace(/^\s{0,3}> ?/, ''));
			html += `<blockquote>${renderBlocks(quoted, attachments, depth + 1)}</blockquote>`;
			continue;
		}
		const first = listMarker(line);
		if (first) {
			const tag = first.ordered ? 'ol' : 'ul';
			const start =
				first.ordered && Number.isSafeInteger(first.number) && first.number > 1
					? ` start="${first.number}"`
					: '';
			html += `<${tag}${start}>`;
			while (index < lines.length) {
				const marker = listMarker(lines[index]);
				if (!marker || marker.indent !== first.indent || marker.ordered !== first.ordered) break;
				const item = [marker.text];
				index++;
				while (index < lines.length) {
					if (!lines[index].trim()) {
						let next = index + 1;
						while (next < lines.length && !lines[next].trim()) next++;
						if (next === lines.length || indentation(lines[next]) <= first.indent) {
							index = next;
							break;
						}
						item.push('');
						index++;
						continue;
					}
					if (indentation(lines[index]) <= first.indent) break;
					item.push(stripIndent(lines[index++], first.indent + 2));
				}
				const checkbox = /^\[([ xX])\]\s*(.*)$/.exec(item[0]);
				if (checkbox) item[0] = checkbox[2];
				const checked = checkbox && checkbox[1].toLowerCase() === 'x';
				const content = renderBlocks(item, attachments, depth + 1);
				html += `<li${checkbox ? ' class="task-item"' : ''}>${checkbox ? `<input type="checkbox" disabled${checked ? ' checked' : ''} aria-label="${checked ? 'Completed' : 'Not completed'}">` : ''}${content}</li>`;
			}
			html += `</${tag}>`;
			continue;
		}
		const paragraph = [line];
		index++;
		while (index < lines.length && lines[index].trim() && !startsBlock(lines[index]))
			paragraph.push(lines[index++]);
		html += `<p>${renderInline(paragraph.join('\n'), attachments)}</p>`;
	}
	return html;
}

export function renderMarkdown(source: string, attachments: Attachments = {}): string {
	const normalized = String(source ?? '')
		.replace(/\r\n?/g, '\n')
		.replace(/\u0000/g, '');
	return normalized.trim()
		? renderBlocks(
				normalized.split('\n'),
				attachments && typeof attachments === 'object' ? attachments : {}
			)
		: '';
}

function readDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			typeof reader.result === 'string'
				? resolve(reader.result)
				: reject(new Error('Could not read file.'));
		reader.onerror = () =>
			reject(new Error('This file could not be read. Please choose it again.'));
		reader.onabort = () => reject(new Error('File reading was interrupted. Please try again.'));
		reader.readAsDataURL(file);
	});
}

export async function readAttachment(file: File): Promise<Attachment> {
	if (!file || typeof file.size !== 'number') throw new Error('Choose an image or PDF to attach.');
	if (file.size === 0) throw new Error('This file is empty. Choose an image or PDF with content.');
	if (file.size > MAX_ATTACHMENT_BYTES)
		throw new Error(
			'Choose a file smaller than 12 MB. Larger images can be resized before attaching.'
		);
	const mime = String(file.type || '').toLowerCase();
	if (!IMAGE_TYPES.has(mime) && mime !== 'application/pdf')
		throw new Error('Choose a PNG, JPEG, WebP, GIF, or PDF file.');
	const original = await readDataUrl(file);
	if (mime === 'application/pdf') return { name: file.name || 'Paper.pdf', mime, data: original };
	const image = await new Promise<HTMLImageElement>((resolve, reject) => {
		const element = new Image();
		element.onload = () => resolve(element);
		element.onerror = () =>
			reject(new Error('This image could not be opened. Try a PNG, JPEG, or WebP image.'));
		element.src = original;
	});
	if (!image.naturalWidth || !image.naturalHeight)
		throw new Error('This image has no readable dimensions.');
	const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
	canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Image processing is unavailable in this browser.');
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	// WebP retains transparency. Browsers without a WebP encoder return PNG.
	const data = canvas.toDataURL('image/webp', 0.88);
	const encodedMime = /^data:(image\/(?:webp|png));base64,/.exec(data)?.[1];
	if (!encodedMime) throw new Error('This image could not be saved. Please try another image.');
	return { name: file.name || 'Image', mime: encodedMime as 'image/webp' | 'image/png', data };
}

export function insertText(
	textarea: HTMLTextAreaElement,
	text: string,
	options: { selectionStart?: number; selectionEnd?: number } = {}
) {
	if (!textarea || typeof textarea.value !== 'string') return null;
	const insertion = String(text ?? '');
	const start = textarea.selectionStart ?? textarea.value.length;
	const end = textarea.selectionEnd ?? start;
	textarea.focus();
	textarea.setRangeText(insertion, start, end, 'end');
	if (typeof options.selectionStart === 'number' && Number.isFinite(options.selectionStart)) {
		const offset = Math.max(0, Math.min(insertion.length, options.selectionStart));
		const finish =
			typeof options.selectionEnd === 'number' && Number.isFinite(options.selectionEnd)
				? Math.max(offset, Math.min(insertion.length, options.selectionEnd))
				: offset;
		textarea.setSelectionRange(start + offset, start + finish);
	}
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
	return textarea.selectionEnd;
}

export function continueList(event: KeyboardEvent) {
	if (
		event.key !== 'Enter' ||
		event.shiftKey ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.isComposing ||
		event.defaultPrevented
	)
		return false;
	const textarea = event.currentTarget || event.target;
	if (
		!(textarea instanceof HTMLTextAreaElement) ||
		textarea.selectionStart !== textarea.selectionEnd
	)
		return false;
	const cursor = textarea.selectionStart;
	const beginning = textarea.value.lastIndexOf('\n', cursor - 1) + 1;
	const nextLine = textarea.value.indexOf('\n', cursor);
	const end = nextLine === -1 ? textarea.value.length : nextLine;
	const line = textarea.value.slice(beginning, end);
	const marker = /^(\s*)([-+*]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/.exec(line);
	if (!marker || /\n/.test(marker[1])) return false;
	const prefixLength =
		marker[1].length + marker[2].length + marker[3].length + (marker[4]?.length || 0);
	if (cursor < beginning + prefixLength) return false;
	event.preventDefault();
	if (!marker[5].trim()) {
		textarea.setSelectionRange(beginning, end);
		insertText(textarea, marker[1]);
		return true;
	}
	let nextMarker = marker[2];
	if (/^\d/.test(nextMarker)) {
		const current = parseInt(nextMarker, 10);
		if (Number.isSafeInteger(current)) nextMarker = `${current + 1}${nextMarker.slice(-1)}`;
	}
	insertText(textarea, `\n${marker[1]}${nextMarker} ${marker[4] ? '[ ] ' : ''}`);
	return true;
}

export const templates = Object.freeze({
	equation: '$$\nx = y\n$$',
	fraction: '$$\n\\frac{a}{b}\n$$',
	sum: '$$\n\\sum_{i=1}^{n} x_i\n$$',
	matrix: '$$\n\\begin{bmatrix}\na & b \\\\\nc & d\n\\end{bmatrix}\n$$',
	loss: '$$\n\\mathcal{L}(\\theta) = \\frac{1}{N} \\sum_{i=1}^{N} \\left\\| f_\\theta(x_i) - y_i \\right\\|_2^2\n$$'
});
let katexPromise: Promise<void> | undefined;
export function loadKatex(): Promise<void> {
	if (typeof window === 'undefined' || window.katex) return Promise.resolve();
	return (katexPromise ??= new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = '/labbook/vendor/katex/katex.min.js';
		script.onload = () => resolve();
		script.onerror = () => {
			katexPromise = undefined;
			script.remove();
			reject(new Error('Equation rendering could not load.'));
		};
		document.head.appendChild(script);
	}));
}
