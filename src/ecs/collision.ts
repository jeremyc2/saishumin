import { type Body, DecorationKinds, type Position } from "../model/component";
import type { EntityId } from "../model/entity-id";
import { entityTopElevation } from "./elevation";
import { groundElevation, type World } from "./world";

export const isSolidEntity = (world: World, entity: EntityId): boolean =>
	world.obstacles.has(entity) ||
	(world.decorations.has(entity) &&
		world.decorations.get(entity)?.kind !== DecorationKinds.Rug);

export const overlaps = (
	position: Position,
	body: Body,
	otherPosition: Position,
	otherBody: Body,
): boolean =>
	Math.abs(position.x - otherPosition.x) < (body.width + otherBody.width) / 2 &&
	Math.abs(position.y - otherPosition.y) < (body.depth + otherBody.depth) / 2;

export const isPositionInsideRoom = (
	world: World,
	position: Position,
): boolean =>
	position.x >= 0 &&
	position.x <= world.floorPlan.width &&
	position.y >= 0 &&
	position.y <= world.floorPlan.depth;

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
	if (!isPositionInsideRoom(world, position)) return Number.NEGATIVE_INFINITY;

	let surface = groundElevation;
	for (const [entity] of world.obstacles) {
		const obstaclePosition = world.positions.get(entity);
		const obstacleBody = world.bodies.get(entity);
		if (
			obstaclePosition !== undefined &&
			obstacleBody !== undefined &&
			overlaps(position, body, obstaclePosition, obstacleBody)
		) {
			surface = Math.max(surface, entityTopElevation(world, entity));
		}
	}
	return surface;
};
