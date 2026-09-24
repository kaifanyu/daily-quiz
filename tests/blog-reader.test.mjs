import assert from 'node:assert/strict';
import test from 'node:test';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
	imageWidth,
	ReadingImage,
	ReadingLink,
	safeBlogUrl
} from '../src/lib/components/notes/reading-extensions.ts';

const schema = getSchema([StarterKit.configure({ link: false }), ReadingLink, ReadingImage]);
const element = (attributes = {}, style = {}) => ({
	getAttribute: (name) => attributes[name] ?? null,
	style
});
const unsafeUrls = [
	'javascript:alert(1)',
	'JaVaScRiPt:alert(1)',
	' \tjavascript:alert(1)',
	'java\nscript:alert(1)',
	'java\tscript:alert(1)',
	'\u0000javascript:alert(1)',
	'vbscript:msgbox(1)',
	'data:text/html,<script>alert(1)</script>',
	'data:image/svg+xml,<svg onload="alert(1)"/>',
	'file:///etc/passwd',
	'blob:https://example.org/1234',
	'about:blank'
];

test('blog URL validation rejects active and local schemes, including disguised JavaScript', () => {
	for (const url of unsafeUrls) {
		assert.equal(safeBlogUrl(url), null, url);
		assert.equal(safeBlogUrl(url, true), null, url);
	}
	for (const value of ['', '   ', null, undefined, 123, {}, []]) {
		assert.equal(safeBlogUrl(value), null);
	}
});

test('ordinary web links and images remain usable and email links cannot become images', () => {
	assert.equal(
		safeBlogUrl('https://example.org/paper?q=a&b=c'),
		'https://example.org/paper?q=a&b=c'
	);
	assert.equal(
		safeBlogUrl('http://example.org/diagram.png', true),
		'http://example.org/diagram.png'
	);
	assert.equal(safeBlogUrl('mailto:author@example.org'), 'mailto:author@example.org');
	assert.equal(safeBlogUrl('mailto:author@example.org', true), null);
	assert.equal(
		safeBlogUrl('https://example.org/figure name.png', true),
		'https://example.org/figure%20name.png'
	);
});

test('relative blog URLs resolve against the reading site origin', (t) => {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
	Object.defineProperty(globalThis, 'window', {
		value: { location: { origin: 'https://research.example.org' } },
		configurable: true
	});
	t.after(() => {
		if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
		else delete globalThis.window;
	});
	assert.equal(safeBlogUrl('/blogs/post-1'), 'https://research.example.org/blogs/post-1');
	assert.equal(
		safeBlogUrl('/images/figure.png', true),
		'https://research.example.org/images/figure.png'
	);
	assert.equal(
		safeBlogUrl('//images.example.org/figure.png', true),
		'https://images.example.org/figure.png'
	);
});

test('image width accepts bounded dimensions and rejects CSS expressions or declarations', () => {
	for (const [input, expected] of [
		[320, 320],
		['320px', 320],
		['320.6px', 321],
		[' 480 ', 480],
		[5000, 5000]
	]) {
		assert.equal(imageWidth(input), expected);
	}
	for (const width of [
		0,
		-5,
		5001,
		Number.POSITIVE_INFINITY,
		Number.NaN,
		null,
		undefined,
		'',
		'100%',
		'calc(100vw)',
		'expression(alert(1))',
		'url(javascript:alert(1))',
		'100px; position:fixed; inset:0',
		'100px;background:url(https://example.org/track)',
		'1e3',
		'320" onload="alert(1)'
	]) {
		assert.equal(imageWidth(width), null, String(width));
	}
});

test('the image HTML parser refuses executable sources before creating a node', () => {
	const rule = ReadingImage.config.parseHTML()[0];
	assert.deepEqual(rule.getAttrs(element({ src: 'https://example.org/figure.png' })), {});
	for (const src of unsafeUrls) assert.equal(rule.getAttrs(element({ src })), false, src);
	assert.equal(rule.getAttrs(element({ src: 'mailto:author@example.org' })), false);
	assert.equal(rule.getAttrs(element()), false);
});

