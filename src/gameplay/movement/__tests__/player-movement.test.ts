import { afterAll, describe, expect, test } from "bun:test";
import { ManagedRuntime } from "effect";
import { Controls, type Direction } from "../../../app/control";
import {
	Body,
	Decoration,
	DecorationKinds,
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
	lavaMonsterBody,
	lavaMonsterEntity,
	playerBody,
	playerEntity,
	stationaryVelocity,
	type World,
} from "../../../world/world";
import { MovementSystemService } from "../movement-system";

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

describe("MovementSystemService player movement", () => {
	test("moves the player through unobstructed floor space", () => {
		const start = Position.make({ x: 300, y: 300 });
		const world = makeWorld({
			positions: new Map([[playerEntity, start]]),
			bodies: new Map([[playerEntity, playerBody]]),
			obstacles: new Map(),
			decorations: new Map(),
			elevation: Elevation.make({
				z: groundElevation,
				velocity: stationaryVelocity,
			}),
			pressed: new Set([Controls.Right]),
			grabbed: null,
		});

		const moved = movementSystem.update({ world: world, elapsed: 0.05 });

		expect(moved.positions.get(playerEntity)?.x).toBe(312.25);
		expect(moved.positions.get(playerEntity)?.y).toBe(start.y);
	});

	test("treats the lava monster as solid for player movement", () => {
		const playerPosition = Position.make({ x: 296, y: 300 });
		const monsterPosition = Position.make({ x: 360, y: 300 });
		const world = makeWorld({
			positions: new Map([
				[playerEntity, playerPosition],
				[lavaMonsterEntity, monsterPosition],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[lavaMonsterEntity, lavaMonsterBody],
			]),
			obstacles: new Map(),
			decorations: new Map(),
			elevation: Elevation.make({
				z: groundElevation,
				velocity: stationaryVelocity,
			}),
			pressed: new Set([Controls.Right]),
			grabbed: null,
		});

		const moved = movementSystem.update({ world: world, elapsed: 0.05 });

		expect(moved.positions.get(playerEntity)).toEqual(playerPosition);
	});

	test("blocks ordinary movement into plants", () => {
		const plantEntity = EntityId(900);
		const start = Position.make({ x: 296, y: 300 });
		const world = makeWorld({
			positions: new Map([
				[playerEntity, start],
				[plantEntity, Position.make({ x: 360, y: 300 })],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[plantEntity, Body.make({ width: 72, depth: 72 })],
			]),
			obstacles: new Map(),
			decorations: new Map([
				[
					plantEntity,
					Decoration.make({ kind: DecorationKinds.Plant, height: 84 }),
				],
			]),
			elevation: Elevation.make({
				z: groundElevation,
				velocity: stationaryVelocity,
			}),
			pressed: new Set([Controls.Right]),
			grabbed: null,
		});

		const moved = movementSystem.update({ world: world, elapsed: 0.05 });

		expect(moved.positions.get(playerEntity)).toEqual(start);
		expect(moved.positions.get(plantEntity)).toEqual({ x: 360, y: 300 });
	});

	test("allows the player to jump above plants and lamps", () => {
		for (const [kind, height] of [
			[DecorationKinds.Plant, 84],
			[DecorationKinds.Lamp, 96],
		] as const) {
			const decorationEntity = EntityId(910 + height);
			const start = Position.make({ x: 296, y: 300 });
			const world = makeWorld({
				positions: new Map([
					[playerEntity, start],
					[decorationEntity, Position.make({ x: 360, y: 300 })],
				]),
				bodies: new Map([
					[playerEntity, playerBody],
					[decorationEntity, Body.make({ width: 72, depth: 72 })],
				]),
				obstacles: new Map(),
				decorations: new Map([
					[decorationEntity, Decoration.make({ kind, height })],
				]),
				elevation: Elevation.make({ z: height + 10, velocity: 120 }),
				pressed: new Set([Controls.Right]),
				grabbed: null,
			});

			const moved = movementSystem.update({ world: world, elapsed: 0.05 });

			expect(moved.positions.get(playerEntity)?.x).toBeGreaterThan(start.x);
		}
	});

	test("slides the player to a clear edge when falling onto a plant", () => {
		const plantEntity = EntityId(930);
		const objectPosition = Position.make({ x: 360, y: 300 });
		const objectBody = Body.make({ width: 72, depth: 72 });
		const world = makeWorld({
			positions: new Map([
				[playerEntity, objectPosition],
				[plantEntity, objectPosition],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[plantEntity, objectBody],
			]),
			obstacles: new Map(),
			decorations: new Map([
				[
					plantEntity,
					Decoration.make({ kind: DecorationKinds.Plant, height: 84 }),
				],
			]),
			elevation: Elevation.make({ z: 86, velocity: -100 }),
			pressed: new Set(),
			grabbed: null,
		});

		const moved = movementSystem.update({ world: world, elapsed: 0.05 });
		const movedPosition = moved.positions.get(playerEntity);

		expect(movedPosition).toBeDefined();
		if (movedPosition === undefined) return;
		expect(
			overlaps({
				position: movedPosition,
				body: playerBody,
				otherPosition: objectPosition,
				otherBody: objectBody,
			}),
		).toBe(false);
		expect(moved.elevations.get(playerEntity)?.z).toBe(84);
		expect(moved.elevations.get(playerEntity)?.velocity).toBeLessThan(0);
	});

	test("pushes an already-embedded player out without requiring a jump", () => {
		const lampEntity = EntityId(931);
		const objectPosition = Position.make({ x: 360, y: 300 });
		const objectBody = Body.make({ width: 64, depth: 64 });
		const world = makeWorld({
			positions: new Map([
				[playerEntity, objectPosition],
				[lampEntity, objectPosition],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[lampEntity, objectBody],
			]),
			obstacles: new Map(),
			decorations: new Map([
				[
					lampEntity,
					Decoration.make({ kind: DecorationKinds.Lamp, height: 96 }),
				],
			]),
			elevation: Elevation.make({
				z: groundElevation,
				velocity: stationaryVelocity,
			}),
			pressed: new Set(),
			grabbed: null,
		});

		const moved = movementSystem.update({ world: world, elapsed: 0.05 });
		const movedPosition = moved.positions.get(playerEntity);

		expect(movedPosition).toBeDefined();
		if (movedPosition === undefined) return;
		expect(
			overlaps({
				position: movedPosition,
				body: playerBody,
				otherPosition: objectPosition,
				otherBody: objectBody,
			}),
		).toBe(false);
		expect(moved.elevations.get(playerEntity)?.z).toBe(groundElevation);
	});

	test("moves an airborne player out from beneath an overhanging crate", () => {
		const crateEntity = EntityId(947);
		const platformEntity = EntityId(948);
		const platformHeight = 100;
		const cratePosition = Position.make({ x: 480, y: 300 });
		let world = makeWorld({
			positions: new Map([
				[playerEntity, Position.make({ x: 485, y: 300 })],
				[crateEntity, cratePosition],
				[platformEntity, Position.make({ x: 400, y: 300 })],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[crateEntity, crateBody],
				[platformEntity, Body.make({ width: 100, depth: 180 })],
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
			elevation: Elevation.make({ z: 25, velocity: 200 }),
			pressed: new Set([Controls.Right]),
			grabbed: null,
		});
		world = {
			...world,
			elevations: new Map(world.elevations).set(
				crateEntity,
				Elevation.make({
					z: platformHeight,
					velocity: stationaryVelocity,
				}),
			),
		};

		const moved = movementSystem.update({ world: world, elapsed: 0.05 });

		expect(
			overlaps({
				position: moved.positions.get(playerEntity) ?? cratePosition,
				body: playerBody,
				otherPosition: cratePosition,
				otherBody: crateBody,
			}),
		).toBe(false);
		expect(moved.elevations.get(playerEntity)?.z).not.toBe(
			platformHeight + crateHeight,
		);
	});

	test("blocks movement beneath an overhanging crate even when the gap is tall enough", () => {
		const crateEntity = EntityId(949);
		const cratePosition = Position.make({ x: 480, y: 300 });
		const start = Position.make({
			x: cratePosition.x + (crateBody.width + playerBody.width) / 2,
			y: cratePosition.y,
		});
		let world = makeWorld({
			positions: new Map([
				[playerEntity, start],
				[crateEntity, cratePosition],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[crateEntity, crateBody],
			]),
			obstacles: new Map([
				[
					crateEntity,
					Obstacle.make({ height: crateHeight, kind: ObstacleKinds.Crate }),
				],
			]),
			decorations: new Map(),
			elevation: Elevation.make({
				z: groundElevation,
				velocity: stationaryVelocity,
			}),
			pressed: new Set([Controls.Left]),
			grabbed: null,
		});
		world = {
			...world,
			elevations: new Map(world.elevations).set(
				crateEntity,
				Elevation.make({ z: 100, velocity: stationaryVelocity }),
			),
		};

		const moved = movementSystem.update({ world: world, elapsed: 0.05 });

		expect(moved.positions.get(playerEntity)).toEqual(start);
	});
});
