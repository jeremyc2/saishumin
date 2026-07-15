import { describe, expect, test } from "bun:test";
import { initialWorld } from "../initial-world";
import {
	crateEntities,
	decorationEntities,
	lavaMonsterEntity,
	platformEntities,
	playerEntity,
	playerSpawnPosition,
	roomDepth,
	roomWidth,
	signEntities,
	wallEntities,
} from "../world";

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
			lavaMonsterEntity,
			...wallEntities,
			...crateEntities,
			...platformEntities,
			...signEntities,
			...decorationEntities,
		]);
	});
});
