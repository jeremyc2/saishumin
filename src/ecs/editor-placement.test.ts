import { describe, expect, test } from "bun:test";
import { Body, Position } from "../model/component";
import { defaultEditorItemBody, EditorItemKinds } from "../model/editor";
import {
	isEntityPlacementValid,
	isFloorPlanPlacementValid,
	isInsideFloorPlan,
	isNewEditorItemPlacementValid,
} from "./editor-placement";
import {
	crateEntities,
	initialWorld,
	playerEntity,
	wallEntities,
} from "./world";

const wallEntity = wallEntities[0];
const smallBody = Body.make({ width: 40, depth: 40 });

describe("editor placement", () => {
	test("requires the entire footprint to stay inside the floor", () => {
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

	test("allows rugs to sit beneath other objects", () => {
		const rugEntity = [...initialWorld.decorations.keys()][0];
		const playerPosition = initialWorld.positions.get(playerEntity);
		expect(rugEntity).toBeDefined();
		expect(playerPosition).toBeDefined();
		if (rugEntity === undefined || playerPosition === undefined) return;

		expect(
			isEntityPlacementValid(
				initialWorld,
				rugEntity,
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
