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
	finishTouchInteraction: () => {},
	touchEditorMode: () => "move",
	toggleTouchEditorMode: () => {},
	consumeTouchGestureClick: () => false,
	toggleTouchPanel: () => {},
	isTouchPanelOpen: () => false,
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
const resizableSelectedWorld = {
	...initialWorld,
	editor: { ...initialWorld.editor, open: true, selected: EntityId(8) },
};
const floorSelectedWorld = {
	...initialWorld,
	editor: { ...initialWorld.editor, open: true, selected: "floor" as const },
};

const tapActionButton = (button: TemplateResult, pointerId: number): void => {
	const target = new FakeHtmlElement();
	eventHandler<PointerEvent>(
		button,
		"pointerdown",
	)({
		pointerId,
		currentTarget: target,
		preventDefault: () => {},
		stopPropagation: () => {},
	} as unknown as PointerEvent);
	eventHandler<PointerEvent>(
		button,
		"pointerup",
	)({
		pointerId,
		currentTarget: target,
		preventDefault: () => {},
		stopPropagation: () => {},
	} as unknown as PointerEvent);
	eventHandler<MouseEvent>(
		button,
		"click",
	)({
		detail: 1,
		currentTarget: target,
		preventDefault: () => {},
		stopPropagation: () => {},
	} as unknown as MouseEvent);
};

