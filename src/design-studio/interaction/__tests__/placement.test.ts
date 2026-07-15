import { describe, expect, test } from "bun:test";
import { project, unproject } from "../../../presentation/geometry/projection";
import {
	Body,
	Elevation,
	Obstacle,
	ObstacleKinds,
	Position,
} from "../../../world/components";
import { EntityId } from "../../../world/entity-id";
import { initialWorld } from "../../../world/initial-world";
import { EditorItemKinds } from "../../model";
import { editorPlacementPositionAtPointer } from "../placement";

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
			editorPlacementPositionAtPointer({
				world,
				kind: EditorItemKinds.Plant,
				body: itemBody,
				projectedPointer: pointer,
			}),
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
			editorPlacementPositionAtPointer({
				world,
				kind: EditorItemKinds.Lamp,
				body: itemBody,
				projectedPointer: pointer,
				grabOffset,
			}),
		).toEqual(desiredPosition);
	});

	test("inverse-projects an offset crate onto another crate", () => {
		const lowerCrate = EntityId(901);
		const lowerPosition = Position.make({ x: 520, y: 300 });
		const lowerBody = Body.make({ width: 70, depth: 70 });
		const lowerHeight = 62;
		const stackedWorld = {
			...world,
			positions: new Map(world.positions).set(lowerCrate, lowerPosition),
			bodies: new Map(world.bodies).set(lowerCrate, lowerBody),
			obstacles: new Map(world.obstacles).set(
				lowerCrate,
				Obstacle.make({ kind: ObstacleKinds.Crate, height: lowerHeight }),
			),
			elevations: new Map(world.elevations).set(
				lowerCrate,
				Elevation.make({ z: platformHeight, velocity: 0 }),
			),
		};
		const desiredPosition = Position.make({ x: 575, y: 300 });
		const pointer = project(desiredPosition, platformHeight + lowerHeight);

		expect(
			editorPlacementPositionAtPointer({
				world: stackedWorld,
				kind: EditorItemKinds.Crate,
				body: itemBody,
				projectedPointer: pointer,
			}),
		).toEqual(desiredPosition);
	});

	test("continues to resolve floor-only positions on the floor", () => {
		const desiredPosition = Position.make({ x: 100, y: 500 });
		expect(
			editorPlacementPositionAtPointer({
				world,
				kind: EditorItemKinds.Crate,
				body: itemBody,
				projectedPointer: project(desiredPosition),
			}),
		).toEqual(desiredPosition);
	});
});
