import { describe, expect, test } from "bun:test";
import { initialWorld } from "../ecs/world";
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
import { renderDepthForEntity } from "./entity-render-depth";

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

	test("retains back-to-front ordering across the platform surface", () => {
		expect(renderDepthForEntity(world, frontPlant)).toBeGreaterThan(
			renderDepthForEntity(world, backPlant),
		);
	});
});
