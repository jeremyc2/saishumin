import type { Body, Position } from "./components";

const horizontalProjectionScale = 1;
const depthProjectionScale = Math.SQRT1_2;
const cameraOrigin = { x: 220, y: 220 } as const;
export const viewport = { width: 1600, height: 900 } as const;
const cameraDeadZone = {
	left: 320,
	right: 1280,
	top: 200,
	bottom: 700,
} as const;

const project = (position: Position, z = 0): Position => ({
	x: cameraOrigin.x + position.x * horizontalProjectionScale,
	y: cameraOrigin.y + position.y * depthProjectionScale - z,
});

export const cameraForFloor = (
	floorPlan: Body,
	floorOrigin: Position = { x: 0, y: 0 },
): Position => {
	const projected = project({
		x: floorOrigin.x + floorPlan.width / 2,
		y: floorOrigin.y + floorPlan.depth / 2,
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
	const screen = { x: projected.x + camera.x, y: projected.y + camera.y };
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
