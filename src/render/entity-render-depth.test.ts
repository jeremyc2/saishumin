import { describe, expect, test } from "bun:test";
import {
	Body,
	Decoration,
	DecorationKinds,
	Elevation,
	Obstacle,
	ObstacleKinds,
	Position,
} from "../world/components";
import { EntityId } from "../world/entity-id";
import { initialWorld } from "../world/initial-world";
import {
	crateBody,
	crateHeight,
	lavaMonsterBody,
	lavaMonsterEntity,
	playerBody,
	playerEntity,
} from "../world/world";
import {
	renderDepthForCharacter,
	renderDepthForEntity,
	renderDepthForPlayer,
} from "./entity-render-depth";

const platform = EntityId(920);
const backPlant = EntityId(921);
const frontPlant = EntityId(922);
const platformPosition = Position.make({ x: 500, y: 300 });
const platformHeight = 80;
const world = {
	...initialWorld,
	positions: new Map([
		[platform, platformPosition],
		[backPlant, Position.make({ x: 470, y: 250 })],
		[frontPlant, Position.make({ x: 530, y: 350 })],
	]),
	bodies: new Map([
		[platform, Body.make({ width: 260, depth: 180 })],
		[backPlant, Body.make({ width: 64, depth: 64 })],
		[frontPlant, Body.make({ width: 64, depth: 64 })],
	]),
	obstacles: new Map([
		[
			platform,
			Obstacle.make({
				kind: ObstacleKinds.Platform,
				height: platformHeight,
			}),
		],
	]),
	decorations: new Map([
		[backPlant, Decoration.make({ kind: DecorationKinds.Plant, height: 84 })],
		[frontPlant, Decoration.make({ kind: DecorationKinds.Plant, height: 84 })],
	]),
	elevations: new Map([
		[backPlant, Elevation.make({ z: platformHeight, velocity: 0 })],
		[frontPlant, Elevation.make({ z: platformHeight, velocity: 0 })],
	]),
};

describe("entity render depth", () => {
	test("draws supported objects after their platform", () => {
		const platformDepth = renderDepthForEntity(world, platform);
		expect(renderDepthForEntity(world, backPlant)).toBeGreaterThan(
			platformDepth,
		);
		expect(renderDepthForEntity(world, frontPlant)).toBeGreaterThan(
			platformDepth,
		);
	});

	test("draws the lava monster over the entire platform top", () => {
		const positionedWorld = {
			...world,
			positions: new Map(world.positions).set(
				lavaMonsterEntity,
				Position.make({ x: platformPosition.x, y: platformPosition.y - 60 }),
			),
			bodies: new Map(world.bodies).set(lavaMonsterEntity, lavaMonsterBody),
			elevations: new Map(world.elevations).set(
				lavaMonsterEntity,
				Elevation.make({ z: platformHeight, velocity: 0 }),
			),
		};

		expect(
			renderDepthForCharacter(
				positionedWorld,
				lavaMonsterEntity,
				lavaMonsterBody,
			),
		).toBeGreaterThan(renderDepthForEntity(positionedWorld, platform));
	});

	test("retains back-to-front ordering across the platform surface", () => {
		expect(renderDepthForEntity(world, frontPlant)).toBeGreaterThan(
			renderDepthForEntity(world, backPlant),
		);
	});

	test("draws the player over the entire top of a crate on a platform", () => {
		const crate = EntityId(923);
		const cratePosition = Position.make({ x: 470, y: 250 });
		const stackedWorld = {
			...world,
			positions: new Map(world.positions).set(crate, cratePosition),
			bodies: new Map(world.bodies)
				.set(crate, crateBody)
				.set(playerEntity, playerBody),
			obstacles: new Map(world.obstacles).set(
				crate,
				Obstacle.make({ kind: ObstacleKinds.Crate, height: crateHeight }),
			),
			elevations: new Map(world.elevations).set(
				crate,
				Elevation.make({ z: platformHeight, velocity: 0 }),
			),
		};

		for (const offset of [
			{ x: -8, y: -18 },
			{ x: 8, y: -18 },
			{ x: 0, y: 0 },
			{ x: -8, y: 18 },
			{ x: 8, y: 18 },
		]) {
			const positionedWorld = {
				...stackedWorld,
				positions: new Map(stackedWorld.positions).set(
					playerEntity,
					Position.make({
						x: cratePosition.x + offset.x,
						y: cratePosition.y + offset.y,
					}),
				),
				elevations: new Map(stackedWorld.elevations).set(
					playerEntity,
					Elevation.make({
						z: platformHeight + crateHeight,
						velocity: 0,
					}),
				),
			};

			expect(renderDepthForPlayer(positionedWorld)).toBeGreaterThan(
				renderDepthForEntity(positionedWorld, crate),
			);
		}
	});

	test("draws a player beside a supported crate without hiding them behind it", () => {
		const crate = EntityId(926);
		const cratePosition = Position.make({ x: 470, y: 250 });
		const playerPosition = Position.make({
			x: cratePosition.x + (crateBody.width + playerBody.width) / 2,
			y: cratePosition.y,
		});
		const positionedWorld = {
			...world,
			positions: new Map(world.positions)
				.set(crate, cratePosition)
				.set(playerEntity, playerPosition),
			bodies: new Map(world.bodies)
				.set(crate, crateBody)
				.set(playerEntity, playerBody),
			obstacles: new Map(world.obstacles).set(
				crate,
				Obstacle.make({ kind: ObstacleKinds.Crate, height: crateHeight }),
			),
			elevations: new Map(world.elevations)
				.set(crate, Elevation.make({ z: platformHeight, velocity: 0 }))
				.set(playerEntity, Elevation.make({ z: platformHeight, velocity: 0 })),
		};

		expect(renderDepthForPlayer(positionedWorld)).toBeGreaterThan(
			renderDepthForEntity(positionedWorld, crate),
		);
	});

	test("draws an offset upper crate after its lower crate", () => {
		const lowerCrate = EntityId(924);
		const upperCrate = EntityId(925);
		const lowerPosition = Position.make({ x: 470, y: 250 });
		const upperPosition = Position.make({ x: 525, y: 250 });
		const stackedWorld = {
			...world,
			positions: new Map(world.positions)
				.set(lowerCrate, lowerPosition)
				.set(upperCrate, upperPosition),
			bodies: new Map(world.bodies)
				.set(lowerCrate, crateBody)
				.set(upperCrate, crateBody),
			obstacles: new Map(world.obstacles)
				.set(
					lowerCrate,
					Obstacle.make({ kind: ObstacleKinds.Crate, height: crateHeight }),
				)
				.set(
					upperCrate,
					Obstacle.make({ kind: ObstacleKinds.Crate, height: crateHeight }),
				),
			elevations: new Map(world.elevations)
				.set(lowerCrate, Elevation.make({ z: platformHeight, velocity: 0 }))
				.set(
					upperCrate,
					Elevation.make({ z: platformHeight + crateHeight, velocity: 0 }),
				),
		};

		expect(renderDepthForEntity(stackedWorld, upperCrate)).toBeGreaterThan(
			renderDepthForEntity(stackedWorld, lowerCrate),
		);
	});
});
