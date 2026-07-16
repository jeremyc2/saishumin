import { afterAll, describe, expect, test } from "bun:test";
import { ManagedRuntime } from "effect";
import { Controls, type Direction } from "../../../app/control";
import {
	Body,
	type Decoration,
	Elevation,
	Obstacle,
	ObstacleKinds,
	Position,
} from "../../../world/components";
import { EntityId } from "../../../world/entity-id";
import { initialWorld } from "../../../world/initial-world";
import { overlaps } from "../../../world/spatial/collision";
import {
	crateBody,
	crateHeight,
	groundElevation,
	playerBody,
	stationaryVelocity,
	type World,
} from "../../../world/world";
import { MovementSystemService } from "../movement-system";

const playerEntity = EntityId(1);
const lavaMonsterEntity = EntityId(2);

const runtime = ManagedRuntime.make(MovementSystemService.layer);
const movementSystem = runtime.runSync(MovementSystemService);

afterAll(() => runtime.dispose());

const makeWorld = ({
	positions,
	bodies,
	obstacles,
	decorations,
	elevation,
	pressed,
	grabbed,
}: {
	readonly positions: ReadonlyMap<EntityId, Position>;
	readonly bodies: ReadonlyMap<EntityId, Body>;
	readonly obstacles: ReadonlyMap<EntityId, Obstacle>;
	readonly decorations: ReadonlyMap<EntityId, Decoration>;
	readonly elevation: Elevation;
	readonly pressed: ReadonlySet<Direction>;
	readonly grabbed: EntityId | null;
}): World => ({
	...initialWorld,
	positions,
	elevations: new Map([
		[playerEntity, elevation],
		[
			lavaMonsterEntity,
			Elevation.make({
				z: groundElevation,
				velocity: stationaryVelocity,
			}),
		],
	]),
	bodies,
	obstacles,
	decorations,
	pressed,
	grabbed,
	lastFrame: 0,
});

