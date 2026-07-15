import type { Position } from "../../world/components";
import {
	type FloorTerrain,
	type FloorTile,
	floorTileWorldSize,
} from "../../world/floor";
import { projectVector } from "../geometry/projection";

export type TerrainEdge = "top" | "right" | "bottom" | "left";
export type TerrainCorner =
	| "top-left"
	| "top-right"
	| "bottom-right"
	| "bottom-left";

export type TerrainTransition = {
	readonly terrain: FloorTerrain;
	readonly edge?: TerrainEdge;
	readonly corner?: TerrainCorner;
};

export type OutdoorFloorTile = FloorTile & {
	readonly position: Position;
	readonly transitions: ReadonlyArray<TerrainTransition>;
};

export type OutdoorFloorBounds = {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
};

const projectedTileSize = projectVector({
	x: floorTileWorldSize.width,
	y: floorTileWorldSize.depth,
});
export const terrainTileSize = {
	width: projectedTileSize.x,
	height: projectedTileSize.y,
} as const;
const terrainOverscan = {
	x: terrainTileSize.width * 2,
	y: terrainTileSize.height * 2,
} as const;

const terrainPriority: Record<FloorTerrain, number> = {
	cobblestone: 0,
	sand: 1,
	dirt: 2,
	grass: 3,
};

const tileKey = (column: number, row: number): string => `${column}:${row}`;

const transitionTerrain = (
	tile: FloorTile,
	neighbor: FloorTile | undefined,
): FloorTerrain | undefined =>
	neighbor !== undefined &&
	terrainPriority[neighbor.terrain] > terrainPriority[tile.terrain]
		? neighbor.terrain
		: undefined;

const transitionsForTile = (
	tile: FloorTile,
	tiles: ReadonlyMap<string, FloorTile>,
): ReadonlyArray<TerrainTransition> => {
	const neighbors = {
		top: tiles.get(tileKey(tile.column, tile.row - 1)),
		right: tiles.get(tileKey(tile.column + 1, tile.row)),
		bottom: tiles.get(tileKey(tile.column, tile.row + 1)),
		left: tiles.get(tileKey(tile.column - 1, tile.row)),
	} as const;
	const edges = (Object.keys(neighbors) as ReadonlyArray<TerrainEdge>).flatMap(
		(edge) => {
			const terrain = transitionTerrain(tile, neighbors[edge]);
			return terrain === undefined ? [] : [{ terrain, edge }];
		},
	);
	const corners = [
		["top-left", "top", "left"],
		["top-right", "top", "right"],
		["bottom-right", "bottom", "right"],
		["bottom-left", "bottom", "left"],
	] as const;
	const cornerTransitions = corners.flatMap(
		([corner, firstEdge, secondEdge]) => {
			const first = transitionTerrain(tile, neighbors[firstEdge]);
			const second = transitionTerrain(tile, neighbors[secondEdge]);
			return first !== undefined && first === second
				? [{ terrain: first, corner }]
				: [];
		},
	);
	return [...edges, ...cornerTransitions].sort(
		(left, right) =>
			terrainPriority[left.terrain] - terrainPriority[right.terrain],
	);
};

export const outdoorFloorTiles = (
	tiles: ReadonlyArray<FloorTile>,
	origin: Position,
	view: OutdoorFloorBounds,
): ReadonlyArray<OutdoorFloorTile> => {
	const tilesByPosition = new Map(
		tiles.map((tile) => [tileKey(tile.column, tile.row), tile] as const),
	);
	const viewLeft = view.left - terrainOverscan.x;
	const viewTop = view.top - terrainOverscan.y;
	const viewRight = view.left + view.width + terrainOverscan.x;
	const viewBottom = view.top + view.height + terrainOverscan.y;
	return tiles.flatMap((tile) => {
		const position = {
			x: origin.x + tile.column * terrainTileSize.width,
			y: origin.y + tile.row * terrainTileSize.height,
		};
		if (
			position.x >= viewRight ||
			position.x + terrainTileSize.width <= viewLeft ||
			position.y >= viewBottom ||
			position.y + terrainTileSize.height <= viewTop
		)
			return [];
		return [
			{
				...tile,
				position,
				transitions: transitionsForTile(tile, tilesByPosition),
			},
		];
	});
};
