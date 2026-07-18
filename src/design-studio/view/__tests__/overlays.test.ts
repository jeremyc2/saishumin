import { describe, expect, test } from "bun:test";
import type { TemplateResult } from "lit-html";
import type { Action } from "../../../app/action";
import { EntityId } from "../../../world/entity-id";
import { initialWorld } from "../../../world/initial-world";
import {
	invalidPreviewDescription,
	makeDesignStudioOverlays,
} from "../overlays";

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

describe("Invalid Preview presentation", () => {
	test("explains why a floor resize cannot be committed", () => {
		expect(
			invalidPreviewDescription({
				rejectionReason: "floor-excludes-editor-item",
				invalidPlacementKind: "floor",
				occupiedSupport: false,
			}),
		).toBe("The floor plan must contain every existing object.");
	});

	test("explains when an item must be moved off its support", () => {
		expect(
			invalidPreviewDescription({
				rejectionReason: "occupied-support",
				invalidPlacementKind: "entity",
				occupiedSupport: true,
			}),
		).toBe(
			"Move every object off this platform before moving or shrinking it.",
		);
	});
});

describe("touch dialog dismissal", () => {
	test("keeps a completed dismiss tap valid across a game re-render", () => {
		const overlays = makeDesignStudioOverlays({} as never);
		const world = { ...initialWorld, readingSign: EntityId(1) };
		const actions: Array<Action> = [];
		const dispatch = (action: Action): void => {
			actions.push(action);
		};
		const initialDialog = overlays.signDialogTemplate(world, dispatch);
		eventHandler<PointerEvent>(
			initialDialog,
			"pointerdown",
		)({
			pointerId: 7,
		} as PointerEvent);

		const rerenderedDialog = overlays.signDialogTemplate(world, dispatch);
		eventHandler<PointerEvent>(
			rerenderedDialog,
			"pointerup",
		)({
			pointerId: 7,
		} as PointerEvent);

		expect(actions).toHaveLength(1);
	});

	test("ignores synthesized pointer clicks and keeps keyboard activation", () => {
		const overlays = makeDesignStudioOverlays({} as never);
		const world = { ...initialWorld, readingSign: EntityId(1) };
		const actions: Array<Action> = [];
		const dialog = overlays.signDialogTemplate(world, (action) => {
			actions.push(action);
		});
		let prevented = false;
		let propagationStopped = false;
		const click = eventHandler<MouseEvent>(dialog, "click");

		click({
			detail: 1,
			preventDefault: () => {
				prevented = true;
			},
			stopPropagation: () => {
				propagationStopped = true;
			},
		} as unknown as MouseEvent);
		expect(actions).toHaveLength(0);
		expect(prevented).toBe(true);
		expect(propagationStopped).toBe(true);

		click({ detail: 0 } as MouseEvent);
		expect(actions).toHaveLength(1);
	});
});
