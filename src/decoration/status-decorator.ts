import { Component, type App } from 'obsidian';
import type { Status } from '../status/types';

export type IndicatorStyle = 'icon' | 'bar' | 'badge' | 'bar-icon';

export const STATUS_ATTR = 'data-workholic-status';
export const INDICATOR_ATTR = 'data-workholic-indicator';
export const DIM_ATTR = 'data-workholic-dim';

const FILE_EXPLORER_VIEW_TYPE = 'file-explorer';
const ROW_SELECTOR = `.nav-file-title[data-path]`;

/**
 * Stamps each file explorer row with its status as a data attribute. All
 * styling then lives in `styles.css`, keyed off that attribute.
 *
 * The file explorer virtualizes its rows — off-screen files are detached from
 * the DOM and re-attached as the user scrolls — so a one-time sweep is not
 * enough. A MutationObserver catches rows as they appear, and also watches
 * `data-path` so a row that gets recycled or renamed is re-evaluated.
 *
 * This uses only public API: `getLeavesOfType` and `View.containerEl`.
 */
export class StatusDecorator extends Component {
	private observer: MutationObserver | null = null;
	private container: HTMLElement | null = null;
	private style: IndicatorStyle = 'icon';
	private enabled = true;
	private dim = true;

	constructor(
		private readonly app: App,
		private readonly resolve: (path: string) => Status | null,
	) {
		super();
	}

	override onload(): void {
		// The explorer may be deferred at startup, moved to a pop-out window,
		// or recreated when the user rearranges the workspace.
		this.registerEvent(
			this.app.workspace.on('layout-change', () => this.reattach()),
		);
	}

	override onunload(): void {
		this.disconnect();
	}

	configure(enabled: boolean, style: IndicatorStyle, dim: boolean): void {
		this.enabled = enabled;
		this.style = style;
		this.dim = dim;
		this.applyIndicatorStyle();
		this.refresh();
	}

	/** Re-evaluate every row currently in the DOM. */
	refresh(): void {
		this.reattach();

		const container = this.container;
		if (!container) return;

		container.querySelectorAll(ROW_SELECTOR).forEach((row) => {
			this.decorate(row);
		});
	}

	private reattach(): void {
		const container = this.findContainer();
		if (container === this.container) return;

		this.disconnect();
		if (!container) return;

		this.container = container;
		this.applyIndicatorStyle();

		const observer = new MutationObserver((mutations) =>
			this.onMutations(mutations),
		);
		observer.observe(container, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['data-path'],
		});
		this.observer = observer;

		container.querySelectorAll(ROW_SELECTOR).forEach((row) => {
			this.decorate(row);
		});
	}

	private onMutations(mutations: MutationRecord[]): void {
		for (const mutation of mutations) {
			if (mutation.type === 'attributes') {
				const target = mutation.target;
				// instanceOf, not instanceof: the explorer may live in a
				// pop-out window, whose Element differs from this realm's.
				if (target.instanceOf(Element)) this.decorate(target);
				continue;
			}

			mutation.addedNodes.forEach((node) => {
				if (!node.instanceOf(Element)) return;

				if (node.matches(ROW_SELECTOR)) this.decorate(node);
				node.querySelectorAll(ROW_SELECTOR).forEach((row) => {
					this.decorate(row);
				});
			});
		}
	}

	private decorate(row: Element): void {
		const path = row.getAttribute('data-path');
		const status = this.enabled && path ? this.resolve(path) : null;

		if (status === null) row.removeAttribute(STATUS_ATTR);
		else row.setAttribute(STATUS_ATTR, status);
	}

	private applyIndicatorStyle(): void {
		const container = this.container;
		if (!container) return;

		if (this.enabled) container.setAttribute(INDICATOR_ATTR, this.style);
		else container.removeAttribute(INDICATOR_ATTR);

		if (this.dim) container.setAttribute(DIM_ATTR, 'true');
		else container.removeAttribute(DIM_ATTR);
	}

	private findContainer(): HTMLElement | null {
		const leaf = this.app.workspace.getLeavesOfType(
			FILE_EXPLORER_VIEW_TYPE,
		)[0];

		// A deferred leaf holds a placeholder view with no rows to decorate.
		if (!leaf || leaf.isDeferred) return null;

		return leaf.view.containerEl;
	}

	private disconnect(): void {
		this.observer?.disconnect();
		this.observer = null;

		this.container?.removeAttribute(INDICATOR_ATTR);
		this.container?.removeAttribute(DIM_ATTR);
		this.container = null;
	}
}
