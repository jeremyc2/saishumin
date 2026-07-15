import { describe, expect, test } from "bun:test";
import { initialWorld, playerEntity } from "../ecs/world";
import {
	Body,
	Decoration,
	DecorationKinds,
	Elevation,
	Position,
} from "./component";
import {
	autoPanCamera,
	contentEnvelope,
	contentEnvelopeIncludingPreview,
	floorResizePointerDelta,
	initialDesignStudioInteraction,
	isDesignStudioPanelVisible,
	movePalettePress,
	pressPaletteItem,
	releasePalettePress,
	visiblePalettePopover,
} from "./design-studio-interaction";
import { EditorItemKinds } from "./editor";
import { EntityId } from "./entity-id";

describe("Design Studio interaction", () => {
	test("activates a palette drag only after leaving the item rectangle expanded by 12 pixels", () => {
		const pressed = pressPaletteItem(initialDesignStudioInteraction, {
			itemKind: EditorItemKinds.Rug,
			pointer: { x: 150, y: 130 },
			itemBounds: { left: 100, top: 100, right: 200, bottom: 160 },
		});

		const withinHysteresis = movePalettePress(pressed, { x: 211, y: 172 });
		expect(withinHysteresis.activated).toBeNull();

		const outsideHysteresis = movePalettePress(withinHysteresis.state, {
			x: 213,
			y: 172,
		});
		expect(outsideHysteresis.activated).toEqual({
			itemKind: EditorItemKinds.Rug,
			pointer: { x: 213, y: 172 },
		});
	});

	test("derives Design Studio Panel visibility from the active Edit Session", () => {
		expect(isDesignStudioPanelVisible(initialWorld)).toBe(true);
		expect(
			isDesignStudioPanelVisible({
				...initialWorld,
				editor: {
					...initialWorld.editor,
					editSession: {
						operation: {
							kind: "create",
							itemKind: EditorItemKinds.Rug,
							position: Position.make({ x: 500, y: 300 }),
						},
						validity: { kind: "valid" },
						phase: "active",
					},
				},
			}),
		).toBe(false);
	});

	test("a shrinking resize preview cannot contract the committed auto-pan envelope", () => {
		const committed = {
			...initialWorld,
			positions: new Map([[playerEntity, Position.make({ x: 100, y: 100 })]]),
			bodies: new Map([[playerEntity, Body.make({ width: 54, depth: 34 })]]),
			obstacles: new Map(),
			decorations: new Map(),
			floorPlan: Body.make({ width: 1_000, depth: 600 }),
		};
		const preview = {
			...committed,
			floorPlan: Body.make({ width: 500, depth: 300 }),
		};

		expect(contentEnvelopeIncludingPreview(committed, preview)).toEqual(
			contentEnvelope(committed),
		);
	});

	test("shows stationary-click guidance for three seconds and fades during the final 200 milliseconds", () => {
		const itemBounds = { left: 100, top: 100, right: 200, bottom: 160 };
		const pressed = pressPaletteItem(initialDesignStudioInteraction, {
			itemKind: EditorItemKinds.Plant,
			pointer: { x: 150, y: 130 },
			itemBounds,
		});
		const released = releasePalettePress(pressed, 1_000);

		expect(visiblePalettePopover(released, 3_799)).toEqual({
			itemBounds,
			opacity: 1,
		});
		expect(visiblePalettePopover(released, 3_900)).toEqual({
			itemBounds,
			opacity: 0.5,
		});
		expect(visiblePalettePopover(released, 4_000)).toBeNull();
	});

	test("auto-pans at a frame-rate-independent 420 pixels per second at a viewport edge", () => {
		const input = {
			camera: { x: 0, y: 0 },
			pointer: { x: 800, y: 450 },
			viewport: { width: 800, height: 900 },
			envelope: { left: -500, top: -500, right: 1_500, bottom: 1_500 },
		};

		expect(autoPanCamera({ ...input, elapsedSeconds: 1 })).toEqual({
			x: -420,
			y: 0,
		});
		expect(autoPanCamera({ ...input, elapsedSeconds: 0.5 })).toEqual({
			x: -210,
			y: 0,
		});
	});

	test("keeps the auto-pan zone and speed in viewport pixels when the canvas is scaled", () => {
		expect(
			autoPanCamera({
				camera: { x: 0, y: 0 },
				pointer: { x: 800, y: 450 },
				viewport: { width: 800, height: 900 },
				scale: { x: 0.5, y: 0.5 },
				envelope: { left: -2_000, top: -2_000, right: 3_000, bottom: 3_000 },
				elapsedSeconds: 1,
			}),
		).toEqual({ x: -840, y: 0 });
	});

	test("does not move the camera while the pointer is outside every auto-pan edge zone", () => {
		expect(
			autoPanCamera({
				camera: { x: 1_000, y: 1_000 },
				pointer: { x: 400, y: 450 },
				viewport: { width: 800, height: 900 },
				envelope: { left: -500, top: -500, right: 1_500, bottom: 1_500 },
				elapsedSeconds: 1 / 60,
			}),
		).toEqual({ x: 1_000, y: 1_000 });
	});

	test("auto-pans toward an envelope edge when the content is smaller than the viewport", () => {
		expect(
			autoPanCamera({
				camera: { x: 0, y: 0 },
				pointer: { x: 800, y: 450 },
				viewport: { width: 800, height: 900 },
				envelope: { left: 150, top: 100, right: 650, bottom: 800 },
				elapsedSeconds: 1,
			}),
		).toEqual({ x: -54, y: 0 });
	});

	test("eases a manually panned camera back into the auto-pan envelope without snapping", () => {
		const input = {
			camera: { x: 1_000, y: 0 },
			viewport: { width: 800, height: 900 },
			envelope: { left: -500, top: -500, right: 1_500, bottom: 1_500 },
			elapsedSeconds: 1 / 60,
		};

		expect(autoPanCamera({ ...input, pointer: { x: 800, y: 450 } })).toEqual({
			x: 993,
			y: 0,
		});
		expect(autoPanCamera({ ...input, pointer: { x: 0, y: 450 } })).toEqual({
			x: 1_000,
			y: 0,
		});
	});

	test("keeps a floor resize stationary when the screen pointer has not moved", () => {
		const camera = { x: -240, y: 80 };
		const screenPointer = { x: 300, y: 200 };
		const startPointer = {
			x: screenPointer.x - camera.x,
			y: screenPointer.y - camera.y,
		};

		expect(
			floorResizePointerDelta(startPointer, screenPointer, camera),
		).toEqual({ x: 0, y: 0 });
	});

	test("includes a tall elevated Editor Item in the auto-pan content envelope", () => {
		const entity = EntityId(900);
		const world = {
			...initialWorld,
			positions: new Map([
				[
					playerEntity,
					initialWorld.positions.get(playerEntity) ??
						Position.make({ x: 0, y: 0 }),
				],
				[entity, Position.make({ x: 500, y: 300 })],
			]),
			bodies: new Map([
				[
					playerEntity,
					initialWorld.bodies.get(playerEntity) ??
						Body.make({ width: 54, depth: 34 }),
				],
				[entity, Body.make({ width: 100, depth: 100 })],
			]),
			obstacles: new Map(),
			decorations: new Map([
				[entity, Decoration.make({ kind: DecorationKinds.Sign, height: 240 })],
			]),
			elevations: new Map([[entity, Elevation.make({ z: 100, velocity: 0 })]]),
		};

		expect(contentEnvelope(world).top).toBeCloseTo(56.78, 2);
	});
});
