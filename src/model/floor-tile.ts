import type { Body, Position } from "./component";

export type FloorTerrain = "grass" | "sand" | "dirt" | "cobblestone";

export const floorTileVersion = 4;

export type FloorTile = {
	readonly version: typeof floorTileVersion;
	readonly column: number;
	readonly row: number;
	readonly terrain: FloorTerrain;
};

export const floorTileWorldSize = {
	width: 80,
	depth: 80,
} as const;

const hash = (column: number, row: number, seed: number): number => {
	let value =
		Math.imul(column, 374_761_393) +
		Math.imul(row, 668_265_263) +
		Math.imul(seed, 69_069);
	value = Math.imul(value ^ (value >>> 13), 1_274_126_177);
	return (value >>> 0) / 4_294_967_295;
};

const smooth = (value: number): number => value * value * (3 - 2 * value);

const noise = (x: number, y: number, seed: number): number => {
	const left = Math.floor(x);
	const top = Math.floor(y);
	const horizontal = smooth(x - left);
	const vertical = smooth(y - top);
	const topLeft = hash(left, top, seed);
	const topRight = hash(left + 1, top, seed);
	const bottomLeft = hash(left, top + 1, seed);
	const bottomRight = hash(left + 1, top + 1, seed);
	const topValue = topLeft + (topRight - topLeft) * horizontal;
	const bottomValue = bottomLeft + (bottomRight - bottomLeft) * horizontal;
	return topValue + (bottomValue - topValue) * vertical;
};

type TerrainPatch = {
	readonly terrain: Exclude<FloorTerrain, "grass">;
	readonly center: Position;
	readonly radius: Position;
	readonly seed: number;
};

const terrainPatches: ReadonlyArray<TerrainPatch> = [
	{
		terrain: "cobblestone",
		center: { x: 0.56, y: 0.23 },
		radius: { x: 0.08, y: 0.12 },
		seed: 41,
	},
	{
		terrain: "dirt",
		center: { x: 0.42, y: 0.76 },
		radius: { x: 0.14, y: 0.18 },
		seed: 29,
	},
	{
		terrain: "sand",
		center: { x: 0.18, y: 0.31 },
		radius: { x: 0.18, y: 0.23 },
		seed: 17,
	},
	{
		terrain: "sand",
		center: { x: 0.76, y: 0.72 },
		radius: { x: 0.16, y: 0.2 },
		seed: 19,
	},
];

const terrainAt = (
	column: number,
	row: number,
	center: Position,
	floorPlan: Body,
): FloorTerrain => {
	const normalized = {
		x: center.x / floorPlan.width,
		y: center.y / floorPlan.depth,
	};
	for (const patch of terrainPatches) {
		const horizontal = (normalized.x - patch.center.x) / patch.radius.x;
		const vertical = (normalized.y - patch.center.y) / patch.radius.y;
		const irregularEdge = (noise(column / 3, row / 3, patch.seed) - 0.5) * 0.42;
		if (Math.hypot(horizontal, vertical) + irregularEdge < 1)
			return patch.terrain;
	}
	return "grass";
};

export const initialFloorTiles = (
	floorPlan: Body,
): ReadonlyArray<FloorTile> => {
	const tiles: Array<FloorTile> = [];
	const rowCount = Math.ceil(floorPlan.depth / floorTileWorldSize.depth);
	const columnCount = Math.ceil(floorPlan.width / floorTileWorldSize.width);
	for (let row = 0; row < rowCount; row++) {
		for (let column = 0; column < columnCount; column++) {
			const center = {
				x: column * floorTileWorldSize.width + floorTileWorldSize.width / 2,
				y: row * floorTileWorldSize.depth + floorTileWorldSize.depth / 2,
			};
			const terrain = terrainAt(column, row, center, floorPlan);
			tiles.push({
				version: floorTileVersion,
				column,
				row,
				terrain,
			});
		}
	}
	return tiles;
};

const tileKey = (column: number, row: number): string => `${column}:${row}`;

export const floorTilesCoveringPlan = (
	tiles: ReadonlyArray<FloorTile>,
	origin: Position,
	floorPlan: Body,
	floorOrigin: Position = { x: 0, y: 0 },
): ReadonlyArray<FloorTile> => {
	const minimumColumn = Math.floor(
		(floorOrigin.x - origin.x) / floorTileWorldSize.width,
	);
	const maximumColumn =
		Math.ceil(
			(floorOrigin.x + floorPlan.width - origin.x) / floorTileWorldSize.width,
		) - 1;
	const minimumRow = Math.floor(
		(floorOrigin.y - origin.y) / floorTileWorldSize.depth,
	);
	const maximumRow =
		Math.ceil(
			(floorOrigin.y + floorPlan.depth - origin.y) / floorTileWorldSize.depth,
		) - 1;
	const existing = new Set(
		tiles.map(({ column, row }) => tileKey(column, row)),
	);
	const added: Array<FloorTile> = [];
	for (let row = minimumRow; row <= maximumRow; row++) {
		for (let column = minimumColumn; column <= maximumColumn; column++) {
			if (existing.has(tileKey(column, row))) continue;
			added.push({ version: floorTileVersion, column, row, terrain: "grass" });
		}
	}
	return added.length === 0 ? tiles : [...tiles, ...added];
};
