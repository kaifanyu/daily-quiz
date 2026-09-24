import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';

/** Only ordinary web URLs are used as images; links can also open email clients. */
export function safeBlogUrl(value: unknown, image = false): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	try {
		const base = typeof window === 'undefined' ? 'https://labbook.invalid' : window.location.origin;
		const url = new URL(value, base);
		const allowed = image ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:'];
		return allowed.includes(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}
const alignment = (value: unknown) =>
	['left', 'center', 'right'].includes(String(value)) ? String(value) : 'center';
export function imageWidth(value: unknown): number | null {
	const source = String(value ?? '').trim();
	if (!/^\d+(?:\.\d+)?(?:px)?$/.test(source)) return null;
	const width = Number.parseFloat(source);
	return Number.isFinite(width) && width > 0 && width <= 5000 ? Math.round(width) : null;
}

/** Schema projection creates fresh, allowed DOM; stored event/style attributes never survive. */
export const ReadingImage = Image.extend({
	draggable: false,
	addAttributes() {
		return {
			...this.parent?.(),
			width: {
				default: null,
				parseHTML: (element) => imageWidth(element.getAttribute('width') || element.style.width)
			},
			align: {
				default: 'center',
				parseHTML: (element) => alignment(element.getAttribute('data-align'))
			}
		};
	},
	parseHTML() {
		return [
			{
				tag: 'img[src]',
				getAttrs: (element) => (safeBlogUrl(element.getAttribute('src'), true) ? {} : false)
			}
		];
	},
	renderHTML({ HTMLAttributes }) {
		const src = safeBlogUrl(HTMLAttributes.src, true);
		return [
			'img',
			{
				...(src ? { src } : {}),
				alt: typeof HTMLAttributes.alt === 'string' ? HTMLAttributes.alt : '',
				...(typeof HTMLAttributes.title === 'string' ? { title: HTMLAttributes.title } : {}),
				...(imageWidth(HTMLAttributes.width) ? { width: imageWidth(HTMLAttributes.width) } : {}),
				'data-align': alignment(HTMLAttributes['data-align'] ?? HTMLAttributes.align),
				loading: 'lazy',
				decoding: 'async',
				draggable: 'false'
			}
		];
	}
}).configure({ resize: false, allowBase64: false });

export const ReadingLink = Link.extend({
	renderHTML({ HTMLAttributes }) {
		const href = safeBlogUrl(HTMLAttributes.href);
		return [
			'a',
			{
				...(href ? { href } : {}),
				target: '_blank',
				rel: 'noopener noreferrer',
				...(typeof HTMLAttributes.title === 'string' ? { title: HTMLAttributes.title } : {})
			},
			0
		];
	}
}).configure({
	openOnClick: true,
	autolink: false,
	isAllowedUri: (value) => safeBlogUrl(value) !== null
});
