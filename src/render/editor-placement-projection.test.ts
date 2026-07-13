import { describe, expect, test } from "bun:test";
import { initialWorld } from "../ecs/world";
import { Body, Obstacle, ObstacleKinds, Position } from "../model/component";
import { EditorItemKinds } from "../model/editor";
import { EntityId } from "../model/entity-id";
import { editorPlacementPositionAtPointer } from "./editor-placement-projection";
import { project, unproject } from "./projection";

const platform = EntityId(900);
const platformPosition = Position.make({ x: 520, y: 300 });
const platformBody = Body.make({ width: 260, depth: 180 });
const platformHeight = 80;
const itemBody = Body.make({ width: 64, depth: 64 });
const world = {
	...initialWorld,
	positions: new Map(initialWorld.positions).set(platform, platformPosition),
	bodies: new Map(initialWorld.bodies).set(platform, platformBody),
	obstacles: new Map(initialWorld.obstacles).set(
		platform,
		Obstacle.make({ kind: ObstacleKinds.Platform, height: platformHeight }),
	),
};

describe("editor placement projection", () => {
	test("inverse-projects the cursor across the full raised top surface", () => {
		const desiredPosition = Position.make({ x: 520, y: 250 });
		const pointer = project(desiredPosition, platformHeight);

		expect(unproject(pointer).y).toBeLessThan(210);
		expect(
			editorPlacementPositionAtPointer(
				world,
				EditorItemKinds.Plant,
				itemBody,
				pointer,
			),
		).toEqual(desiredPosition);
	});

	test("preserves the grab point while moving on a raised surface", () => {
		const desiredPosition = Position.make({ x: 500, y: 330 });
		const grabOffset = Position.make({ x: 18, y: -12 });
		const pointer = project(
			Position.make({
				x: desiredPosition.x + grabOffset.x,
				y: desiredPosition.y + grabOffset.y,
			}),
			platformHeight,
		);

		expect(
			editorPlacementPositionAtPointer(
				world,
				EditorItemKinds.Lamp,
				itemBody,
				pointer,
				grabOffset,
			),
		).toEqual(desiredPosition);
	});

	test("continues to resolve floor-only positions on the floor", () => {
		const desiredPosition = Position.make({ x: 100, y: 500 });
		expect(
			editorPlacementPositionAtPointer(
				world,
				EditorItemKinds.Crate,
				itemBody,
				project(desiredPosition),
			),
		).toEqual(desiredPosition);
	});
});
