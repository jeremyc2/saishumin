import type { Body, Position } from "../model/component";
import { groundElevation, roomDepth, roomWidth, type World } from "./world";

export const overlaps = (
	position: Position,
	body: Body,
	otherPosition: Position,
	otherBody: Body,
): boolean =>
	Math.abs(position.x - otherPosition.x) < (body.width + otherBody.width) / 2 &&
	Math.abs(position.y - otherPosition.y) < (body.depth + otherBody.depth) / 2;

export const isPositionInsideRoom = (position: Position): boolean =>
	position.x >= 0 &&
	position.x <= roomWidth &&
	position.y >= 0 &&
	position.y <= roomDepth;

/**
 * Uses the body's full horizontal footprint rather than only its center or foot
 * point. Otherwise, a body can descend into a gap narrower than itself even
 * though it intersects the surfaces on either side. Once the entire footprint
 * clears a ledge, the lower surface naturally takes over and the body can fall.
 */
export const surfaceAt = (
	world: World,
	position: Position,
	body: Body,
): number => {
	if (!isPositionInsideRoom(position)) return Number.NEGATIVE_INFINITY;

	let surface = groundElevation;
	for (const [entity, obstacle] of world.obstacles) {
		const obstaclePosition = world.positions.get(entity);
		const obstacleBody = world.bodies.get(entity);
		if (
			obstaclePosition !== undefined &&
			obstacleBody !== undefined &&
			overlaps(position, body, obstaclePosition, obstacleBody)
		) {
			surface = Math.max(surface, obstacle.height);
		}
	}
	return surface;
};
