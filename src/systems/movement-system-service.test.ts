import { afterAll, describe, expect, test } from "bun:test";
import { ManagedRuntime } from "effect";
import {
	crateBody,
	crateEntities,
	crateHeight,
	groundElevation,
	playerBody,
	playerEntity,
	roomDepth,
	stationaryVelocity,
	type World,
	wallThickness,
} from "../ecs/world";
import {
	type Body,
	Elevation,
	Obstacle,
	ObstacleKinds,
	Position,
} from "../model/component";
import { Controls, type Direction } from "../model/control";
import type { EntityId } from "../model/entity-id";
import { MovementSystemService } from "./movement-system-service";

const runtime = ManagedRuntime.make(MovementSystemService.layer);
const movementSystem = runtime.runSync(MovementSystemService);

afterAll(() => runtime.dispose());

const makeWorld = ({
	positions,
	bodies,
	obstacles,
	elevation,
	pressed,
	grabbed,
}: {
	readonly positions: ReadonlyMap<EntityId, Position>;
	readonly bodies: ReadonlyMap<EntityId, Body>;
	readonly obstacles: ReadonlyMap<EntityId, Obstacle>;
	readonly elevation: Elevation;
	readonly pressed: ReadonlySet<Direction>;
	readonly grabbed: EntityId | null;
}): World => ({
	positions,
	elevations: new Map([[playerEntity, elevation]]),
	bodies,
	obstacles,
	pressed,
	grabbed,
	lastFrame: 0,
});

describe("MovementSystemService", () => {
	test("moves grabbed crates to the exact wall contact position", () => {
		const crateEntity = crateEntities[0];
		const contactY = roomDepth - wallThickness - crateBody.depth / 2;
		const moveToWall = (crateY: number): number | undefined => {
			const world = makeWorld({
				positions: new Map([
					[playerEntity, Position.make({ x: 500, y: crateY - 60 })],
					[crateEntity, Position.make({ x: 500, y: crateY })],
				]),
				bodies: new Map([
					[playerEntity, playerBody],
					[crateEntity, crateBody],
				]),
				obstacles: new Map([
					[
						crateEntity,
						Obstacle.make({
							height: crateHeight,
							kind: ObstacleKinds.Crate,
						}),
					],
				]),
				elevation: Elevation.make({
					z: groundElevation,
					velocity: stationaryVelocity,
				}),
				pressed: new Set([Controls.Down]),
				grabbed: crateEntity,
			});

			return movementSystem.update(world, 0.05).positions.get(crateEntity)?.y;
		};

		expect(moveToWall(567.2)).toBe(contactY);
		expect(moveToWall(568.4)).toBe(contactY);
	});
});
