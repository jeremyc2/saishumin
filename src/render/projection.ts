import type { Body, Position } from "../model/component";

const horizontalProjectionScale = 1;
const depthProjectionScale = Math.SQRT1_2;
const cameraOrigin = { x: 220, y: 220 } as const;
export const viewport = { width: 1600, height: 900 } as const;
export const cameraDeadZone = {
	left: 320,
	right: 1280,
	top: 200,
	bottom: 700,
} as const;

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

export const cameraForFloor = (floorPlan: Body): Position => {
	const projected = project({
		x: floorPlan.width / 2,
		y: floorPlan.depth / 2,
	});
	return {
		x: viewport.width / 2 - projected.x,
		y: viewport.height / 2 - projected.y,
	};
};

export const followCamera = (
	camera: Position,
	position: Position,
	z = 0,
): Position => {
	const projected = project(position, z);
	const screen = {
		x: projected.x + camera.x,
		y: projected.y + camera.y,
	};
	let x = camera.x;
	let y = camera.y;
	if (screen.x < cameraDeadZone.left) x += cameraDeadZone.left - screen.x;
	else if (screen.x > cameraDeadZone.right)
		x -= screen.x - cameraDeadZone.right;
	if (screen.y < cameraDeadZone.top) y += cameraDeadZone.top - screen.y;
	else if (screen.y > cameraDeadZone.bottom)
		y -= screen.y - cameraDeadZone.bottom;
	return { x, y };
};

export const points = (corners: ReadonlyArray<Position>): string =>
	corners.map(({ x, y }) => `${x},${y}`).join(" ");

export const footprint = (
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
