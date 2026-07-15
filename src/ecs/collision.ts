import { type Body, DecorationKinds, type Position } from "../model/component";
import type { EntityId } from "../model/entity-id";
import { bodyBoundsOverlap, entityTopElevation } from "./elevation";
import { groundElevation, obstacleHeightTolerance, type World } from "./world";

export const isSolidEntity = (world: World, entity: EntityId): boolean =>
	world.obstacles.has(entity) ||
	(world.decorations.has(entity) &&
		world.decorations.get(entity)?.kind !== DecorationKinds.Rug);

export const overlaps = (
	position: Position,
	body: Body,
	otherPosition: Position,
	otherBody: Body,
): boolean => bodyBoundsOverlap(position, body, otherPosition, otherBody);

export const isPositionInsideRoom = (
	world: World,
	position: Position,
): boolean =>
	position.x >= world.floorOrigin.x &&
	position.x <= world.floorOrigin.x + world.floorPlan.width &&
	position.y >= world.floorOrigin.y &&
	position.y <= world.floorOrigin.y + world.floorPlan.depth;

export type SupportSurface = {
	readonly elevation: number;
	readonly entity: EntityId | null;
};

export const supportSurfaceAt = (
	world: World,
	position: Position,
	body: Body,
	maximumElevation = Number.POSITIVE_INFINITY,
): SupportSurface => {
	if (!isPositionInsideRoom(world, position))
		return { elevation: Number.NEGATIVE_INFINITY, entity: null };

	let support: SupportSurface = {
		elevation: groundElevation,
		entity: null,
	};
	for (const [entity] of world.obstacles) {
		const obstaclePosition = world.positions.get(entity);
		const obstacleBody = world.bodies.get(entity);
		const topElevation = entityTopElevation(world, entity);
		if (
			obstaclePosition !== undefined &&
			obstacleBody !== undefined &&
			topElevation <= maximumElevation + obstacleHeightTolerance &&
			topElevation > support.elevation &&
			overlaps(position, body, obstaclePosition, obstacleBody)
		) {
			support = { elevation: topElevation, entity };
		}
	}
	return support;
};

/**
 * Uses the body's full horizontal bounds rather than only its center or wheel
 * contact point. Otherwise, a body can descend into a gap narrower than itself
 * even though it intersects the surfaces on either side. Once the entire body
 * clears a ledge, the lower surface naturally takes over and the body can fall.
 */
export const surfaceAt = (
	world: World,
	position: Position,
	body: Body,
	maximumElevation = Number.POSITIVE_INFINITY,
): number =>
	supportSurfaceAt(world, position, body, maximumElevation).elevation;
