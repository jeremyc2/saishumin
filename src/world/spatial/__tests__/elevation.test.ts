import { describe, expect, test } from "bun:test";
import {
	Body,
	type DecorationKind,
	Elevation,
	Obstacle,
	ObstacleKinds,
	Position,
} from "../../components";
import { EntityId } from "../../entity-id";
import { initialWorld } from "../../initial-world";
import { entityTopElevation, placementElevationForEntity } from "../elevation";

describe("World elevation", () => {
	test("combines an entity base and component height", () => {
		const crate = EntityId(960);
		const world = {
			...initialWorld,
			elevations: new Map([[crate, Elevation.make({ z: 50, velocity: 0 })]]),
			obstacles: new Map([
				[crate, Obstacle.make({ kind: ObstacleKinds.Crate, height: 62 })],
			]),
		};

		expect(entityTopElevation(world, crate)).toBe(112);
	});

	test("places a crate on the highest overlapping support", () => {
		const platform = EntityId(961);
		const crate = EntityId(962);
		const position = Position.make({ x: 500, y: 400 });
		const platformBody = Body.make({ width: 240, depth: 180 });
		const crateBody = Body.make({ width: 70, depth: 70 });
		const world = {
			...initialWorld,
			positions: new Map([
				[platform, position],
				[crate, position],
			]),
			bodies: new Map([
				[platform, platformBody],
				[crate, crateBody],
			]),
			obstacles: new Map([
				[platform, Obstacle.make({ kind: ObstacleKinds.Platform, height: 50 })],
				[crate, Obstacle.make({ kind: ObstacleKinds.Crate, height: 62 })],
			]),
			elevations: new Map(),
		};

		expect(placementElevationForEntity(world, crate, position, crateBody)).toBe(
			50,
		);
	});

	test("preserves the base elevation for an unknown legacy kind", () => {
		const legacyEntity = EntityId(963);
		const position = Position.make({ x: 500, y: 400 });
		const body = Body.make({ width: 70, depth: 70 });
		const world = {
			...initialWorld,
			positions: new Map([[legacyEntity, position]]),
			bodies: new Map([[legacyEntity, body]]),
			decorations: new Map([
				[
					legacyEntity,
					{
						kind: "legacy-decoration" as DecorationKind,
						height: 84,
					},
				],
			]),
			elevations: new Map([
				[legacyEntity, Elevation.make({ z: 37, velocity: 0 })],
			]),
		};

		expect(
			placementElevationForEntity(world, legacyEntity, position, body),
		).toBe(37);
	});
});
