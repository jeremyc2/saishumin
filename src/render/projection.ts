import type { Body, Position } from "../world/components";

export { cameraForFloor, followCamera, viewport } from "../world/camera";

const horizontalProjectionScale = 1;
const depthProjectionScale = Math.SQRT1_2;
const cameraOrigin = { x: 220, y: 220 } as const;

export const project = (position: Position, z = 0): Position => ({
	x: cameraOrigin.x + position.x * horizontalProjectionScale,
	y: cameraOrigin.y + position.y * depthProjectionScale - z,
});

export const projectVector = (vector: Position): Position => ({
	x: vector.x * horizontalProjectionScale,
	y: vector.y * depthProjectionScale,
});

export const unproject = (position: Position, z = 0): Position => ({
	x: (position.x - cameraOrigin.x) / horizontalProjectionScale,
	y: (position.y - cameraOrigin.y + z) / depthProjectionScale,
});

export const points = (corners: ReadonlyArray<Position>): string =>
	corners.map(({ x, y }) => `${x},${y}`).join(" ");

export const projectedRectangle = (
	position: Position,
	body: Body,
	z = 0,
): readonly [Position, Position, Position, Position] => [
	project(
		{ x: position.x - body.width / 2, y: position.y - body.depth / 2 },
		z,
	),
	project(
		{ x: position.x + body.width / 2, y: position.y - body.depth / 2 },
		z,
	),
	project(
		{ x: position.x + body.width / 2, y: position.y + body.depth / 2 },
		z,
	),
	project(
		{ x: position.x - body.width / 2, y: position.y + body.depth / 2 },
		z,
	),
];

export const insetRectangle = (
	corners: readonly [Position, Position, Position, Position],
	inset: number,
): readonly [Position, Position, Position, Position] => [
	{ x: corners[0].x + inset, y: corners[0].y + inset },
	{ x: corners[1].x - inset, y: corners[1].y + inset },
	{ x: corners[2].x - inset, y: corners[2].y - inset },
	{ x: corners[3].x + inset, y: corners[3].y - inset },
];

export const visualDepth = (position: Position): number => position.y;
