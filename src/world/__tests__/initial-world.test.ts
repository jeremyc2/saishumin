import { describe, expect, test } from "bun:test";
import { EntityId } from "../entity-id";
import { initialWorld } from "../initial-world";
import { playerSpawnPosition, roomDepth, roomWidth } from "../world";

const playerEntity = EntityId(1);

describe("initial World", () => {
	test("starts the current single Authored Room exactly as before", () => {
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
		expect([...initialWorld.positions.keys()]).toEqual([
			playerEntity,
			EntityId(2),
			EntityId(3),
			EntityId(100),
			EntityId(101),
			EntityId(102),
			EntityId(103),
			EntityId(104),
			EntityId(200),
			EntityId(201),
			EntityId(202),
			EntityId(203),
			EntityId(300),
			EntityId(301),
			EntityId(401),
			EntityId(400),
		]);
	});
});
