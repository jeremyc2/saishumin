import { afterAll, describe, expect, test } from "bun:test";
import { ManagedRuntime } from "effect";
import { Controls, type Direction } from "../../../model/control";
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
	crateEntities,
	crateHeight,
	groundElevation,
	lavaMonsterBody,
	lavaMonsterEntity,
	playerBody,
	playerEntity,
	roomDepth,
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

describe("MovementSystemService", () => {
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

			return movementSystem.update(world, 0.05).positions.get(crateEntity)?.y;
		};

		expect(moveToWall(604)).toBe(contactY);
		expect(moveToWall(604.5)).toBe(contactY);
	});

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

		const moved = movementSystem.update(world, 0.05);

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

		const moved = movementSystem.update(world, 0.05);

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

		const moved = movementSystem.update(world, 0.05);

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

			const moved = movementSystem.update(world, 0.05);

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

		const moved = movementSystem.update(world, 0.05);
		const movedPosition = moved.positions.get(playerEntity);

		expect(movedPosition).toBeDefined();
		if (movedPosition === undefined) return;
		expect(
			overlaps(movedPosition, playerBody, objectPosition, objectBody),
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

		const moved = movementSystem.update(world, 0.05);
		const movedPosition = moved.positions.get(playerEntity);

		expect(movedPosition).toBeDefined();
		if (movedPosition === undefined) return;
		expect(
			overlaps(movedPosition, playerBody, objectPosition, objectBody),
		).toBe(false);
		expect(moved.elevations.get(playerEntity)?.z).toBe(groundElevation);
	});

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

			const moved = movementSystem.update(world, 0.05);

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
			world = movementSystem.update(world, 0.05);
		}
		world = { ...world, pressed: new Set() };
		for (let frame = 0; frame < 16; frame += 1) {
			world = movementSystem.update(world, 0.05);
		}

		expect(
			overlaps(
				world.positions.get(playerEntity) ?? platformPosition,
				playerBody,
				cratePosition,
				crateBody,
			),
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
			world = movementSystem.update(world, 0.05);
		}
		expect(world.positions.get(crateEntity)?.x).toBe(550);
		expect(world.elevations.get(crateEntity)).toEqual({
			z: platformHeight,
			velocity: stationaryVelocity,
		});

		world = movementSystem.update(world, 0.05);
		expect(world.positions.get(crateEntity)?.x).toBe(558.75);
		expect(world.elevations.get(crateEntity)?.z).toBeLessThan(platformHeight);
		expect(world.elevations.get(crateEntity)?.velocity).toBeLessThan(0);

		for (let frame = 0; frame < 6; frame += 1) {
			world = movementSystem.update(world, 0.05);
		}
		expect(world.positions.get(crateEntity)?.x).toBeGreaterThan(558.75);
		expect(world.positions.get(playerEntity)?.x).toBeGreaterThan(520);
		expect(world.elevations.get(playerEntity)?.z).toBeLessThan(platformHeight);

		for (let frame = 0; frame < 5; frame += 1) {
			world = movementSystem.update(world, 0.05);
		}
		expect(world.elevations.get(crateEntity)).toEqual({
			z: groundElevation,
			velocity: stationaryVelocity,
		});
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

		const moved = movementSystem.update(world, 0.05);

		expect(
			overlaps(
				moved.positions.get(playerEntity) ?? cratePosition,
				playerBody,
				cratePosition,
				crateBody,
			),
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

		const moved = movementSystem.update(world, 0.05);

		expect(moved.positions.get(playerEntity)).toEqual(start);
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
			world = movementSystem.update(world, 0.05);
		}
		expect(world.positions.get(upperCrate)?.x).toBe(520);
		expect(world.elevations.get(upperCrate)?.z).toBe(crateHeight);

		world = movementSystem.update(world, 0.05);
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

			const moved = movementSystem.update(world, 0.05);

			expect(moved.positions.get(decorationEntity)?.x).toBeGreaterThan(start.x);
			expect(moved.positions.get(playerEntity)?.x).toBeGreaterThan(300);
		}
	});

	test("stops pushed and grabbed crates at lamps", () => {
		const crateEntity = crateEntities[0];
		const lampEntity = EntityId(901);
		const moveTowardLamp = (grabbed: EntityId | null): World =>
			movementSystem.update(
				makeWorld({
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
				0.05,
			);

		for (const grabbed of [null, crateEntity]) {
			const moved = moveTowardLamp(grabbed);
			expect(moved.positions.get(crateEntity)?.x).toBe(368);
			expect(moved.positions.get(lampEntity)?.x).toBe(435);
			expect(moved.positions.get(playerEntity)?.x).toBe(306);
			expect(moved.pushing).toBe(grabbed === null ? crateEntity : null);
		}
	});
});
