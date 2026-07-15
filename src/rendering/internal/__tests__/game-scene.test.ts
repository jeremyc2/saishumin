import { describe, expect, test } from "bun:test";
import { editSessionPresentation } from "../../../design-studio/edit-session/edit-session";
import { makeDesignStudioView } from "../../../design-studio/view/view";
import { initialWorld } from "../../../world/initial-world";
import { gameSceneTemplate } from "../game-scene";

const interactionRuntime = {
	startPan: () => {},
	startEntityMove: () => {},
	startEntityResize: () => {},
	startFloorResize: () => {},
	startPaletteDrag: () => {},
	update: () => {},
	dismissPalettePopover: () => {},
	isPanGesture: () => false,
	isGestureActive: () => false,
	createPreview: () => null,
	palettePopover: () => null,
} as const;

describe("game scene", () => {
	test("composes the room scene without owning DOM rendering", () => {
		const scene = gameSceneTemplate({
			world: initialWorld,
			presentation: editSessionPresentation(initialWorld),
			dispatch: () => {},
			interactionRuntime,
			designStudioView: makeDesignStudioView(interactionRuntime),
			onRootPointerDown: () => {},
		});

		expect(scene.strings.join("")).toContain('id="world-canvas"');
		expect(scene.strings.join("")).toContain("SAISHUMIN");
		expect(scene.strings.join("")).toContain("data-floor-base");
		expect(scene.strings.join("")).not.toContain("document.");
	});
});
