import { afterAll, describe, expect, test } from "bun:test";
import { ManagedRuntime } from "effect";
import {
	Body,
	Decoration,
	DecorationKinds,
	Elevation,
	Obstacle,
	ObstacleKinds,
	PlayerFacings,
	Position,
} from "../../../world/components";
import { EntityId } from "../../../world/entity-id";
import { initialWorld } from "../../../world/initial-world";
import { overlaps } from "../../../world/spatial/collision";
import {
	groundElevation,
	lavaMonsterBody,
	lavaMonsterEntity,
	lavaMonsterFollowDistance,
	lavaMonsterSpawnPosition,
	lavaMonsterSpeed,
	playerBody,
	playerEntity,
	roomDepth,
	stationaryVelocity,
	type World,
} from "../../../world/world";
import { MovementSystemService } from "../movement-system";

const runtime = ManagedRuntime.make(MovementSystemService.layer);
const movement = runtime.runSync(MovementSystemService);

afterAll(() => runtime.dispose());

const worldWith = (
	entries: ReadonlyArray<readonly [EntityId, Position]>,
	obstacles = new Map<EntityId, Obstacle>(),
	bodies = new Map<EntityId, Body>(),
): World => ({
	...initialWorld,
	positions: new Map(entries),
	bodies: new Map([
		[playerEntity, playerBody],
		[lavaMonsterEntity, lavaMonsterBody],
		...bodies,
	]),
	obstacles,
	elevations: new Map([
		[
			playerEntity,
			Elevation.make({ z: groundElevation, velocity: stationaryVelocity }),
		],
		[
			lavaMonsterEntity,
			Elevation.make({ z: groundElevation, velocity: stationaryVelocity }),
		],
	]),
	pressed: new Set(),
	grabbed: null,
	lastFrame: 0,
});

