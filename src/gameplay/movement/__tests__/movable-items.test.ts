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
import {
	crateBody,
	crateHeight,
	groundElevation,
	playerBody,
	roomDepth,
	stationaryVelocity,
	type World,
} from "../../../world/world";
import { MovementSystemService } from "../movement-system";

const playerEntity = EntityId(1);
const lavaMonsterEntity = EntityId(2);
const crateEntities = [EntityId(200)] as const;

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

describe("MovementSystemService movable items", () => {
	test("moves grabbed crates to the exact bare floor boundary", () => {
		const crateEntity = crateEntities[0];
		const contactY = roomDepth - crateBody.depth / 2;
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
				decorations: new Map(),
				elevation: Elevation.make({
					z: groundElevation,
					velocity: stationaryVelocity,
				}),
				pressed: new Set([Controls.Down]),
				grabbed: crateEntity,
			});

			return movementSystem
				.update({ world: world, elapsed: 0.05 })
				.positions.get(crateEntity)?.y;
		};

		expect(moveToWall(604)).toBe(contactY);
		expect(moveToWall(604.5)).toBe(contactY);
	});

	test("pushes an offset upper crate while the player stands on its lower crate", () => {
		const lowerCrate = EntityId(945);
		const upperCrate = EntityId(946);
		const lowerBody = Body.make({ width: 180, depth: 100 });
		let world = makeWorld({
			positions: new Map([
				[playerEntity, Position.make({ x: 388, y: 300 })],
				[lowerCrate, Position.make({ x: 400, y: 300 })],
				[upperCrate, Position.make({ x: 450, y: 300 })],
			]),
			bodies: new Map([
				[playerEntity, playerBody],
				[lowerCrate, lowerBody],
				[upperCrate, crateBody],
			]),
			obstacles: new Map([
				[
					lowerCrate,
					Obstacle.make({ height: crateHeight, kind: ObstacleKinds.Crate }),
				],
				[
					upperCrate,
					Obstacle.make({ height: crateHeight, kind: ObstacleKinds.Crate }),
				],
			]),
			decorations: new Map(),
			elevation: Elevation.make({
				z: crateHeight,
				velocity: stationaryVelocity,
			}),
			pressed: new Set([Controls.Right]),
			grabbed: null,
		});
		world = {
			...world,
			elevations: new Map(world.elevations).set(
				upperCrate,
				Elevation.make({ z: crateHeight, velocity: stationaryVelocity }),
			),
		};

		for (let frame = 0; frame < 8; frame += 1) {
			world = movementSystem.update({ world: world, elapsed: 0.05 });
		}
		expect(world.positions.get(upperCrate)?.x).toBe(520);
		expect(world.elevations.get(upperCrate)?.z).toBe(crateHeight);

		world = movementSystem.update({ world: world, elapsed: 0.05 });
		expect(world.positions.get(upperCrate)?.x).toBe(528.75);
		expect(world.elevations.get(upperCrate)?.z).toBeLessThan(crateHeight);
	});

	test("moves grabbed plants and lamps", () => {
		for (const [kind, height] of [
			[DecorationKinds.Plant, 84],
			[DecorationKinds.Lamp, 96],
		] as const) {
			const decorationEntity = EntityId(920 + height);
			const start = Position.make({ x: 360, y: 300 });
			const world = makeWorld({
				positions: new Map([
					[playerEntity, Position.make({ x: 300, y: 300 })],
					[decorationEntity, start],
				]),
				bodies: new Map([
					[playerEntity, playerBody],
					[decorationEntity, Body.make({ width: 64, depth: 64 })],
				]),
				obstacles: new Map(),
				decorations: new Map([
					[decorationEntity, Decoration.make({ kind, height })],
				]),
				elevation: Elevation.make({
					z: groundElevation,
					velocity: stationaryVelocity,
				}),
				pressed: new Set([Controls.Right]),
				grabbed: decorationEntity,
			});

			const moved = movementSystem.update({ world: world, elapsed: 0.05 });

			expect(moved.positions.get(decorationEntity)?.x).toBeGreaterThan(start.x);
			expect(moved.positions.get(playerEntity)?.x).toBeGreaterThan(300);
		}
	});

	test("stops pushed and grabbed crates at lamps", () => {
		const crateEntity = crateEntities[0];
		const lampEntity = EntityId(901);
		const moveTowardLamp = (grabbed: EntityId | null): World =>
			movementSystem.update({
				world: makeWorld({
					positions: new Map([
						[playerEntity, Position.make({ x: 298, y: 300 })],
						[crateEntity, Position.make({ x: 360, y: 300 })],
						[lampEntity, Position.make({ x: 435, y: 300 })],
					]),
					bodies: new Map([
						[playerEntity, playerBody],
						[crateEntity, crateBody],
						[lampEntity, Body.make({ width: 64, depth: 64 })],
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
					pressed: new Set([Controls.Right]),
					grabbed,
				}),
				elapsed: 0.05,
			});

		for (const grabbed of [null, crateEntity]) {
			const moved = moveTowardLamp(grabbed);
			expect(moved.positions.get(crateEntity)?.x).toBe(368);
			expect(moved.positions.get(lampEntity)?.x).toBe(435);
			expect(moved.positions.get(playerEntity)?.x).toBe(306);
			expect(moved.pushing).toBe(grabbed === null ? crateEntity : null);
		}
	});
});
