import { describe, expect, test } from "bun:test";
import { Position } from "../model/component";
import { PlayerFacings } from "../model/player-facing";
import type { PlayerTrailMark } from "../model/player-trail";
import {
	clipTireTrackPolygonToSurface,
	crateShadowDepthOffset,
	playerDrawingForFacing,
	playerTireTrackDirection,
	playerTireTrackIsTurning,
} from "./templates";

describe("crate shadows", () => {
	test("only offsets shadow sections below the supporting surface", () => {
		expect(crateShadowDepthOffset(62, 62)).toBe(0);
		expect(crateShadowDepthOffset(62, 0)).toBeGreaterThan(0);
	});
});

describe("player drawings", () => {
	test("uses five authored views for eight facings", () => {
		const drawings = [
			PlayerFacings.Up,
			PlayerFacings.UpRight,
			PlayerFacings.Right,
			PlayerFacings.DownRight,
			PlayerFacings.Down,
			PlayerFacings.DownLeft,
			PlayerFacings.Left,
			PlayerFacings.UpLeft,
		].map(playerDrawingForFacing);

		expect(new Set(drawings.map(({ view }) => view)).size).toBe(5);
		expect(drawings[1]?.view).toBe(drawings[7]?.view);
		expect(drawings[1]?.mirror).toBe(false);
		expect(drawings[7]?.mirror).toBe(true);
		expect(drawings[2]?.view).toBe(drawings[6]?.view);
		expect(drawings[2]?.mirror).toBe(false);
		expect(drawings[6]?.mirror).toBe(true);
		expect(drawings[3]?.view).toBe(drawings[5]?.view);
		expect(drawings[3]?.mirror).toBe(false);
		expect(drawings[5]?.mirror).toBe(true);
	});
});

describe("player tire tracks", () => {
	const mark = (
		x: number,
		y: number,
		facing = PlayerFacings.Right,
	): PlayerTrailMark => ({
		position: Position.make({ x, y }),
		elevation: 0,
		supportEntity: null,
		facing,
		age: 0,
	});

	test("blends tread direction through a tight corner", () => {
		const direction = playerTireTrackDirection(
			mark(-12, 0),
			mark(0, 0),
			mark(0, 12, PlayerFacings.Down),
		);

		expect(direction.x).toBeCloseTo(Math.SQRT1_2);
		expect(direction.y).toBeCloseTo(Math.SQRT1_2);
		expect(
			playerTireTrackIsTurning(
				mark(-12, 0),
				mark(0, 0),
				mark(0, 12, PlayerFacings.Down),
			),
		).toBe(true);
	});

	test("uses movement instead of a stale facing for straight tread", () => {
		const direction = playerTireTrackDirection(
			mark(0, 0, PlayerFacings.Up),
			mark(12, 0, PlayerFacings.Up),
			undefined,
		);

		expect(direction).toEqual({ x: 1, y: 0 });
		expect(
			playerTireTrackIsTurning(
				mark(0, 0, PlayerFacings.Up),
				mark(12, 0, PlayerFacings.Up),
				mark(24, 0, PlayerFacings.Up),
			),
		).toBe(false);
	});

	test("trims tread polygons at a supporting surface edge", () => {
		const clipped = clipTireTrackPolygonToSurface(
			[
				{ x: 8, y: 4 },
				{ x: 14, y: 4 },
				{ x: 14, y: 8 },
				{ x: 8, y: 8 },
			],
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
				{ x: 0, y: 10 },
			],
		);

		expect(clipped.length).toBeGreaterThanOrEqual(3);
		expect(clipped.every(({ x }) => x <= 10)).toBe(true);
		expect(Math.max(...clipped.map(({ x }) => x))).toBe(10);
	});
});
