import { describe, expect, test } from "bun:test";
import {
	Body,
	Decoration,
	DecorationKinds,
	Elevation,
	Obstacle,
	ObstacleKinds,
	Position,
} from "../model/component";
import { EntityId } from "../model/entity-id";
import {
	entitiesSupportedBy,
	isSupportSurfaceTransformValid,
} from "./support-surface";
import { initialWorld } from "./world";

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
				Body.make({ width: 100, depth: 60 }),
				platformPosition,
				platformBody,
			),
		).toBe(false);
	});
});
