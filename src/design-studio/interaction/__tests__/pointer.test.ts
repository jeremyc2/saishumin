import { describe, expect, test } from "bun:test";
import {
	autoPanCamera,
	initialDesignStudioInteraction,
	movePalettePress,
	pressPaletteItem,
} from "../pointer";
import { EditorItemKinds } from "../../model";

describe("Design Studio pointer interaction", () => {
	test("activates a palette drag only after leaving the item rectangle expanded by 12 pixels", () => {
		const pressed = pressPaletteItem(initialDesignStudioInteraction, {
			itemKind: EditorItemKinds.Hopscotch,
			pointer: { x: 150, y: 130 },
			itemBounds: { left: 100, top: 100, right: 200, bottom: 160 },
		});

		expect(movePalettePress(pressed, { x: 211, y: 172 }).activated).toBeNull();
		expect(movePalettePress(pressed, { x: 213, y: 172 }).activated).toEqual({
			itemKind: EditorItemKinds.Hopscotch,
			pointer: { x: 213, y: 172 },
		});
	});

	test("auto-pans at a frame-rate-independent 420 pixels per second at a viewport edge", () => {
		const input = {
			camera: { x: 0, y: 0 },
			pointer: { x: 800, y: 450 },
			viewport: { width: 800, height: 900 },
			envelope: { left: -500, top: -500, right: 1_500, bottom: 1_500 },
		};

		expect(autoPanCamera({ ...input, elapsedSeconds: 0.5 })).toEqual({
			x: -210,
			y: 0,
		});
	});
});