test('actual image schema rendering preserves source, width, alignment and captions', () => {
	const node = schema.nodes.image.create({
		src: 'https://example.org/figure.png',
		width: 420,
		align: 'right',
		alt: 'A feedback loop',
		title: 'Figure 1'
	});
	const rendered = schema.nodes.image.spec.toDOM(node);
	assert.deepEqual(rendered, [
		'img',
		{
			src: 'https://example.org/figure.png',
			alt: 'A feedback loop',
			title: 'Figure 1',
			width: 420,
			'data-align': 'right',
			loading: 'lazy',
			decoding: 'async',
			draggable: 'false'
		}
	]);
	assert.equal(ReadingImage.options.resize, false);
	assert.equal(ReadingImage.options.allowBase64, false);
});

test('image output projects a safe attribute list instead of copying stored HTML attributes', () => {
	const attributes = {
		src: 'https://example.org/figure.png',
		alt: 'Normal caption',
		onerror: 'alert(1)',
		onload: 'alert(1)',
		style: 'position:fixed;inset:0',
		srcset: 'data:image/svg+xml,<svg/onload=alert(1)> 2x',
		class: 'fake-login',
		id: 'login',
		width: '100px;position:fixed',
		'data-align': 'left; background:url(javascript:alert(1))',
		draggable: 'true',
		formaction: 'javascript:alert(1)'
	};
	const original = structuredClone(attributes);
	const rendered = ReadingImage.config.renderHTML({ HTMLAttributes: attributes });
	assert.equal(rendered[0], 'img');
	assert.deepEqual(Object.keys(rendered[1]).sort(), [
		'alt',
		'data-align',
		'decoding',
		'draggable',
		'loading',
		'src'
	]);
	assert.equal(rendered[1]['data-align'], 'center');
	assert.equal(rendered[1].draggable, 'false');
	assert.deepEqual(attributes, original);
	for (const src of unsafeUrls) {
		const image = ReadingImage.config.renderHTML({ HTMLAttributes: { src, onerror: 'alert(1)' } });
		assert.equal(Object.hasOwn(image[1], 'src'), false, src);
		assert.equal(Object.hasOwn(image[1], 'onerror'), false, src);
	}
});

test('actual link schema rendering overrides stored target, rel and class with safe attributes', () => {
	const mark = schema.marks.link.create({
		href: 'https://example.org/paper',
		target: '_self',
		rel: 'opener',
		class: 'fake-login',
		title: 'Original paper'
	});
	const rendered = schema.marks.link.spec.toDOM(mark, true);
	assert.deepEqual(rendered, [
		'a',
		{
			href: 'https://example.org/paper',
			target: '_blank',
			rel: 'noopener noreferrer',
			title: 'Original paper'
		},
		0
	]);
});

test('links cannot render executable hrefs or event, style and navigation attributes', () => {
	for (const href of unsafeUrls) {
		assert.equal(ReadingLink.options.isAllowedUri(href), false);
		const rendered = ReadingLink.config.renderHTML({
			HTMLAttributes: {
				href,
				onclick: 'alert(1)',
				style: 'position:fixed',
				target: 'owner-window',
				rel: 'opener',
				ping: 'https://example.org/track',
				download: 'dangerous.html'
			}
		});
		assert.deepEqual(rendered, ['a', { target: '_blank', rel: 'noopener noreferrer' }, 0]);
	}
	const rendered = ReadingLink.config.renderHTML({
		HTMLAttributes: {
			href: 'https://example.org',
			onclick: 'alert(1)',
			title: '"><img src=x onerror=alert(1)>'
		}
	});
	assert.equal(rendered[0], 'a');
	assert.equal(rendered[1].href, 'https://example.org/');
	assert.equal(rendered[1].title, '"><img src=x onerror=alert(1)>');
	assert.deepEqual(Object.keys(rendered[1]).sort(), ['href', 'rel', 'target', 'title']);
	// Tiptap passes the title as an attribute value to the DOM serializer, never as raw HTML.
	assert.equal(rendered[2], 0);
});
