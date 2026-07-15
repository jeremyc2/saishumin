import { describe, expect, test } from "bun:test";
import { Body, Obstacle, ObstacleKinds, Position } from "../../components";
import { EntityId } from "../../entity-id";
import { initialWorld } from "../../initial-world";
import { overlaps, supportSurfaceAt } from "../collision";

describe("World collision", () => {
	test("detects overlap only while both body axes intersect", () => {
		const body = Body.make({ width: 40, depth: 30 });

		expect(
			overlaps(
				Position.make({ x: 100, y: 100 }),
				body,
				Position.make({ x: 139, y: 100 }),
				body,
			),
		).toBe(true);
		expect(
			overlaps(
				Position.make({ x: 100, y: 100 }),
				body,
				Position.make({ x: 140, y: 100 }),
				body,
			),
		).toBe(false);
	});

	test("selects the highest eligible support beneath a body", () => {
		const platform = EntityId(950);
		const position = Position.make({ x: 500, y: 400 });
		const body = Body.make({ width: 80, depth: 60 });
		const world = {
			...initialWorld,
			positions: new Map([[platform, position]]),
			bodies: new Map([[platform, body]]),
			obstacles: new Map([
				[platform, Obstacle.make({ kind: ObstacleKinds.Platform, height: 50 })],
			]),
			decorations: new Map(),
			elevations: new Map(),
		};

		expect(supportSurfaceAt(world, position, body)).toEqual({
			elevation: 50,
			entity: platform,
		});
		expect(supportSurfaceAt(world, position, body, 40)).toEqual({
			elevation: 0,
			entity: null,
		});
	});
});
