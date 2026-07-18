import { describe, expect, test } from "bun:test";
import type { TemplateResult } from "lit-html";
import type { DesignStudioInteraction } from "../../../design-studio/interaction/interaction";
import { EntityId } from "../../../world/entity-id";
import { initialWorld } from "../../../world/initial-world";
import { mobileControlsTemplate } from "../mobile-controls";

const templateResult = (value: unknown): TemplateResult | undefined => {
	if (value === null || typeof value !== "object") return undefined;
	if (!("strings" in value) || !("values" in value)) return undefined;
	return value as TemplateResult;
};

const findTemplate = (
	value: unknown,
	marker: string,
): TemplateResult | undefined => {
	const template = templateResult(value);
	if (template === undefined) return undefined;
	if (
		template.strings.join("").includes(marker) ||
		template.values.includes(marker)
	)
		return template;
	for (const child of template.values) {
		if (Array.isArray(child)) {
			for (const item of child) {
				const found = findTemplate(item, marker);
				if (found !== undefined) return found;
			}
			continue;
		}
		const found = findTemplate(child, marker);
		if (found !== undefined) return found;
	}
	return undefined;
};

const eventHandler = <Event>(
	template: TemplateResult,
	eventName: string,
): ((event: Event) => void) => {
	const index = template.strings.findIndex((part) =>
		part.endsWith(`@${eventName}=`),
	);
	const handler = template.values[index];
	if (typeof handler !== "function")
		throw new Error(`Missing ${eventName} handler`);
	return handler as (event: Event) => void;
};

class FakeHtmlElement {
	readonly dataset: Record<string, string | undefined> = {};
	readonly style = { setProperty: () => {} };
	readonly capturedPointers = new Set<number>();
	setPointerCapture(pointerId: number): void {
		this.capturedPointers.add(pointerId);
	}
	hasPointerCapture(pointerId: number): boolean {
		return this.capturedPointers.has(pointerId);
	}
	getBoundingClientRect() {
		return { left: 0, top: 0, width: 128, height: 128 };
	}
}

const withHtmlElement = <Result>(run: () => Result): Result => {
	const original = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
	Object.defineProperty(globalThis, "HTMLElement", {
		configurable: true,
		value: FakeHtmlElement,
	});
	try {
		return run();
	} finally {
		if (original === undefined)
			delete (globalThis as unknown as Record<string, unknown>)["HTMLElement"];
		else Object.defineProperty(globalThis, "HTMLElement", original);
	}
};

const makeInteraction = (
	overrides: Partial<DesignStudioInteraction> = {},
): DesignStudioInteraction => ({
	startPan: () => {},
	startEntityMove: () => {},
	startEntityResize: () => {},
	startFloorResize: () => {},
	startPaletteDrag: () => {},
	startTouchPalettePlacement: () => {},
	selectTouchEntity: () => {},
	updateTouchJoystick: () => {},
	commitTouchEdit: () => {},
	cancelTouchSelection: () => {},
	touchEditorMode: () => "move",
	toggleTouchEditorMode: () => {},
	consumeTouchGestureClick: () => false,
	toggleTouchPanel: () => {},
	isTouchPanelOpen: () => false,
	isTouchEditActive: () => false,
	openTouchDetails: () => {},
	closeTouchDetails: () => {},
	isTouchDetailsOpen: () => false,
	usesTouchControls: () => true,
	zoom: () => 1,
	zoomAt: () => {},
	update: () => {},
	dismissPalettePopover: () => {},
	isPanGesture: () => false,
	isGestureActive: () => false,
	createPreview: () => null,
	palettePopover: () => null,
	...overrides,
});

const selectedWorld = {
	...initialWorld,
	editor: { ...initialWorld.editor, open: true, selected: EntityId(2) },
};

describe("mobile controls", () => {
	test("completes an action-button tap across a game re-render", () =>
		withHtmlElement(() => {
			let cancelled = 0;
			const interaction = makeInteraction({
				cancelTouchSelection: () => {
					cancelled += 1;
				},
			});
			const initial = mobileControlsTemplate({
				world: selectedWorld,
				interaction,
				dispatch: () => {},
			});
			const initialButton = findTemplate(initial, "CANCEL");
			if (initialButton === undefined) throw new Error("Missing Cancel button");
			const target = new FakeHtmlElement();
			eventHandler<PointerEvent>(
				initialButton,
				"pointerdown",
			)({
				pointerId: 7,
				currentTarget: target,
				preventDefault: () => {},
			} as unknown as PointerEvent);

			const rerendered = mobileControlsTemplate({
				world: selectedWorld,
				interaction,
				dispatch: () => {},
			});
			const rerenderedButton = findTemplate(rerendered, "CANCEL");
			if (rerenderedButton === undefined)
				throw new Error("Missing rerendered Cancel button");
			eventHandler<PointerEvent>(
				rerenderedButton,
				"pointerup",
			)({
				pointerId: 7,
				currentTarget: target,
				preventDefault: () => {},
			} as unknown as PointerEvent);

			expect(cancelled).toBe(1);
		}));

	test("releases the joystick across a game re-render", () =>
		withHtmlElement(() => {
			const updates: Array<{ pointerId: number; vector: unknown }> = [];
			const interaction = makeInteraction({
				updateTouchJoystick: (input) => {
					updates.push(input);
				},
			});
			const initial = mobileControlsTemplate({
				world: selectedWorld,
				interaction,
				dispatch: () => {},
			});
			const initialJoystick = findTemplate(
				initial,
				'aria-label="Movement joystick"',
			);
			if (initialJoystick === undefined) throw new Error("Missing joystick");
			const target = new FakeHtmlElement();
			eventHandler<PointerEvent>(
				initialJoystick,
				"pointerdown",
			)({
				pointerId: 9,
				clientX: 100,
				clientY: 64,
				currentTarget: target,
				preventDefault: () => {},
			} as unknown as PointerEvent);

			const rerendered = mobileControlsTemplate({
				world: selectedWorld,
				interaction,
				dispatch: () => {},
			});
			const rerenderedJoystick = findTemplate(
				rerendered,
				'aria-label="Movement joystick"',
			);
			if (rerenderedJoystick === undefined)
				throw new Error("Missing rerendered joystick");
			eventHandler<PointerEvent>(
				rerenderedJoystick,
				"pointerup",
			)({
				pointerId: 9,
				currentTarget: target,
				preventDefault: () => {},
			} as unknown as PointerEvent);

			expect(updates.length).toBe(2);
			expect(updates[0]?.vector).not.toBeNull();
			expect(updates[1]).toEqual({ pointerId: 9, vector: null });
		}));
});
