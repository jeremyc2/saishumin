import { describe, expect, test } from "bun:test";
import { editSessionStatus } from "../../../design-studio/edit-session/edit-session";
import {
	editorEntitySelectionBody,
	makeDesignStudioView,
} from "../../../design-studio/view/view";
import {
	Body,
	Character,
	CharacterKinds,
	Decoration,
	DecorationKinds,
	Obstacle,
	ObstacleKinds,
	PlayerFacings,
	Position,
} from "../../../world/components";
import { EntityId } from "../../../world/entity-id";
import { initialWorld } from "../../../world/initial-world";
import { playerBody } from "../../../world/world";
import { gameSceneTemplate } from "../game-scene";
import { mobileControlsTemplate } from "../mobile-controls";

const interaction = {
	startPan: () => {},
	startEntityMove: () => {},
	startEntityResize: () => {},
	startFloorResize: () => {},
	startPaletteDrag: () => {},
	startTouchPalettePlacement: () => {},
	startTouchEntityMove: () => {},
	selectTouchEntity: () => {},
	updateTouchJoystick: () => {},
	commitTouchEdit: () => {},
	cancelTouchSelection: () => {},
	touchEditorMode: () => "move" as const,
	toggleTouchEditorMode: () => {},
	toggleTouchPanel: () => {},
	isTouchPanelOpen: () => true,
	isTouchEditActive: () => false,
	openTouchDetails: () => {},
	closeTouchDetails: () => {},
	isTouchDetailsOpen: () => false,
	usesTouchControls: () => false,
	zoom: () => 1,
	zoomAt: () => {},
	update: () => {},
	dismissPalettePopover: () => {},
	isPanGesture: () => false,
	isGestureActive: () => false,
	createPreview: () => null,
	palettePopover: () => null,
} as const;

const flattenedTemplate = (value: unknown): string => {
	if (Array.isArray(value)) return value.map(flattenedTemplate).join("");
	if (value === null || value === undefined) return "";
	if (typeof value !== "object") return String(value);
	if (!("strings" in value) || !("values" in value)) return "";
	const template = value as {
		readonly strings: ReadonlyArray<string>;
		readonly values: ReadonlyArray<unknown>;
	};
	return template.strings
		.map(
			(part, index) =>
				part +
				(index < template.values.length
					? flattenedTemplate(template.values[index])
					: ""),
		)
		.join("");
};

