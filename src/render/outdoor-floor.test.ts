import { describe, expect, test } from "bun:test";
import { Body } from "../world/components";
import { floorTilesCoveringPlan, initialFloorTiles } from "../world/floor";
import { outdoorFloorTiles, terrainTileSize } from "./outdoor-floor";

const floorPlan = Body.make({ width: 1_160, depth: 640 });

describe("outdoor floor", () => {
	test("builds stable, irregular terrain patches from multiple tile families", () => {
		const tiles = initialFloorTiles(floorPlan);
		const repeated = initialFloorTiles(floorPlan);

		expect(repeated).toEqual(tiles);
		expect(new Set(tiles.map(({ terrain }) => terrain))).toEqual(
			new Set(["grass", "sand", "dirt", "cobblestone"]),
		);

		const neighboringPairs = tiles.flatMap((tile) =>
			tiles
				.filter(
					(candidate) =>
						candidate.row === tile.row && candidate.column === tile.column + 1,
				)
				.map((neighbor) => [tile, neighbor] as const),
		);
		const matchingNeighbors = neighboringPairs.filter(
			([tile, neighbor]) => tile.terrain === neighbor.terrain,
		);
		expect(matchingNeighbors.length / neighboringPairs.length).toBeGreaterThan(
			0.65,
		);
	});

	test("selects edge and corner transitions from neighboring terrain", () => {
		const tiles = outdoorFloorTiles(
			initialFloorTiles(floorPlan),
			{ x: 220, y: 220 },
			{ left: 220, top: 220, width: 1_160, height: 453 },
		);
		const transitions = tiles.flatMap(({ transitions }) => transitions);

		expect(transitions.some(({ edge }) => edge !== undefined)).toBe(true);
		expect(transitions.some(({ corner }) => corner !== undefined)).toBe(true);
		expect(
			tiles.every((tile) =>
				tile.transitions.every(
					(transition) => transition.terrain !== tile.terrain,
				),
			),
		).toBe(true);
	});

	test("renders newly authored tiles when the floor is extended", () => {
		const initialTiles = initialFloorTiles(floorPlan);
		const extendedPlan = Body.make({ width: 1_960, depth: floorPlan.depth });
		const visibleTiles = outdoorFloorTiles(
			floorTilesCoveringPlan(initialTiles, { x: 0, y: 0 }, extendedPlan),
			{ x: 220, y: 220 },
			{ left: 1_600, top: 220, width: 800, height: 900 },
		);

		expect(visibleTiles.length).toBeGreaterThan(0);
	});

	test("only returns authored tiles in the viewport neighborhood", () => {
		const tiles = outdoorFloorTiles(
			initialFloorTiles(Body.make({ width: 8_000, depth: 8_000 })),
			{ x: 0, y: 0 },
			{ left: 3_000, top: 2_000, width: 1_600, height: 900 },
		);

		expect(tiles.length).toBeLessThan(600);
		expect(tiles.length).toBeGreaterThan(250);
	});

	test("prepares nearby terrain before scrolling reveals it", () => {
		const view = { left: 3_000, top: 2_000, width: 1_600, height: 900 };
		const tiles = outdoorFloorTiles(
			initialFloorTiles(Body.make({ width: 8_000, depth: 8_000 })),
			{ x: 0, y: 0 },
			view,
		);

		expect(
			tiles.some(
				(tile) => tile.position.x + terrainTileSize.width <= view.left,
			),
		).toBe(true);
		expect(
			tiles.every(
				(tile) =>
					tile.position.x + terrainTileSize.width >
					view.left - terrainTileSize.width * 2,
			),
		).toBe(true);
	});
});