describe("lava-monster movement through MovementSystemService", () => {
	test("pursues through clear space, stops at follow distance, and faces its movement", () => {
		const player = Position.make({ x: 300, y: 300 });
		const monster = Position.make({ x: 500, y: 300 });
		const moved = movement.update(
			worldWith([
				[playerEntity, player],
				[lavaMonsterEntity, monster],
			]),
			0.05,
		);
		expect(moved.positions.get(lavaMonsterEntity)).toEqual({
			x: monster.x - lavaMonsterSpeed * 0.05,
			y: monster.y,
		});
		expect(moved.lavaMonsterFacing).toBe(PlayerFacings.Left);
		const near = movement.update(
			worldWith([
				[playerEntity, player],
				[
					lavaMonsterEntity,
					Position.make({
						x: player.x + lavaMonsterFollowDistance + 2,
						y: player.y,
					}),
				],
			]),
			0.05,
		);
		expect(near.positions.get(lavaMonsterEntity)?.x).toBe(
			player.x + lavaMonsterFollowDistance,
		);
	});

	test("routes around blocking obstacles and wanders at unreachable barriers", () => {
		const wall = EntityId(898);
		let routed = worldWith(
			[
				[playerEntity, Position.make({ x: 250, y: 300 })],
				[lavaMonsterEntity, Position.make({ x: 550, y: 300 })],
				[wall, Position.make({ x: 400, y: 300 })],
			],
			new Map([
				[wall, Obstacle.make({ height: 80, kind: ObstacleKinds.Wall })],
			]),
			new Map([[wall, Body.make({ width: 80, depth: 220 })]]),
		);
		for (let frame = 0; frame < 180; frame += 1)
			routed = movement.update(routed, 0.05);
		expect(routed.positions.get(lavaMonsterEntity)?.x).toBeLessThan(350);
		const barrier = EntityId(896);
		let trapped = worldWith(
			[
				[playerEntity, Position.make({ x: 250, y: 300 })],
				[lavaMonsterEntity, Position.make({ x: 550, y: 300 })],
				[barrier, Position.make({ x: 400, y: roomDepth / 2 })],
			],
			new Map([
				[barrier, Obstacle.make({ height: 200, kind: ObstacleKinds.Wall })],
			]),
			new Map([[barrier, Body.make({ width: 80, depth: roomDepth })]]),
		);
		for (let frame = 0; frame < 80; frame += 1)
			trapped = movement.update(trapped, 0.05);
		expect(trapped.positions.get(lavaMonsterEntity)?.y).not.toBe(300);
	});

	test("recovers an invalid placement without overlapping the obstacle", () => {
		const obstacle = EntityId(899);
		const embedded = Position.make({ x: 600, y: 300 });
		const body = Body.make({ width: 100, depth: 100 });
		const moved = movement.update(
			worldWith(
				[
					[playerEntity, Position.make({ x: 300, y: 300 })],
					[lavaMonsterEntity, embedded],
					[obstacle, embedded],
				],
				new Map([
					[
						obstacle,
						Obstacle.make({ height: 50, kind: ObstacleKinds.Platform }),
					],
				]),
				new Map([[obstacle, body]]),
			),
			0.05,
		);
		const recovered = moved.positions.get(lavaMonsterEntity);
		expect(recovered).toBeDefined();
		if (recovered !== undefined) {
			expect(recovered).not.toEqual(lavaMonsterSpawnPosition);
			expect(overlaps(recovered, lavaMonsterBody, embedded, body)).toBe(false);
		}
	});

	test("jumps onto a reachable platform while pursuing the player", () => {
		const platform = EntityId(897);
		const platformHeight = 48;
		const player = Position.make({ x: 400, y: 300 });
		let world = worldWith(
			[
				[playerEntity, player],
				[lavaMonsterEntity, Position.make({ x: 400, y: 450 })],
				[platform, Position.make({ x: 400, y: 300 })],
			],
			new Map([
				[
					platform,
					Obstacle.make({
						height: platformHeight,
						kind: ObstacleKinds.Platform,
					}),
				],
			]),
			new Map([[platform, Body.make({ width: 260, depth: 160 })]]),
		);
		world = {
			...world,
			elevations: new Map(world.elevations)
				.set(
					playerEntity,
					Elevation.make({ z: platformHeight, velocity: stationaryVelocity }),
				)
				.set(
					lavaMonsterEntity,
					Elevation.make({ z: groundElevation, velocity: stationaryVelocity }),
				),
		};
		for (let frame = 0; frame < 180; frame += 1)
			world = movement.update(world, 0.05);
		expect(world.elevations.get(lavaMonsterEntity)?.z).toBe(platformHeight);
		const monster = world.positions.get(lavaMonsterEntity);
		if (monster !== undefined)
			expect(overlaps(monster, lavaMonsterBody, player, playerBody)).toBe(
				false,
			);
	});

	test("does not jump merely because the player is airborne", () => {
		let world = worldWith([
			[playerEntity, Position.make({ x: 300, y: 300 })],
			[lavaMonsterEntity, Position.make({ x: 500, y: 300 })],
		]);
		world = {
			...world,
			elevations: new Map(world.elevations).set(
				playerEntity,
				Elevation.make({ z: 60, velocity: 120 }),
			),
		};
		const moved = movement.update(world, 0.05);
		expect(moved.elevations.get(lavaMonsterEntity)).toEqual({
			z: groundElevation,
			velocity: stationaryVelocity,
		});
	});

	test("jumps over a sign without respawning", () => {
		const sign = EntityId(895);
		let world: World = {
			...worldWith(
				[
					[playerEntity, Position.make({ x: 280, y: 300 })],
					[lavaMonsterEntity, Position.make({ x: 430, y: 300 })],
					[sign, Position.make({ x: 400, y: 300 })],
				],
				new Map(),
				new Map([[sign, Body.make({ width: 88, depth: 56 })]]),
			),
			decorations: new Map([
				[sign, Decoration.make({ kind: DecorationKinds.Sign, height: 104 })],
			]),
		};
		world = {
			...world,
			elevations: new Map(world.elevations).set(
				lavaMonsterEntity,
				Elevation.make({ z: 100, velocity: -80 }),
			),
		};
		let respawned = false;
		for (let frame = 0; frame < 4; frame += 1) {
			world = movement.update(world, 0.05);
			const position = world.positions.get(lavaMonsterEntity);
			if (
				position?.x === lavaMonsterSpawnPosition.x &&
				position.y === lavaMonsterSpawnPosition.y
			)
				respawned = true;
		}
		expect(respawned).toBe(false);
		expect(world.positions.get(lavaMonsterEntity)?.x).toBeLessThan(430);
	});
});
