import { describe, expect, test } from "bun:test";
import { EntityId } from "../entity-id";
import { initialWorld } from "../initial-world";
import { playerSpawnPosition, roomDepth, roomWidth } from "../world";

const playerEntity = EntityId(1);

describe("initial World", () => {
	test("starts the current Authored Room with one World-wide Entity ID sequence", () => {
		expect(initialWorld.floorPlan).toEqual({
			width: roomWidth,
			depth: roomDepth,
		});
		expect(initialWorld.floorOrigin).toEqual({ x: 0, y: 0 });
		expect(initialWorld.gameCamera).toEqual({
			x: 0,
			y: 3.7258300203047847,
		});
		expect(initialWorld.positions.get(playerEntity)).toEqual(
			playerSpawnPosition,
		);
		const entityIds = [...initialWorld.positions.keys()];
		expect(entityIds).toHaveLength(15);
		expect(entityIds).toEqual(entityIds.map((_, index) => EntityId(index + 1)));
	});
});
