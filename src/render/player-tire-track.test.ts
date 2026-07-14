import { describe, expect, test } from "bun:test";
import { entityTopElevation } from "../ecs/elevation";
import { groundElevation, initialWorld, wallEntities } from "../ecs/world";
import { Position } from "../model/component";
import { PlayerFacings } from "../model/player-facing";
import type { PlayerTrailMark } from "../model/player-trail";
import { playerTireTrackSurfaceOutline } from "./player-tire-track";
import { projectedRectangle } from "./projection";

describe("player tire track surface clipping", () => {
	test("uses only the top bounds of the supporting wall", () => {
		const wall = wallEntities[2];
		const position = initialWorld.positions.get(wall);
		const body = initialWorld.bodies.get(wall);
		expect(position).toBeDefined();
		expect(body).toBeDefined();
		if (position === undefined || body === undefined) return;
		const elevation = entityTopElevation(initialWorld, wall);
		const mark: PlayerTrailMark = {
			position: Position.make({
				x: position.x - body.width / 2,
				y: position.y,
			}),
			elevation,
			supportEntity: wall,
			facing: PlayerFacings.Down,
			age: 0,
		};

		expect(playerTireTrackSurfaceOutline(initialWorld, mark)).toEqual(
			projectedRectangle(position, body, elevation),
		);
	});

	test("clips ground marks to the room and rejects elevated ground marks", () => {
		const groundMark: PlayerTrailMark = {
			position: Position.make({ x: 0, y: 0 }),
			elevation: groundElevation,
			supportEntity: null,
			facing: PlayerFacings.Right,
			age: 0,
		};
		const elevatedGroundMark = { ...groundMark, elevation: 80 };

		expect(playerTireTrackSurfaceOutline(initialWorld, groundMark)).toEqual(
			projectedRectangle(
				{
					x: initialWorld.floorPlan.width / 2,
					y: initialWorld.floorPlan.depth / 2,
				},
				initialWorld.floorPlan,
				groundElevation,
			),
		);
		expect(
			playerTireTrackSurfaceOutline(initialWorld, elevatedGroundMark),
		).toBeUndefined();
	});
});
