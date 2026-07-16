import { describe, expect, test } from "bun:test";
import { editSessionStatus } from "../../../design-studio/edit-session/edit-session";
import { makeDesignStudioView } from "../../../design-studio/view/view";
import {
	Body,
	Character,
	CharacterKinds,
	Obstacle,
	ObstacleKinds,
	PlayerFacings,
	Position,
} from "../../../world/components";
import { EntityId } from "../../../world/entity-id";
import { initialWorld } from "../../../world/initial-world";
import { playerBody } from "../../../world/world";
import { gameSceneTemplate } from "../game-scene";

const interaction = {
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
});
