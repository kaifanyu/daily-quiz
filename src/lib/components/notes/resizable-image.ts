import Image from '@tiptap/extension-image';
import type { NodeViewRendererProps } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

export type ImageAlign = 'left' | 'center' | 'right';

/**
 * Image with drag-to-resize and left/center/right alignment, Google-Docs style.
 * `width` (px) and `align` are stored as attributes so they survive save/reload.
 * The node view manages its own DOM (a wrapper that aligns the image + a resize
 * handle); resizing commits a single transaction on pointer-up.
 */
export const ResizableImage = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			width: {
				default: null,
				parseHTML: (el: HTMLElement) => {
					const raw = el.getAttribute('width') || el.style.width;
					if (!raw) return null;
					const n = parseInt(raw, 10);
					return Number.isFinite(n) ? n : raw;
				},
				renderHTML: (attrs: { width?: number | string | null }) =>
					attrs.width ? { width: `${attrs.width}` } : {}
			},
			align: {
				default: 'center',
				parseHTML: (el: HTMLElement) => el.getAttribute('data-align') || 'center',
				renderHTML: (attrs: { align?: string }) => ({ 'data-align': attrs.align ?? 'center' })
			}
		};
	},

	addNodeView() {
		return (props: NodeViewRendererProps) => {
			const { editor, getPos } = props;
			let node = props.node;

			const dom = document.createElement('div');
			dom.className = 'ri-wrap';
			dom.style.textAlign = node.attrs.align ?? 'center';

			const container = document.createElement('div');
			container.className = 'ri-container';

			const applyWidth = (w: number | string | null) => {
				container.style.width = w == null ? '' : typeof w === 'number' ? `${w}px` : w;
			};
			applyWidth(node.attrs.width);

			const img = document.createElement('img');
			img.src = node.attrs.src;
			img.alt = node.attrs.alt ?? '';
			img.draggable = false;
			container.appendChild(img);

			const handle = document.createElement('span');
			handle.className = 'ri-handle';
			handle.setAttribute('contenteditable', 'false');
			container.appendChild(handle);

			dom.appendChild(container);

			let startX = 0;
			let startW = 0;
			let resizing = false;

			const onMove = (e: PointerEvent) => {
				if (!resizing) return;
				const w = Math.max(60, Math.round(startW + (e.clientX - startX)));
				container.style.width = `${w}px`;
			};
			const onUp = () => {
				if (!resizing) return;
				resizing = false;
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
				const w = Math.round(container.getBoundingClientRect().width);
				const pos = typeof getPos === 'function' ? getPos() : null;
				if (pos != null) editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'width', w));
			};
			handle.addEventListener('pointerdown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				resizing = true;
				startX = e.clientX;
				startW = container.getBoundingClientRect().width;
				window.addEventListener('pointermove', onMove);
				window.addEventListener('pointerup', onUp);
			});

			return {
				dom,
				update: (updated: PMNode) => {
					if (updated.type.name !== node.type.name) return false;
					node = updated;
					dom.style.textAlign = updated.attrs.align ?? 'center';
					applyWidth(updated.attrs.width);
					if (img.getAttribute('src') !== updated.attrs.src) img.src = updated.attrs.src;
					img.alt = updated.attrs.alt ?? '';
					return true;
				},
				stopEvent: () => resizing,
				ignoreMutation: () => true,
				destroy: () => {
					window.removeEventListener('pointermove', onMove);
					window.removeEventListener('pointerup', onUp);
				}
			};
		};
	}
});
