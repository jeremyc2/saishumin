import { Graph, Option } from "effect";
import type { Position } from "../../../world/components";

type GridPoint = {
	readonly column: number;
	readonly row: number;
	readonly position: Position;
	readonly target: boolean;
};

export type GridNavigationRequest = {
	readonly origin: Position;
	readonly target: Position;
	readonly arrivalDistance: number;
	readonly spacing: number;
	readonly maximumColumns: number;
	readonly maximumRows: number;
	readonly canOccupy: (position: Position) => boolean;
};

const directions = [
	{ column: -1, row: 0 },
	{ column: 1, row: 0 },
	{ column: 0, row: -1 },
	{ column: 0, row: 1 },
	{ column: -1, row: -1 },
	{ column: 1, row: -1 },
	{ column: -1, row: 1 },
	{ column: 1, row: 1 },
] as const;

const gridKey = (column: number, row: number): string => `${column}:${row}`;

export const findGridPath = (
	request: GridNavigationRequest,
): ReadonlyArray<Position> => {
	let source = 0;
	let target = 0;
	const graph = Graph.directed<GridPoint, number>((mutable) => {
		const nodes = new Map<string, Graph.NodeIndex>();
		for (
			let column = -request.maximumColumns;
			column <= request.maximumColumns;
			column += 1
		) {
			for (
				let row = -request.maximumRows;
				row <= request.maximumRows;
				row += 1
			) {
				const position = {
					x: request.origin.x + column * request.spacing,
					y: request.origin.y + row * request.spacing,
				};
				if ((column !== 0 || row !== 0) && !request.canOccupy(position))
					continue;
				const node = Graph.addNode(mutable, {
					column,
					row,
					position,
					target: false,
				});
				nodes.set(gridKey(column, row), node);
				if (column === 0 && row === 0) source = node;
			}
		}
		target = Graph.addNode(mutable, {
			column: 0,
			row: 0,
			position: request.target,
			target: true,
		});
		for (const node of nodes.values()) {
			const point = Option.getOrUndefined(Graph.getNode(mutable, node));
			if (point === undefined) continue;
			if (
				Math.hypot(
					point.position.x - request.target.x,
					point.position.y - request.target.y,
				) <= request.arrivalDistance
			)
				Graph.addEdge(mutable, node, target, 0);
			for (const direction of directions) {
				const neighbor = nodes.get(
					gridKey(point.column + direction.column, point.row + direction.row),
				);
				if (neighbor === undefined) continue;
				if (
					direction.column !== 0 &&
					direction.row !== 0 &&
					(!nodes.has(gridKey(point.column + direction.column, point.row)) ||
						!nodes.has(gridKey(point.column, point.row + direction.row)))
				)
					continue;
				Graph.addEdge(
					mutable,
					node,
					neighbor,
					Math.hypot(direction.column, direction.row),
				);
			}
		}
	});
	const result = Graph.astar(graph, {
		source,
		target,
		cost: (cost) => cost,
		heuristic: (point) =>
			point.target
				? 0
				: Math.max(
						0,
						Math.hypot(
							point.position.x - request.target.x,
							point.position.y - request.target.y,
						) - request.arrivalDistance,
					) / request.spacing,
	});
	if (Option.isNone(result)) return [];
	return result.value.path
		.map((node) => Option.getOrUndefined(Graph.getNode(graph, node)))
		.filter(
			(point): point is GridPoint =>
				point !== undefined &&
				!point.target &&
				(point.column !== 0 || point.row !== 0),
		)
		.map(({ position }) => position);
};