describe("game scene", () => {
	test("keeps a plant selection outline around its visual ground footprint", () => {
		const plant = EntityId(50);
		const position = Position.make({ x: 500, y: 300 });
		const body = Body.make({ width: 72, depth: 72 });
		const artworkScale = (body.width + body.depth) / 140;
		const visualFootprint = Body.make({
			width: 52 * artworkScale,
			depth: (18 * artworkScale) / Math.SQRT1_2,
		});
		const world = {
			...initialWorld,
			positions: new Map([[plant, position]]),
			bodies: new Map([[plant, body]]),
			decorations: new Map([
				[plant, Decoration.make({ kind: DecorationKinds.Plant, height: 84 })],
			]),
			characters: new Map(),
			editor: { ...initialWorld.editor, open: true, selected: plant },
		};
		expect(editorEntitySelectionBody({ world, entity: plant })).toEqual(
			visualFootprint,
		);
	});

	test("paints an elevated Character Spawn after its supporting platform", () => {
		const player = EntityId(1);
		const platform = EntityId(2);
		const position = Position.make({ x: 500, y: 300 });
		const platformBody = Body.make({ width: 260, depth: 180 });
		const world = {
			...initialWorld,
			positions: new Map([
				[player, position],
				[platform, position],
			]),
			bodies: new Map([
				[player, playerBody],
				[platform, platformBody],
			]),
			obstacles: new Map([
				[platform, Obstacle.make({ kind: ObstacleKinds.Platform, height: 48 })],
			]),
			decorations: new Map(),
			characters: new Map([
				[
					player,
					Character.make({
						kind: CharacterKinds.Player,
						facing: PlayerFacings.Down,
					}),
				],
			]),
			characterSpawns: new Map([[player, position]]),
			editor: { ...initialWorld.editor, open: true },
		};
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world,
				editSessionStatus: editSessionStatus(world),
				dispatch: () => {},
				interaction,
				designStudioView: makeDesignStudioView(interaction),
				onRootPointerDown: () => {},
			}),
		);
		const platformIndex = scene.indexOf("#77927e");
		const spawnIndex = scene.indexOf("data-character-spawn=player");

		expect(platformIndex).toBeGreaterThan(-1);
		expect(spawnIndex).toBeGreaterThan(-1);
		expect(spawnIndex).toBeGreaterThan(platformIndex);
	});

	test("composes the room scene without owning DOM rendering", () => {
		const scene = gameSceneTemplate({
			world: initialWorld,
			editSessionStatus: editSessionStatus(initialWorld),
			dispatch: () => {},
			interaction,
			designStudioView: makeDesignStudioView(interaction),
			onRootPointerDown: () => {},
		});

		expect(scene.strings.join("")).toContain('id="world-canvas"');
		expect(scene.strings.join("")).toContain("SAISHUMIN");
		expect(scene.strings.join("")).toContain("data-floor-base");
		expect(scene.strings.join("")).not.toContain("document.");
	});

	test("includes touch controls and fills narrow screens during play", () => {
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world: initialWorld,
				editSessionStatus: editSessionStatus(initialWorld),
				dispatch: () => {},
				interaction,
				designStudioView: makeDesignStudioView(interaction),
				onRootPointerDown: () => {},
			}),
		);

		const controls = flattenedTemplate(
			mobileControlsTemplate({
				world: initialWorld,
				interaction,
				dispatch: () => {},
			}),
		);
		expect(scene).toContain("preserveAspectRatio=xMidYMid slice");
		expect(scene).toContain("Movement joystick");
		expect(scene).toContain("Grab or interact");
		expect(scene).toContain("Jump");
		expect(scene).toContain("EDIT");
		expect(controls).toContain("Touch controls");
		expect(controls).toContain("Movement joystick");
		expect(controls).toContain("Action controls");
		expect(controls).toContain("bottom-0 left-0");
		expect(controls).toContain("top-0 right-0");
		expect(controls).toContain("size-16");
		expect(controls).toContain("text-2xl");
		expect(controls).not.toContain("max-[380px]:rounded-[0.85rem]");
		expect(controls).not.toContain("activePointer === event.pointerId");
	});

	test("keeps the full canvas visible while editing", () => {
		const world = {
			...initialWorld,
			editor: { ...initialWorld.editor, open: true },
		};
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world,
				editSessionStatus: editSessionStatus(world),
				dispatch: () => {},
				interaction,
				designStudioView: makeDesignStudioView(interaction),
				onRootPointerDown: () => {},
			}),
		);

		expect(scene).toContain("preserveAspectRatio=xMidYMid meet");
		expect(scene).toContain("any-pointer-coarse:translate-y-0");
		expect(scene).toContain("TAP TO PLACE");
		expect(scene).toContain("Objects");
		expect(scene).toContain("any-pointer-coarse:landscape:grid-cols-4");
		expect(scene).not.toContain(" gap-2 landscape:grid-cols-4");
		expect(scene).not.toContain("data-panel-visible");
		expect(scene).not.toContain("Grab or interact");
	});

	test("shows Place and Cancel while a touch edit is active", () => {
		const world = {
			...initialWorld,
			editor: {
				...initialWorld.editor,
				open: true,
				editSession: {
					operation: {
						kind: "create" as const,
						itemKind: "crate" as const,
						position: { x: 500, y: 300 },
					},
					validity: { kind: "valid" as const },
					phase: "active" as const,
				},
			},
		};
		const touchInteraction = {
			...interaction,
			isTouchPanelOpen: () => false,
			isTouchEditActive: () => true,
		};
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world,
				editSessionStatus: editSessionStatus(world),
				dispatch: () => {},
				interaction: touchInteraction,
				designStudioView: makeDesignStudioView(touchInteraction),
				onRootPointerDown: () => {},
			}),
		);

		expect(scene).toContain("Movement joystick");
		expect(scene).toContain("PLACE");
		expect(scene).toContain("CANCEL");
		expect(scene).not.toContain("Grab or interact");
	});

	test("offers Cancel and Details for a touch selection", () => {
		const selected = EntityId(8);
		const world = {
			...initialWorld,
			editor: { ...initialWorld.editor, open: true, selected },
		};
		const touchInteraction = {
			...interaction,
			isTouchPanelOpen: () => false,
		};
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world,
				editSessionStatus: editSessionStatus(world),
				dispatch: () => {},
				interaction: touchInteraction,
				designStudioView: makeDesignStudioView(touchInteraction),
				onRootPointerDown: () => {},
			}),
		);

		expect(scene).toContain("CANCEL");
		expect(scene).toContain("DETAILS");
		expect(scene).toContain("MOVE");
		expect(scene).toContain("any-pointer-coarse:[stroke-width:56]");
		expect(scene).toContain("data-touch-details");
	});

	test("shows the active Resize mode for a touch selection", () => {
		const selected = EntityId(8);
		const world = {
			...initialWorld,
			editor: { ...initialWorld.editor, open: true, selected },
		};
		const touchInteraction = {
			...interaction,
			isTouchPanelOpen: () => false,
			touchEditorMode: () => "resize" as const,
		};
		const scene = flattenedTemplate(
			gameSceneTemplate({
				world,
				editSessionStatus: editSessionStatus(world),
				dispatch: () => {},
				interaction: touchInteraction,
				designStudioView: makeDesignStudioView(touchInteraction),
				onRootPointerDown: () => {},
			}),
		);

		expect(scene).toContain("RESIZE");
		expect(scene).toContain("any-pointer-coarse:[stroke-width:72]");
	});
});
