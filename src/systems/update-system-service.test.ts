import { afterAll, describe, expect, test } from "bun:test";
import { Layer, ManagedRuntime } from "effect";
import {
	crateBody,
	crateEntities,
	crateHeight,
	groundElevation,
	initialWorld,
	jumpSpeed,
	platformEntities,
	playerBody,
	playerEntity,
	stationaryVelocity,
	type World,
} from "../ecs/world";
import { Action } from "../model/action";
import {
	Body,
	Elevation,
	Obstacle,
	ObstacleKinds,
	Position,
} from "../model/component";
import { Controls, type Direction } from "../model/control";
import type { EntityId } from "../model/entity-id";
import { MovementSystemService } from "./movement-system-service";
import { UpdateSystemService } from "./update-system-service";

const runtime = ManagedRuntime.make(
	UpdateSystemService.layer.pipe(Layer.provide(MovementSystemService.layer)),
);
const updateSystem = runtime.runSync(UpdateSystemService);

afterAll(() => runtime.dispose());

const makeWorld = ({
	positions,
	bodies,
	obstacles,
	pressed,
	grabbed,
}: {
	readonly positions: ReadonlyMap<EntityId, Position>;
	readonly bodies: ReadonlyMap<EntityId, Body>;
	readonly obstacles: ReadonlyMap<EntityId, Obstacle>;
	readonly pressed: ReadonlySet<Direction>;
	readonly grabbed: EntityId | null;
}): World => ({
	positions,
	elevations: new Map([
		[
			playerEntity,
			Elevation.make({
				z: groundElevation,
				velocity: stationaryVelocity,
			}),
		],
	]),
	bodies,
	obstacles,
	pressed,
	grabbed,
	lastFrame: 1000,
});

describe("UpdateSystemService", () => {
	test("releases a grabbed crate when the player jumps", () => {
		const world = { ...initialWorld, grabbed: crateEntities[0] };

		const result = updateSystem.update(
			world,
			Action.KeyChanged({ key: Controls.Jump, pressed: true }),
		);

		expect(result.grabbed).toBeNull();
		expect(result.elevations.get(playerEntity)?.velocity).toBe(jumpSpeed);
	});

	test("keeps the grab when a jump cannot start", () => {
		const crateEntity = crateEntities[0];
		const elevations = new Map(initialWorld.elevations);
		elevations.set(playerEntity, { z: 20, velocity: jumpSpeed });
		const world = {
			...initialWorld,
			elevations,
			grabbed: crateEntity,
		};

		const result = updateSystem.update(
			world,
			Action.KeyChanged({ key: Controls.Jump, pressed: true }),
		);

		expect(result).toBe(world);
		expect(result.grabbed).toBe(crateEntity);
	});

	test("moves onto a platform after releasing a crate from beside the player", () => {
		const crateEntity = crateEntities[0];
		const platformEntity = platformEntities[0];
		const world = makeWorld({
			positions: new Map([
				[playerEntity, Position.make({ x: 300, y: 300 })],
				[crateEntity, Position.make({ x: 300, y: 360 })],
				[platformEntity, Position.make({ x: 400, y: 300 })],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[crateEntity, crateBody],
				[platformEntity, Body.make({ width: 130, depth: 50 })],
			]),
			obstacles: new Map([
				[
					crateEntity,
					Obstacle.make({ height: crateHeight, kind: ObstacleKinds.Crate }),
				],
				[
					platformEntity,
					Obstacle.make({ height: 32, kind: ObstacleKinds.Platform }),
				],
			]),
			pressed: new Set([Controls.Right]),
			grabbed: crateEntity,
		});

		const jumped = updateSystem.update(
			world,
			Action.KeyChanged({ key: Controls.Jump, pressed: true }),
		);
		const firstFrame = updateSystem.update(jumped, Action.Tick({ time: 1050 }));
		const secondFrame = updateSystem.update(
			firstFrame,
			Action.Tick({ time: 1100 }),
		);
		const thirdFrame = updateSystem.update(
			secondFrame,
			Action.Tick({ time: 1150 }),
		);

		expect(thirdFrame.grabbed).toBeNull();
		expect(thirdFrame.positions.get(playerEntity)?.x).toBe(312.25);
		expect(thirdFrame.positions.get(crateEntity)?.x).toBe(300);
	});
});