describe("mobile controls", () => {
	test("activates a mode change once when pointer-up rerenders the button", () =>
		withHtmlElement(() => {
			let mode: "move" | "resize" = "move";
			let toggles = 0;
			const interaction = makeInteraction({
				touchEditorMode: () => mode,
				toggleTouchEditorMode: () => {
					toggles += 1;
					mode = mode === "move" ? "resize" : "move";
				},
			});
			const initialControls = mobileControlsTemplate({
				world: resizableSelectedWorld,
				interaction,
				dispatch: () => {},
			});
			const initialModeButton = findTemplate(initialControls, "RESIZE");
			if (initialModeButton === undefined)
				throw new Error("Missing Resize button");
			const initialTarget = new FakeHtmlElement();
			eventHandler<PointerEvent>(
				initialModeButton,
				"pointerdown",
			)({
				pointerId: 20,
				currentTarget: initialTarget,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as PointerEvent);
			eventHandler<PointerEvent>(
				initialModeButton,
				"pointerup",
			)({
				pointerId: 20,
				currentTarget: initialTarget,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as PointerEvent);

			const rerenderedControls = mobileControlsTemplate({
				world: resizableSelectedWorld,
				interaction,
				dispatch: () => {},
			});
			const rerenderedModeButton = findTemplate(rerenderedControls, "RESIZE");
			if (rerenderedModeButton === undefined)
				throw new Error("Missing rerendered Resize button");
			eventHandler<MouseEvent>(
				rerenderedModeButton,
				"click",
			)({
				detail: 1,
				currentTarget: new FakeHtmlElement(),
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as MouseEvent);

			expect(toggles).toBe(1);
			expect(String(mode)).toBe("resize");
		}));

	test("disables Done with no selection or active Edit Session", () =>
		withHtmlElement(() => {
			let finished = 0;
			const interaction = makeInteraction({
				finishTouchInteraction: () => {
					finished += 1;
				},
			});
			const controls = mobileControlsTemplate({
				world: {
					...initialWorld,
					editor: {
						...initialWorld.editor,
						open: true,
						selected: null,
					},
				},
				interaction,
				dispatch: () => {},
			});
			const done = findTemplate(controls, "DONE");
			if (done === undefined) throw new Error("Missing Done button");
			const className = done.values.find(
				(value): value is string =>
					typeof value === "string" && value.includes("touch-none"),
			);
			expect(className).toBeDefined();
			expect(className).not.toContain("active:");

			tapActionButton(done, 6);

			expect(finished).toBe(0);
		}));

	test("disables Resize for a selected Character", () =>
		withHtmlElement(() => {
			let toggles = 0;
			const controls = mobileControlsTemplate({
				world: selectedWorld,
				interaction: makeInteraction({
					toggleTouchEditorMode: () => {
						toggles += 1;
					},
				}),
				dispatch: () => {},
			});
			const resize = findTemplate(controls, "RESIZE");
			if (resize === undefined) throw new Error("Missing Resize button");
			const disabledIndex = resize.strings.findIndex((part) =>
				part.endsWith("?disabled="),
			);

			expect(resize.values[disabledIndex]).toBe(true);
			tapActionButton(resize, 21);
			expect(toggles).toBe(0);
		}));

	test("disables Move while the selected floor remains in Resize mode", () =>
		withHtmlElement(() => {
			let toggles = 0;
			const controls = mobileControlsTemplate({
				world: floorSelectedWorld,
				interaction: makeInteraction({
					touchEditorMode: () => "resize",
					toggleTouchEditorMode: () => {
						toggles += 1;
					},
				}),
				dispatch: () => {},
			});
			const move = findTemplate(controls, "MOVE");
			if (move === undefined) throw new Error("Missing Move button");
			const disabledIndex = move.strings.findIndex((part) =>
				part.endsWith("?disabled="),
			);

			expect(move.values[disabledIndex]).toBe(true);
			tapActionButton(move, 22);
			expect(toggles).toBe(0);
		}));

	test("keeps Done enabled for an unselected placement preview", () =>
		withHtmlElement(() => {
			let finished = 0;
			const interaction = makeInteraction({
				finishTouchInteraction: () => {
					finished += 1;
				},
			});
			const controls = mobileControlsTemplate({
				world: {
					...initialWorld,
					editor: {
						...initialWorld.editor,
						open: true,
						selected: null,
						editSession: {
							operation: {
								kind: "create",
								itemKind: "plant",
								position: { x: 500, y: 300 },
							},
							validity: { kind: "valid" },
							phase: "active",
						},
					},
				},
				interaction,
				dispatch: () => {},
			});
			const done = findTemplate(controls, "DONE");
			if (done === undefined) throw new Error("Missing Done button");

			tapActionButton(done, 5);

			expect(finished).toBe(1);
		}));

	test("completes a Done tap across a game re-render", () =>
		withHtmlElement(() => {
			let finished = 0;
			const interaction = makeInteraction({
				finishTouchInteraction: () => {
					finished += 1;
				},
			});
			const initial = mobileControlsTemplate({
				world: selectedWorld,
				interaction,
				dispatch: () => {},
			});
			const initialButton = findTemplate(initial, "DONE");
			if (initialButton === undefined) throw new Error("Missing Done button");
			const target = new FakeHtmlElement();
			eventHandler<PointerEvent>(
				initialButton,
				"pointerdown",
			)({
				pointerId: 7,
				currentTarget: target,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as PointerEvent);

			const rerendered = mobileControlsTemplate({
				world: selectedWorld,
				interaction,
				dispatch: () => {},
			});
			const rerenderedButton = findTemplate(rerendered, "DONE");
			if (rerenderedButton === undefined)
				throw new Error("Missing rerendered Done button");
			eventHandler<PointerEvent>(
				rerenderedButton,
				"pointerup",
			)({
				pointerId: 7,
				currentTarget: target,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as PointerEvent);
			eventHandler<MouseEvent>(
				rerenderedButton,
				"click",
			)({
				detail: 1,
				currentTarget: target,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as MouseEvent);

			expect(finished).toBe(1);
		}));

	test("opens Details once for a completed tap and its synthesized click", () =>
		withHtmlElement(() => {
			let opened = 0;
			const interaction = makeInteraction({
				openTouchDetails: () => {
					opened += 1;
				},
			});
			const controls = mobileControlsTemplate({
				world: selectedWorld,
				interaction,
				dispatch: () => {},
			});
			const details = findTemplate(controls, "DETAILS");
			if (details === undefined) throw new Error("Missing Details button");
			const target = new FakeHtmlElement();
			eventHandler<PointerEvent>(
				details,
				"pointerdown",
			)({
				pointerId: 8,
				currentTarget: target,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as PointerEvent);
			const rerenderedControls = mobileControlsTemplate({
				world: selectedWorld,
				interaction,
				dispatch: () => {},
			});
			const rerenderedDetails = findTemplate(rerenderedControls, "DETAILS");
			if (rerenderedDetails === undefined)
				throw new Error("Missing rerendered Details button");
			eventHandler<PointerEvent>(
				rerenderedDetails,
				"pointerup",
			)({
				pointerId: 8,
				currentTarget: target,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as PointerEvent);
			expect(opened).toBe(0);
			eventHandler<MouseEvent>(
				rerenderedDetails,
				"click",
			)({
				detail: 1,
				currentTarget: target,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as MouseEvent);

			expect(opened).toBe(1);
		}));

	test("opens Details from the native click fallback after capture is lost", () =>
		withHtmlElement(() => {
			let opened = 0;
			const interaction = makeInteraction({
				openTouchDetails: () => {
					opened += 1;
				},
			});
			const controls = mobileControlsTemplate({
				world: selectedWorld,
				interaction,
				dispatch: () => {},
			});
			const details = findTemplate(controls, "DETAILS");
			if (details === undefined) throw new Error("Missing Details button");
			const target = new FakeHtmlElement();
			eventHandler<PointerEvent>(
				details,
				"pointerdown",
			)({
				pointerId: 10,
				currentTarget: target,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as PointerEvent);
			eventHandler<PointerEvent>(
				details,
				"lostpointercapture",
			)({
				pointerId: 10,
				currentTarget: target,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as PointerEvent);
			eventHandler<MouseEvent>(
				details,
				"click",
			)({
				detail: 1,
				currentTarget: target,
				preventDefault: () => {},
				stopPropagation: () => {},
			} as unknown as MouseEvent);

			expect(opened).toBe(1);
		}));

	test("isolates Details pointer movement from the World gesture", () =>
		withHtmlElement(() => {
			const controls = mobileControlsTemplate({
				world: selectedWorld,
				interaction: makeInteraction(),
				dispatch: () => {},
			});
			const details = findTemplate(controls, "DETAILS");
			if (details === undefined) throw new Error("Missing Details button");
			const target = new FakeHtmlElement();
			let stopped = 0;
			const event = {
				pointerId: 12,
				currentTarget: target,
				preventDefault: () => {},
				stopPropagation: () => {
					stopped += 1;
				},
			} as unknown as PointerEvent;

			eventHandler<PointerEvent>(details, "pointerdown")(event);
			eventHandler<PointerEvent>(details, "pointermove")(event);
			eventHandler<PointerEvent>(details, "pointerup")(event);

			expect(stopped).toBe(3);
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