describe("MovementSystemService support surfaces", () => {
	test("keeps crates, walls, and platforms as stable landing surfaces", () => {
		for (const [index, kind, height] of [
			[0, ObstacleKinds.Crate, 62],
			[1, ObstacleKinds.Wall, 80],
			[2, ObstacleKinds.Platform, 40],
		] as const) {
			const obstacleEntity = EntityId(932 + index);
			const obstaclePosition = Position.make({ x: 360, y: 300 });
			const obstacleBody = Body.make({ width: 160, depth: 120 });
			const world = makeWorld({
				positions: new Map([
					[playerEntity, obstaclePosition],
					[obstacleEntity, obstaclePosition],
				]),
				bodies: new Map([
					[playerEntity, playerBody],
					[obstacleEntity, obstacleBody],
				]),
				obstacles: new Map([[obstacleEntity, Obstacle.make({ height, kind })]]),
				decorations: new Map(),
				elevation: Elevation.make({ z: height + 5, velocity: -100 }),
				pressed: new Set(),
				grabbed: null,
			});

			const moved = movementSystem.update({ world: world, elapsed: 0.05 });

			expect(moved.positions.get(playerEntity)).toEqual(obstaclePosition);
			expect(moved.elevations.get(playerEntity)).toEqual({
				z: height,
				velocity: stationaryVelocity,
			});
		}
	});

	test("lands on a crate that is resting on a platform", () => {
		const crateEntity = EntityId(940);
		const platformEntity = EntityId(941);
		const platformHeight = 40;
		const platformPosition = Position.make({ x: 400, y: 300 });
		const cratePosition = Position.make({ x: 430, y: 300 });
		let world = makeWorld({
			positions: new Map([
				[playerEntity, Position.make({ x: 340, y: 300 })],
				[crateEntity, cratePosition],
				[platformEntity, platformPosition],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[crateEntity, crateBody],
				[platformEntity, Body.make({ width: 240, depth: 180 })],
			]),
			obstacles: new Map([
				[
					crateEntity,
					Obstacle.make({ height: crateHeight, kind: ObstacleKinds.Crate }),
				],
				[
					platformEntity,
					Obstacle.make({
						height: platformHeight,
						kind: ObstacleKinds.Platform,
					}),
				],
			]),
			decorations: new Map(),
			elevation: Elevation.make({ z: platformHeight, velocity: 510 }),
			pressed: new Set([Controls.Right]),
			grabbed: null,
		});
		world = {
			...world,
			elevations: new Map(world.elevations).set(
				crateEntity,
				Elevation.make({ z: platformHeight, velocity: stationaryVelocity }),
			),
		};

		for (let frame = 0; frame < 4; frame += 1) {
			world = movementSystem.update({ world: world, elapsed: 0.05 });
		}
		world = { ...world, pressed: new Set() };
		for (let frame = 0; frame < 16; frame += 1) {
			world = movementSystem.update({ world: world, elapsed: 0.05 });
		}

		expect(
			overlaps({
				position: world.positions.get(playerEntity) ?? platformPosition,
				body: playerBody,
				otherPosition: cratePosition,
				otherBody: crateBody,
			}),
		).toBe(true);
		expect(world.elevations.get(playerEntity)).toEqual({
			z: platformHeight + crateHeight,
			velocity: stationaryVelocity,
		});
	});

	test("holds a crate over a ledge until its entire body clears", () => {
		const crateEntity = EntityId(942);
		const platformEntity = EntityId(943);
		const platformHeight = 40;
		const platformPosition = Position.make({ x: 400, y: 300 });
		let world = makeWorld({
			positions: new Map([
				[playerEntity, Position.make({ x: 418, y: 300 })],
				[crateEntity, Position.make({ x: 480, y: 300 })],
				[platformEntity, platformPosition],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[crateEntity, crateBody],
				[platformEntity, Body.make({ width: 240, depth: 180 })],
			]),
			obstacles: new Map([
				[
					crateEntity,
					Obstacle.make({ height: crateHeight, kind: ObstacleKinds.Crate }),
				],
				[
					platformEntity,
					Obstacle.make({
						height: platformHeight,
						kind: ObstacleKinds.Platform,
					}),
				],
			]),
			decorations: new Map(),
			elevation: Elevation.make({
				z: platformHeight,
				velocity: stationaryVelocity,
			}),
			pressed: new Set([Controls.Right]),
			grabbed: null,
		});
		world = {
			...world,
			elevations: new Map(world.elevations).set(
				crateEntity,
				Elevation.make({ z: platformHeight, velocity: stationaryVelocity }),
			),
		};

		for (let frame = 0; frame < 8; frame += 1) {
			world = movementSystem.update({ world: world, elapsed: 0.05 });
		}
		expect(world.positions.get(crateEntity)?.x).toBe(550);
		expect(world.elevations.get(crateEntity)).toEqual({
			z: platformHeight,
			velocity: stationaryVelocity,
		});

		world = movementSystem.update({ world: world, elapsed: 0.05 });
		expect(world.positions.get(crateEntity)?.x).toBe(558.75);
		expect(world.elevations.get(crateEntity)?.z).toBeLessThan(platformHeight);
		expect(world.elevations.get(crateEntity)?.velocity).toBeLessThan(0);

		for (let frame = 0; frame < 6; frame += 1) {
			world = movementSystem.update({ world: world, elapsed: 0.05 });
		}
		expect(world.positions.get(crateEntity)?.x).toBeGreaterThan(558.75);
		expect(world.positions.get(playerEntity)?.x).toBeGreaterThan(520);
		expect(world.elevations.get(playerEntity)?.z).toBeLessThan(platformHeight);

		for (let frame = 0; frame < 5; frame += 1) {
			world = movementSystem.update({ world: world, elapsed: 0.05 });
		}
		expect(world.elevations.get(crateEntity)).toEqual({
			z: groundElevation,
			velocity: stationaryVelocity,
		});
	});
});
