import { describe, expect, test } from "bun:test";
import {
	Body,
	Obstacle,
	ObstacleKinds,
	Position,
} from "../../../world/components";
import { EntityId } from "../../../world/entity-id";
import { initialWorld } from "../../../world/initial-world";
import { lavaMonsterBody, playerBody } from "../../../world/world";
import {
	CharacterSpawnKinds,
	defaultEditorItemBody,
	EditorItemKinds,
} from "../../model";
import {
	isCharacterSpawnPlacementValid,
	isEntityPlacementValid,
	isFloorPlanPlacementValid,
	isInsideFloorPlan,
	isNewEditorItemPlacementValid,
} from "../placement";

const playerEntity = EntityId(1);
const wallEntity = EntityId(3);
const crateEntities = [EntityId(8)] as const;
const smallBody = Body.make({ width: 40, depth: 40 });

describe("editor placement", () => {
	test("accepts both Character Spawns on every standable obstacle surface", () => {
		const surfaceEntity = EntityId(999);
		const surfacePosition = Position.make({ x: 520, y: 300 });
		const surfaceBody = Body.make({ width: 260, depth: 180 });
		const surfaces = [
			{ kind: ObstacleKinds.Platform, height: 48 },
			{ kind: ObstacleKinds.Crate, height: 62 },
			{ kind: ObstacleKinds.Wall, height: 80 },
		] as const;
		const characterSpawns = [
			{
				kind: CharacterSpawnKinds.Player,
				body: playerBody,
				entity: EntityId(1),
			},
			{
				kind: CharacterSpawnKinds.LavaMonster,
				body: lavaMonsterBody,
				entity: EntityId(2),
			},
		] as const;

		for (const surface of surfaces) {
			const surfaceWorld = {
				...initialWorld,
				positions: new Map(initialWorld.positions).set(
					surfaceEntity,
					surfacePosition,
				),
				bodies: new Map(initialWorld.bodies).set(surfaceEntity, surfaceBody),
				obstacles: new Map(initialWorld.obstacles).set(
					surfaceEntity,
					Obstacle.make(surface),
				),
			};
			for (const characterSpawn of characterSpawns) {
				expect(
					isCharacterSpawnPlacementValid({
						world: surfaceWorld,
						...characterSpawn,
						position: surfacePosition,
					}),
				).toBe(true);
			}
		}
	});

	test("requires the entire body to stay inside the floor", () => {
		expect(
			isInsideFloorPlan(
				initialWorld,
				Position.make({ x: 20, y: 20 }),
				smallBody,
			),
		).toBe(true);
		expect(
			isInsideFloorPlan(
				initialWorld,
				Position.make({ x: 19, y: 20 }),
				smallBody,
			),
		).toBe(false);
	});

	test("uses the authored floor origin for placement bounds", () => {
		const shifted = { ...initialWorld, floorOrigin: { x: -100, y: -40 } };

		expect(
			isInsideFloorPlan(shifted, Position.make({ x: -80, y: -20 }), smallBody),
		).toBe(true);
		expect(
			isInsideFloorPlan(shifted, Position.make({ x: -81, y: -20 }), smallBody),
		).toBe(false);
	});

	test("rejects a floor plan that would exclude an existing object", () => {
		expect(
			isFloorPlanPlacementValid(initialWorld, initialWorld.floorPlan),
		).toBe(true);
		expect(
			isFloorPlanPlacementValid(
				initialWorld,
				Body.make({
					width: initialWorld.floorPlan.width - 1,
					depth: initialWorld.floorPlan.depth,
				}),
			),
		).toBe(false);
	});

	test("accepts an object on a fixed floor edge after sub-pixel resize rounding", () => {
		const shifted = {
			...initialWorld,
			floorOrigin: { x: -3_000.000_000_1, y: initialWorld.floorOrigin.y },
		};

		expect(
			isFloorPlanPlacementValid(
				shifted,
				Body.make({
					width: initialWorld.floorPlan.width + 3_000,
					depth: initialWorld.floorPlan.depth,
				}),
			),
		).toBe(true);
	});

	test("ignores the hidden player but rejects overlap with world objects", () => {
		const playerPosition = initialWorld.positions.get(playerEntity);
		const crateEntity = crateEntities[0];
		const cratePosition = initialWorld.positions.get(crateEntity);
		const crateBody = initialWorld.bodies.get(crateEntity);
		expect(playerPosition).toBeDefined();
		expect(cratePosition).toBeDefined();
		expect(crateBody).toBeDefined();
		if (
			playerPosition === undefined ||
			cratePosition === undefined ||
			crateBody === undefined
		)
			return;

		expect(
			isEntityPlacementValid(
				initialWorld,
				wallEntity,
				playerPosition,
				smallBody,
			),
		).toBe(true);
		expect(
			isEntityPlacementValid(
				initialWorld,
				wallEntity,
				cratePosition,
				smallBody,
			),
		).toBe(false);
		expect(
			isEntityPlacementValid(
				initialWorld,
				wallEntity,
				Position.make({
					x: cratePosition.x + crateBody.width / 2 + smallBody.width / 2,
					y: cratePosition.y,
				}),
				smallBody,
			),
		).toBe(true);
	});

	test("allows hopscotch markings to sit beneath other objects", () => {
		const hopscotchEntity = [...initialWorld.decorations.keys()][0];
		const playerPosition = initialWorld.positions.get(playerEntity);
		expect(hopscotchEntity).toBeDefined();
		expect(playerPosition).toBeDefined();
		if (hopscotchEntity === undefined || playerPosition === undefined) return;

		expect(
			isEntityPlacementValid(
				initialWorld,
				hopscotchEntity,
				playerPosition,
				smallBody,
			),
		).toBe(true);
	});

	test("validates a dragged new item before it is dropped", () => {
		const playerPosition = initialWorld.positions.get(playerEntity);
		const cratePosition = initialWorld.positions.get(crateEntities[0]);
		expect(playerPosition).toBeDefined();
		expect(cratePosition).toBeDefined();
		if (playerPosition === undefined || cratePosition === undefined) return;
		const plantBody = defaultEditorItemBody(EditorItemKinds.Plant);

		expect(
			isNewEditorItemPlacementValid(
				initialWorld,
				EditorItemKinds.Plant,
				playerPosition,
				plantBody,
			),
		).toBe(true);
		expect(
			isNewEditorItemPlacementValid(
				initialWorld,
				EditorItemKinds.Plant,
				cratePosition,
				plantBody,
			),
		).toBe(false);
		expect(
			isNewEditorItemPlacementValid(
				initialWorld,
				EditorItemKinds.Plant,
				Position.make({ x: 0, y: 0 }),
				plantBody,
			),
		).toBe(false);
	});
});
