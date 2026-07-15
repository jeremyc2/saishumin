import { describe, expect, test } from "bun:test";
import {
	Body,
	Decoration,
	DecorationKinds,
	Elevation,
	Obstacle,
	ObstacleKinds,
	Position,
} from "../../components";
import { EntityId } from "../../entity-id";
import { initialWorld } from "../../initial-world";
import {
	shadowElevationForEntity,
	shadowSectionsForEntity,
} from "../elevation";
import {
	entitiesSupportedBy,
	isSupportSurfaceTransformValid,
} from "../support-surface";

const platform = EntityId(940);
const plant = EntityId(941);
const platformPosition = Position.make({ x: 500, y: 400 });
const platformBody = Body.make({ width: 240, depth: 180 });
const plantPosition = Position.make({ x: 500, y: 360 });
const plantBody = Body.make({ width: 64, depth: 64 });
const platformHeight = 50;
const world = {
	...initialWorld,
	positions: new Map([
		[platform, platformPosition],
		[plant, plantPosition],
	]),
	bodies: new Map([
		[platform, platformBody],
		[plant, plantBody],
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
		[plant, Decoration.make({ kind: DecorationKinds.Plant, height: 84 })],
	]),
	elevations: new Map([
		[plant, Elevation.make({ z: platformHeight, velocity: 0 })],
	]),
};

describe("support surfaces", () => {
	test("finds objects resting on a platform", () => {
		expect(
			entitiesSupportedBy(world, platform, platformPosition, platformBody),
		).toEqual([plant]);
	});

	test("keeps an offset crate supported while any body bounds still overlap", () => {
		const lowerCrate = EntityId(942);
		const upperCrate = EntityId(943);
		const lowerPosition = Position.make({ x: 500, y: 400 });
		const upperPosition = Position.make({ x: 569, y: 400 });
		const crateBody = Body.make({ width: 70, depth: 70 });
		const crateHeight = 62;
		const stackedWorld = {
			...world,
			positions: new Map([
				[lowerCrate, lowerPosition],
				[upperCrate, upperPosition],
			]),
			bodies: new Map([
				[lowerCrate, crateBody],
				[upperCrate, crateBody],
			]),
			obstacles: new Map([
				[
					lowerCrate,
					Obstacle.make({ kind: ObstacleKinds.Crate, height: crateHeight }),
				],
				[
					upperCrate,
					Obstacle.make({ kind: ObstacleKinds.Crate, height: crateHeight }),
				],
			]),
			decorations: new Map(),
			elevations: new Map([
				[upperCrate, Elevation.make({ z: crateHeight, velocity: 0 })],
			]),
		};

		expect(
			entitiesSupportedBy(stackedWorld, lowerCrate, lowerPosition, crateBody),
		).toEqual([upperCrate]);
	});

	test("projects an overhanging crate shadow onto the surface below", () => {
		const crate = EntityId(944);
		const crateBody = Body.make({ width: 70, depth: 70 });
		const overhangingPosition = Position.make({ x: 654, y: 400 });
		const overhangingWorld = {
			...world,
			positions: new Map([
				[platform, platformPosition],
				[crate, overhangingPosition],
			]),
			bodies: new Map([
				[platform, platformBody],
				[crate, crateBody],
			]),
			obstacles: new Map([
				[
					platform,
					Obstacle.make({
						kind: ObstacleKinds.Platform,
						height: platformHeight,
					}),
				],
				[crate, Obstacle.make({ kind: ObstacleKinds.Crate, height: 62 })],
			]),
			decorations: new Map(),
			elevations: new Map([
				[crate, Elevation.make({ z: platformHeight, velocity: 0 })],
			]),
		};

		expect(
			shadowElevationForEntity(
				overhangingWorld,
				crate,
				overhangingPosition,
				crateBody,
			),
		).toBe(0);
		const sections = shadowSectionsForEntity(
			overhangingWorld,
			crate,
			overhangingPosition,
			crateBody,
		);
		expect(
			sections.some((section) => section.elevation === platformHeight),
		).toBe(false);
		expect(sections.some((section) => section.elevation === 0)).toBe(true);
		expect(sections).toHaveLength(1);
		expect(sections[0]?.body.width).toBe(69);
	});

	test("does not project a rear overhang onto the supporting crate's front", () => {
		const lowerCrate = EntityId(945);
		const upperCrate = EntityId(946);
		const crateBody = Body.make({ width: 70, depth: 70 });
		const lowerPosition = Position.make({ x: 500, y: 400 });
		const upperPosition = Position.make({ x: 480, y: 380 });
		const stackedWorld = {
			...world,
			positions: new Map([
				[lowerCrate, lowerPosition],
				[upperCrate, upperPosition],
			]),
			bodies: new Map([
				[lowerCrate, crateBody],
				[upperCrate, crateBody],
			]),
			obstacles: new Map([
				[lowerCrate, Obstacle.make({ kind: ObstacleKinds.Crate, height: 62 })],
				[upperCrate, Obstacle.make({ kind: ObstacleKinds.Crate, height: 62 })],
			]),
			decorations: new Map(),
			elevations: new Map([
				[upperCrate, Elevation.make({ z: 62, velocity: 0 })],
			]),
		};

		const sections = shadowSectionsForEntity(
			stackedWorld,
			upperCrate,
			upperPosition,
			crateBody,
		);

		expect(sections).toHaveLength(1);
		expect(sections[0]?.body).toEqual({ width: 20, depth: 70 });
		expect(sections[0]?.position.x).toBeLessThan(
			lowerPosition.x - crateBody.width / 2,
		);
	});

	test("blocks moving an occupied platform", () => {
		expect(
			isSupportSurfaceTransformValid(
				world,
				platform,
				Position.make({ x: 600, y: 400 }),
				platformBody,
				platformPosition,
				platformBody,
			),
		).toBe(false);
	});

	test("allows safe expansion but blocks shrinking out from under an object", () => {
		expect(
			isSupportSurfaceTransformValid(
				world,
				platform,
				platformPosition,
				Body.make({ width: 300, depth: 220 }),
				platformPosition,
				platformBody,
			),
		).toBe(true);
		expect(
			isSupportSurfaceTransformValid(
				world,
				platform,
				platformPosition,
				Body.make({ width: 100, depth: 16 }),
				platformPosition,
				platformBody,
			),
		).toBe(false);
	});
});
