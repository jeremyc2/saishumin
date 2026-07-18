import { dual } from "effect/Function";
import type { Body, Position } from "../../world/components";
import { groundElevation, playerEntityIn, type World } from "../../world/world";

const horizontalProjectionScale = 1;
const depthProjectionScale = Math.SQRT1_2;
const cameraOrigin = { x: 220, y: 220 } as const;
export const viewport = { width: 1600, height: 900 } as const;
const cameraDeadZone = {
	left: 640,
	right: 960,
	top: 280,
	bottom: 620,
} as const;

export const project = dual<
	(z?: number) => (self: Position) => Position,
	(self: Position, z?: number) => Position
>(
	(arguments_) => typeof arguments_[0] === "object",
	(position: Position, z: number = 0): Position => ({
		x: cameraOrigin.x + position.x * horizontalProjectionScale,
		y: cameraOrigin.y + position.y * depthProjectionScale - z,
	}),
);

export const projectVector = (vector: Position): Position => ({
	x: vector.x * horizontalProjectionScale,
	y: vector.y * depthProjectionScale,
});

export const unproject = dual<
	(z?: number) => (self: Position) => Position,
	(self: Position, z?: number) => Position
>(
	(arguments_) => typeof arguments_[0] === "object",
	(position: Position, z: number = 0): Position => ({
		x: (position.x - cameraOrigin.x) / horizontalProjectionScale,
		y: (position.y - cameraOrigin.y + z) / depthProjectionScale,
	}),
);

export const points = (corners: ReadonlyArray<Position>): string =>
	corners.map(({ x, y }) => `${x},${y}`).join(" ");

export const projectedRectangle = dual<
	(
		body: Body,
		z?: number,
	) => (self: Position) => readonly [Position, Position, Position, Position],
	(
		self: Position,
		body: Body,
		z?: number,
	) => readonly [Position, Position, Position, Position]
>(
	(arguments_) => typeof arguments_[0] === "object" && "x" in arguments_[0],
	(
		position: Position,
		body: Body,
		z: number = 0,
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
	],
);

export const insetRectangle = dual<
	(
		inset: number,
	) => (
		self: readonly [Position, Position, Position, Position],
	) => readonly [Position, Position, Position, Position],
	(
		self: readonly [Position, Position, Position, Position],
		inset: number,
	) => readonly [Position, Position, Position, Position]
>(
	2,
	(
		corners: readonly [Position, Position, Position, Position],
		inset: number,
	): readonly [Position, Position, Position, Position] => [
		{ x: corners[0].x + inset, y: corners[0].y + inset },
		{ x: corners[1].x - inset, y: corners[1].y + inset },
		{ x: corners[2].x - inset, y: corners[2].y - inset },
		{ x: corners[3].x + inset, y: corners[3].y - inset },
	],
);

export const visualDepth = (position: Position): number => position.y;

export const cameraForFloor = dual<
	(floorOrigin?: Position) => (self: Body) => Position,
	(self: Body, floorOrigin?: Position) => Position
>(
	(arguments_) => typeof arguments_[0] === "object" && "width" in arguments_[0],
	(floorPlan: Body, floorOrigin: Position = { x: 0, y: 0 }): Position => {
		const projected = project({
			x: floorOrigin.x + floorPlan.width / 2,
			y: floorOrigin.y + floorPlan.depth / 2,
		});
		return {
			x: viewport.width / 2 - projected.x,
			y: viewport.height / 2 - projected.y,
		};
	},
);

export const followCamera = dual<
	(position: Position, z?: number) => (self: Position) => Position,
	(self: Position, position: Position, z?: number) => Position
>(
	(arguments_) => arguments_.length >= 2 && typeof arguments_[1] === "object",
	(camera: Position, position: Position, z: number = 0): Position => {
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
	},
);

export const cameraFollowingPlayer = ({
	world,
	camera,
}: {
	readonly world: World;
	readonly camera: Position;
}): Position => {
	const playerEntity = playerEntityIn(world);
	if (playerEntity === undefined) return camera;
	const position = world.positions.get(playerEntity);
	const elevation = world.elevations.get(playerEntity);
	return position === undefined
		? camera
		: followCamera(camera, position, elevation?.z ?? groundElevation);
};
